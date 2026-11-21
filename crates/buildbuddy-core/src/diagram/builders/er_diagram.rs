use std::collections::{BTreeMap, HashSet};
use rusqlite::{params, Connection, Result};

use crate::diagram::model::{
    node_size_for_kind, DiagramConfidence, DiagramEdge, DiagramGroup, DiagramModel, DiagramNode,
    DiagramNodeKind, DiagramReport, DiagramType, DroppedEdge, NodeMetrics, RelationshipType,
    SourceRef,
};

/// Helper to parse a referenced table name from a SQL field line containing REFERENCES
fn parse_referenced_table(line: &str) -> Option<String> {
    let upper = line.to_ascii_uppercase();
    let ref_idx = upper.find("REFERENCES")?;
    let after_ref = line[ref_idx + "REFERENCES".len()..].trim_start();
    let target_name: String = after_ref
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '"' || *c == '`')
        .collect();
    let cleaned = target_name.trim_matches(|c| c == '"' || c == '`').trim();
    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned.to_string())
    }
}

/// Builds an Entity-Relationship (ER) diagram from detected database tables and fields.
pub fn build_er_diagram(conn: &Connection, project_id: i64) -> Result<DiagramReport> {
    // 1. Fetch valid evidence IDs and metadata for validation
    let mut valid_evidence_stmt = conn.prepare(
        "SELECT id, file_path, start_line, end_line, evidence_type FROM source_evidence WHERE project_id = ?1",
    )?;
    let mut valid_evidence: BTreeMap<i64, String> = BTreeMap::new();
    let ev_rows = valid_evidence_stmt.query_map(params![project_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)? as usize,
            row.get::<_, i64>(3)? as usize,
            row.get::<_, String>(4)?,
        ))
    })?;
    for r in ev_rows {
        let (eid, fp, sl, el, et) = r?;
        let norm_fp = fp.replace('\\', "/");
        let key = format!("{}:{}-{}:{}", norm_fp, sl, el, et);
        valid_evidence.insert(eid, key);
    }

    // 2. Query all database tables
    let mut table_stmt = conn.prepare(
        "SELECT t.id, t.name, t.file_path, t.start_line, t.end_line, t.confidence,
                t.source_evidence_id, COALESCE(se.snippet, '')
         FROM database_tables t
         LEFT JOIN source_evidence se ON t.source_evidence_id = se.id
         WHERE t.project_id = ?1
         ORDER BY t.name ASC",
    )?;

    let mut nodes: Vec<DiagramNode> = Vec::new();
    let mut known_tables: HashSet<String> = HashSet::new();
    let mut groups_set: BTreeMap<String, DiagramGroup> = BTreeMap::new();
    let (cls_w, _cls_h) = node_size_for_kind(&DiagramNodeKind::Class);

    struct TableRow {
        id: i64,
        name: String,
        file_path: String,
        start_line: usize,
        end_line: usize,
        snippet: String,
        _evidence_id: i64,
    }

    let mut table_rows: Vec<TableRow> = Vec::new();
    let t_rows = table_stmt.query_map(params![project_id], |row| {
        Ok(TableRow {
            id: row.get(0)?,
            name: row.get(1)?,
            file_path: row.get(2)?,
            start_line: row.get::<_, i64>(3)? as usize,
            end_line: row.get::<_, i64>(4)? as usize,
            snippet: row.get(7)?,
            _evidence_id: row.get::<_, Option<i64>>(6)?.unwrap_or(0),
        })
    })?;

    for r in t_rows {
        let table = r?;
        known_tables.insert(table.name.clone());
        table_rows.push(table);
    }

    let mut edges: Vec<DiagramEdge> = Vec::new();
    let mut dropped_edges: Vec<DroppedEdge> = Vec::new();
    let mut seen_edge_ids: HashSet<String> = HashSet::new();

    // 3. For each table, query fields and create nodes + FK edges
    for table in &table_rows {
        let norm_path = table.file_path.replace('\\', "/");
        let node_id = format!("table:{}", table.name);

        let group_id = format!("group:schema:{}", norm_path);
        groups_set.entry(group_id.clone()).or_insert_with(|| DiagramGroup {
            id: group_id.clone(),
            label: norm_path.clone(),
            parent_group: None,
            collapsed: false,
        });

        let mut field_stmt = conn.prepare(
            "SELECT f.name, f.declared_type, f.is_primary_key, f.is_foreign_key, f.line_number, f.source_evidence_id
             FROM database_fields f
             WHERE f.table_id = ?1
             ORDER BY f.line_number ASC",
        )?;

        let fields = field_stmt.query_map(params![table.id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)? != 0,
                row.get::<_, i64>(3)? != 0,
                row.get::<_, i64>(4)? as usize,
                row.get::<_, Option<i64>>(5)?.unwrap_or(0),
            ))
        })?.collect::<Result<Vec<_>>>()?;

        let field_count = fields.len();
        let height = (field_count as f64 * 22.0 + 44.0).max(64.0);

        let member_fields: Vec<String> = fields
            .iter()
            .map(|(name, dtype, is_pk, is_fk, _, _)| {
                format!(
                    "{}|{}|{}",
                    if *is_pk { "PK" } else if *is_fk { "FK" } else { "-" },
                    name,
                    dtype
                )
            })
            .collect();

        nodes.push(DiagramNode {
            id: node_id.clone(),
            kind: DiagramNodeKind::Class,
            label: table.name.clone(),
            group_id: Some(group_id),
            width: cls_w,
            height,
            source_ref: Some(SourceRef {
                file_path: norm_path.clone(),
                start_line: table.start_line,
                end_line: table.end_line,
            }),
            metrics: Some(NodeMetrics {
                line_count: Some(table.end_line.saturating_sub(table.start_line) + 1),
                function_count: Some(field_count),
                class_count: None,
                import_count: None,
                complexity: None,
            }),
            members: member_fields,
        });

        // Check each field for FK
        for (field_name, dtype, _is_pk, is_fk, _line, ev_id) in &fields {
            if *is_fk {
                // Determine target table from snippet lines
                let mut target_table_opt = None;
                for line in table.snippet.lines() {
                    if line.contains(field_name.as_str()) && line.to_ascii_uppercase().contains("REFERENCES") {
                        if let Some(target) = parse_referenced_table(line) {
                            target_table_opt = Some(target);
                            break;
                        }
                    }
                }

                // If not found via SQL REFERENCES, check if declared_type matches another table/model (Prisma / ORM)
                if target_table_opt.is_none() {
                    let clean_target = dtype.trim_end_matches("[]").trim_end_matches('?').trim();
                    if !clean_target.is_empty() {
                        if let Some(matched) = table_rows.iter().find(|t| t.name.eq_ignore_ascii_case(clean_target)) {
                            target_table_opt = Some(matched.name.clone());
                        }
                    }
                }

                if let Some(target_table) = target_table_opt {
                    let to_node_id = format!("table:{}", target_table);

                    // If target table not in nodes yet (external or defined elsewhere), add placeholder
                    if known_tables.insert(target_table.clone()) {
                        nodes.push(DiagramNode {
                            id: to_node_id.clone(),
                            kind: DiagramNodeKind::Class,
                            label: target_table.clone(),
                            group_id: None,
                            width: cls_w,
                            height: 64.0,
                            source_ref: None,
                            metrics: None,
                            members: Vec::new(),
                        });
                    }

                    if let Some(ev_key) = valid_evidence.get(ev_id) {
                        let edge_id = format!("edge:fk:{}:{}:{}", node_id, to_node_id, field_name);
                        if seen_edge_ids.insert(edge_id.clone()) {
                            edges.push(DiagramEdge {
                                id: edge_id,
                                from: node_id.clone(),
                                to: to_node_id,
                                relationship: RelationshipType::DeclaredDependency,
                                confidence: DiagramConfidence::Static,
                                evidence_id: *ev_id,
                                evidence_key: ev_key.clone(),
                                label: Some(format!("FK ({})", field_name)),
                            });
                        }
                    } else {
                        dropped_edges.push(DroppedEdge {
                            from: node_id.clone(),
                            to: to_node_id,
                            relationship: "foreign_key".to_string(),
                            reason: format!("evidence_id {} not in source_evidence", ev_id),
                        });
                    }
                }
            }
        }
    }

    nodes.sort_by(|a, b| a.id.cmp(&b.id));
    edges.sort_by(|a, b| a.id.cmp(&b.id));
    let groups: Vec<DiagramGroup> = groups_set.into_values().collect();

    Ok(DiagramReport {
        model: DiagramModel {
            diagram_type: DiagramType::ErDiagram,
            nodes,
            edges,
            groups,
        },
        dropped_edges,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::connection::open_in_memory;
    use crate::store::migrations::run_migrations;

    #[test]
    fn test_parse_referenced_table() {
        assert_eq!(
            parse_referenced_table("team_id INTEGER REFERENCES teams(id)"),
            Some("teams".to_string())
        );
        assert_eq!(
            parse_referenced_table("  user_id INT REFERENCES \"users\" (id),"),
            Some("users".to_string())
        );
    }

    #[test]
    fn test_er_diagram_empty_project() {
        let conn = open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, root_path) VALUES (1, 'p', '/p')",
            [],
        )
        .unwrap();

        let report = build_er_diagram(&conn, 1).unwrap();
        assert_eq!(report.model.diagram_type, DiagramType::ErDiagram);
        assert!(report.model.nodes.is_empty());
        assert!(report.model.edges.is_empty());
    }

    #[test]
    fn test_er_diagram_with_fk() {
        let conn = open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, root_path) VALUES (1, 'p', '/p')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO source_evidence (id, project_id, file_path, start_line, end_line, start_column, end_column, snippet, confidence, evidence_type)
             VALUES (1, 1, 'schema.sql', 1, 5, 0, 0, 'CREATE TABLE users (id INT PRIMARY KEY);', 'static', 'source_pattern')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO source_evidence (id, project_id, file_path, start_line, end_line, start_column, end_column, snippet, confidence, evidence_type)
             VALUES (2, 1, 'schema.sql', 6, 10, 0, 0, 'CREATE TABLE orders (id INT, user_id INT REFERENCES users(id));', 'static', 'source_pattern')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO source_evidence (id, project_id, file_path, start_line, end_line, start_column, end_column, snippet, confidence, evidence_type)
             VALUES (3, 1, 'schema.sql', 7, 7, 0, 0, 'user_id INT REFERENCES users(id)', 'static', 'source_pattern')",
            [],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO database_tables (id, project_id, name, file_path, start_line, end_line, confidence, source_evidence_id)
             VALUES (1, 1, 'users', 'schema.sql', 1, 5, 'static', 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO database_tables (id, project_id, name, file_path, start_line, end_line, confidence, source_evidence_id)
             VALUES (2, 1, 'orders', 'schema.sql', 6, 10, 'static', 2)",
            [],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO database_fields (id, table_id, name, declared_type, is_primary_key, is_foreign_key, line_number, source_evidence_id)
             VALUES (1, 2, 'user_id', 'INTEGER', 0, 1, 7, 3)",
            [],
        )
        .unwrap();

        let report = build_er_diagram(&conn, 1).unwrap();
        assert_eq!(report.model.diagram_type, DiagramType::ErDiagram);
        assert_eq!(report.model.nodes.len(), 2);
        assert_eq!(report.model.edges.len(), 1);
        assert_eq!(report.model.edges[0].from, "table:orders");
        assert_eq!(report.model.edges[0].to, "table:users");
        assert_eq!(report.model.edges[0].relationship, RelationshipType::DeclaredDependency);
        assert_eq!(report.model.edges[0].confidence, DiagramConfidence::Static);
    }
}
