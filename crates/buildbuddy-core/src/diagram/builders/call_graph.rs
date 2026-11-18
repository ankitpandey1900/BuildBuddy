use std::collections::{BTreeMap, HashSet};
use rusqlite::{params, Connection, Result};

use crate::diagram::model::{
    node_size_for_kind, DiagramConfidence, DiagramEdge, DiagramGroup, DiagramModel, DiagramNode,
    DiagramNodeKind, DiagramReport, DiagramType, DroppedEdge, NodeMetrics, RelationshipType,
    SourceRef,
};

/// Builds an interactive function call graph from SQLite call relationships.
pub fn build_call_graph(conn: &Connection, project_id: i64) -> Result<DiagramReport> {
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

    // 2. Query all defined functions for the project
    let mut func_stmt = conn.prepare(
        "SELECT f.id, f.file_id, files.relative_path, f.symbol_id, s.name, s.qualified_name,
                f.cyclomatic_complexity, s.source_evidence_id,
                COALESCE(e.start_line, 1), COALESCE(e.end_line, 1)
         FROM functions f
         JOIN symbols s ON f.symbol_id = s.id
         JOIN files ON f.file_id = files.id
         LEFT JOIN source_evidence e ON s.source_evidence_id = e.id
         WHERE f.project_id = ?1
         ORDER BY s.qualified_name ASC",
    )?;

    let mut nodes: Vec<DiagramNode> = Vec::new();
    let mut known_nodes: HashSet<String> = HashSet::new();
    let mut groups_set: BTreeMap<String, DiagramGroup> = BTreeMap::new();
    let (comp_w, comp_h) = node_size_for_kind(&DiagramNodeKind::Component);

    let func_rows = func_stmt.query_map(params![project_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i64>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, i64>(6)? as usize,
            row.get::<_, Option<i64>>(7)?,
            row.get::<_, i64>(8)? as usize,
            row.get::<_, i64>(9)? as usize,
        ))
    })?;

    for r in func_rows {
        let (
            _fid,
            _file_id,
            rel_path,
            _sym_id,
            name,
            qual_name,
            complexity,
            _ev_id,
            start_line,
            end_line,
        ) = r?;

        let norm_path = rel_path.replace('\\', "/");
        let node_id = if qual_name.is_empty() {
            format!("fn:{}:{}", norm_path, name)
        } else {
            format!("fn:{}", qual_name)
        };

        // Group by enclosing file
        let group_id = format!("group:file:{}", norm_path);
        groups_set.entry(group_id.clone()).or_insert_with(|| DiagramGroup {
            id: group_id.clone(),
            label: norm_path.clone(),
            parent_group: None,
            collapsed: false,
        });

        if known_nodes.insert(node_id.clone()) {
            nodes.push(DiagramNode {
                id: node_id,
                kind: DiagramNodeKind::Component,
                label: name,
                group_id: Some(group_id),
                width: comp_w,
                height: comp_h,
                source_ref: Some(SourceRef {
                    file_path: norm_path,
                    start_line,
                    end_line,
                }),
                metrics: Some(NodeMetrics {
                    line_count: None,
                    function_count: None,
                    class_count: None,
                    import_count: None,
                    complexity: Some(complexity),
                }),
            });
        }
    }

    // 3. Query all call relationships
    let mut call_stmt = conn.prepare(
        "SELECT c.id, c.file_id, f.relative_path, c.caller_symbol_id, cs.name, cs.qualified_name,
                c.callee_symbol_id, target_s.name, target_s.qualified_name, c.callee_name,
                c.resolution_status, c.is_dynamic, c.source_evidence_id
         FROM call_relationships c
         JOIN files f ON c.file_id = f.id
         LEFT JOIN symbols cs ON c.caller_symbol_id = cs.id
         LEFT JOIN symbols target_s ON c.callee_symbol_id = target_s.id
         WHERE c.project_id = ?1
         ORDER BY c.id ASC",
    )?;

    let call_rows = call_stmt.query_map(params![project_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<i64>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<i64>>(6)?,
            row.get::<_, Option<String>>(7)?,
            row.get::<_, Option<String>>(8)?,
            row.get::<_, String>(9)?,
            row.get::<_, String>(10)?,
            row.get::<_, i64>(11)?,
            row.get::<_, i64>(12)?,
        ))
    })?;

    let mut edges: Vec<DiagramEdge> = Vec::new();
    let mut dropped_edges: Vec<DroppedEdge> = Vec::new();
    let mut seen_edge_ids: HashSet<String> = HashSet::new();

    for r in call_rows {
        let (
            _call_id,
            _fid,
            caller_path,
            _caller_sym_id,
            caller_name,
            caller_qual,
            _callee_sym_id,
            _target_name,
            target_qual,
            callee_name,
            resolution_status,
            is_dynamic,
            ev_id,
        ) = r?;

        let norm_caller_path = caller_path.replace('\\', "/");
        let from_node_id = match (caller_qual, caller_name) {
            (Some(q), _) if !q.is_empty() => format!("fn:{}", q),
            (_, Some(n)) if !n.is_empty() => format!("fn:{}:{}", norm_caller_path, n),
            _ => format!("file:{}", norm_caller_path),
        };

        // If caller node was not in `functions` table (e.g. file root), add a placeholder node
        if known_nodes.insert(from_node_id.clone()) {
            nodes.push(DiagramNode {
                id: from_node_id.clone(),
                kind: DiagramNodeKind::File,
                label: norm_caller_path.clone(),
                group_id: None,
                width: comp_w,
                height: comp_h,
                source_ref: Some(SourceRef {
                    file_path: norm_caller_path.clone(),
                    start_line: 1,
                    end_line: 1,
                }),
                metrics: None,
            });
        }

        let to_node_id = match target_qual {
            Some(tq) if !tq.is_empty() => format!("fn:{}", tq),
            _ => format!("fn:unresolved:{}", callee_name),
        };

        // If callee node is not yet known, add a component node for it
        if known_nodes.insert(to_node_id.clone()) {
            nodes.push(DiagramNode {
                id: to_node_id.clone(),
                kind: if to_node_id.starts_with("fn:unresolved:") {
                    DiagramNodeKind::External
                } else {
                    DiagramNodeKind::Component
                },
                label: callee_name.clone(),
                group_id: None,
                width: comp_w,
                height: comp_h,
                source_ref: None,
                metrics: None,
            });
        }

        // Validate source evidence
        if let Some(ev_key) = valid_evidence.get(&ev_id) {
            let edge_id = format!("edge:call:{}:{}", from_node_id, to_node_id);
            if seen_edge_ids.insert(edge_id.clone()) {
                let conf = DiagramConfidence::from_str(&resolution_status);
                let label = if is_dynamic != 0 {
                    Some("calls [dynamic]".to_string())
                } else {
                    Some("calls".to_string())
                };

                edges.push(DiagramEdge {
                    id: edge_id,
                    from: from_node_id,
                    to: to_node_id,
                    relationship: RelationshipType::Call,
                    confidence: conf,
                    evidence_id: ev_id,
                    evidence_key: ev_key.clone(),
                    label,
                });
            }
        } else {
            dropped_edges.push(DroppedEdge {
                from: from_node_id,
                to: to_node_id,
                relationship: "call".to_string(),
                reason: format!("evidence_id {} does not exist in source_evidence table", ev_id),
            });
        }
    }

    // Deterministic sorting
    nodes.sort_by(|a, b| a.id.cmp(&b.id));
    edges.sort_by(|a, b| a.id.cmp(&b.id));
    let groups: Vec<DiagramGroup> = groups_set.into_values().collect();

    Ok(DiagramReport {
        model: DiagramModel {
            diagram_type: DiagramType::CallGraph,
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
    fn test_call_graph_empty_project() {
        let conn = open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, root_path) VALUES (1, 'p', '/p')",
            [],
        )
        .unwrap();

        let report = build_call_graph(&conn, 1).unwrap();
        assert_eq!(report.model.diagram_type, DiagramType::CallGraph);
        assert!(report.model.nodes.is_empty());
        assert!(report.model.edges.is_empty());
        assert!(report.dropped_edges.is_empty());
    }

    #[test]
    fn test_call_graph_with_valid_evidence() {
        let conn = open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, root_path) VALUES (1, 'p', '/p')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO files (id, project_id, relative_path, file_name, size_bytes, content_hash, status)
             VALUES (1, 1, 'src/main.ts', 'main.ts', 100, 'h1', 'parsed')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO source_evidence (id, project_id, file_path, start_line, end_line, start_column, end_column, snippet, confidence, evidence_type)
             VALUES (1, 1, 'src/main.ts', 10, 10, 0, 0, 'call', 'confirmed', 'call_site')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO symbols (id, project_id, file_id, stable_id, name, qualified_name, kind, source_evidence_id)
             VALUES (1, 1, 1, 's1', 'run', 'main.run', 'function', 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO functions (id, project_id, file_id, symbol_id, name, cyclomatic_complexity, source_evidence_id)
             VALUES (1, 1, 1, 1, 'run', 3, 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO call_relationships (id, project_id, file_id, caller_symbol_id, callee_symbol_id, callee_name, resolution_status, is_dynamic, source_evidence_id)
             VALUES (1, 1, 1, 1, NULL, 'processData', 'confirmed', 0, 1)",
            [],
        )
        .unwrap();

        let report = build_call_graph(&conn, 1).unwrap();
        assert_eq!(report.model.diagram_type, DiagramType::CallGraph);
        assert_eq!(report.model.edges.len(), 1);
        assert_eq!(report.model.edges[0].from, "fn:main.run");
        assert_eq!(report.model.edges[0].to, "fn:unresolved:processData");
        assert_eq!(report.model.edges[0].relationship, RelationshipType::Call);
        assert_eq!(report.model.edges[0].confidence, DiagramConfidence::Confirmed);
        assert!(report.dropped_edges.is_empty());
    }
}
