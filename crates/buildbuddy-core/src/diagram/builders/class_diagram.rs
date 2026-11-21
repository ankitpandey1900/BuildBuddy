use std::collections::{BTreeMap, HashSet};
use rusqlite::{params, Connection, Result};

use crate::diagram::model::{
    node_size_for_kind, DiagramConfidence, DiagramEdge, DiagramGroup, DiagramModel, DiagramNode,
    DiagramNodeKind, DiagramReport, DroppedEdge, NodeMetrics, RelationshipType, SourceRef,
    DiagramType,
};

/// Builds a class diagram (OOP relationships) from SQLite records.
pub fn build_class_diagram(conn: &Connection, project_id: i64) -> Result<DiagramReport> {
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

    // 2. Query all classes in this project
    let mut class_stmt = conn.prepare(
        "SELECT c.id, c.file_id, f.relative_path, c.symbol_id, s.name, s.qualified_name,
                c.superclass_name, c.interfaces_json, c.properties_json, c.methods_json,
                COALESCE(c.source_evidence_id, s.source_evidence_id),
                COALESCE(e.start_line, 1), COALESCE(e.end_line, 1)
         FROM classes c
         JOIN symbols s ON c.symbol_id = s.id
         JOIN files f ON c.file_id = f.id
         LEFT JOIN source_evidence e ON s.source_evidence_id = e.id
         WHERE c.project_id = ?1
         ORDER BY s.qualified_name ASC",
    )?;

    let mut nodes: Vec<DiagramNode> = Vec::new();
    let mut known_class_names: HashSet<String> = HashSet::new();
    let mut class_rows_data: Vec<(String, String, Option<String>, Option<i64>)> = Vec::new();
    let mut groups_set: BTreeMap<String, DiagramGroup> = BTreeMap::new();
    let (cls_w, cls_h) = node_size_for_kind(&DiagramNodeKind::Class);

    let rows = class_stmt.query_map(params![project_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i64>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, String>(9)?,
            row.get::<_, Option<i64>>(10)?,
            row.get::<_, i64>(11)? as usize,
            row.get::<_, i64>(12)? as usize,
        ))
    })?;

    for r in rows {
        let (
            _cid,
            _fid,
            rel_path,
            _sym_id,
            name,
            qual_name,
            superclass_opt,
            _interfaces_json,
            props_json,
            methods_json,
            ev_id_opt,
            start_line,
            end_line,
        ) = r?;

        let norm_path = rel_path.replace('\\', "/");
        let node_id = format!("class:{}", qual_name);
        known_class_names.insert(name.clone());
        known_class_names.insert(qual_name.clone());

        // Derive group from directory
        let group_id = if let Some((gid, label)) = super::derive_dir_group(&norm_path) {
            groups_set.entry(gid.clone()).or_insert_with(|| DiagramGroup {
                id: gid.clone(),
                label,
                parent_group: None,
                collapsed: false,
            });
            Some(gid)
        } else {
            None
        };

        // Parse methods/props count
        let props_count: usize = serde_json::from_str::<serde_json::Value>(&props_json)
            .ok()
            .and_then(|v| v.as_array().map(|a| a.len()))
            .unwrap_or(0);
        let methods_count: usize = serde_json::from_str::<serde_json::Value>(&methods_json)
            .ok()
            .and_then(|v| v.as_array().map(|a| a.len()))
            .unwrap_or(0);

        let mut members = Vec::new();
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&props_json) {
            if let Some(arr) = v.as_array() {
                for p in arr.iter().take(6) {
                    if let Some(s) = p.as_str() {
                        members.push(format!("prop|{}", s));
                    }
                }
            }
        }
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&methods_json) {
            if let Some(arr) = v.as_array() {
                for m in arr.iter().take(6) {
                    if let Some(s) = m.as_str() {
                        members.push(format!("method|{}", s));
                    }
                }
            }
        }
        let dynamic_height = if members.is_empty() {
            cls_h
        } else {
            (cls_h + (members.len() as f64 * 18.0)).max(70.0)
        };

        nodes.push(DiagramNode {
            id: node_id.clone(),
            kind: DiagramNodeKind::Class,
            label: name.clone(),
            group_id,
            width: cls_w,
            height: dynamic_height,
            source_ref: Some(SourceRef {
                file_path: norm_path,
                start_line,
                end_line,
            }),
            metrics: Some(NodeMetrics {
                line_count: None,
                function_count: Some(methods_count),
                class_count: None,
                import_count: None,
                complexity: Some(props_count),
            }),
            members,
        });

        class_rows_data.push((node_id, name, superclass_opt, ev_id_opt));
    }

    let mut edges: Vec<DiagramEdge> = Vec::new();
    let mut dropped_edges: Vec<DroppedEdge> = Vec::new();

    // 3. Inheritance edges
    for (from_node_id, _class_name, superclass_opt, ev_id_opt) in class_rows_data {
        if let Some(super_name) = superclass_opt {
            let trimmed = super_name.trim();
            if !trimmed.is_empty() {
                let to_node_id = format!("class:{}", trimmed);

                // Add placeholder node if superclass is external/not yet in nodes
                if !known_class_names.contains(trimmed) {
                    nodes.push(DiagramNode {
                        id: to_node_id.clone(),
                        kind: DiagramNodeKind::Class,
                        label: trimmed.to_string(),
                        group_id: None,
                        width: cls_w,
                        height: cls_h,
                        source_ref: None,
                        metrics: None,
                        members: Vec::new(),
                    });
                    known_class_names.insert(trimmed.to_string());
                }

                match ev_id_opt {
                    Some(ev_id) if valid_evidence.contains_key(&ev_id) => {
                        edges.push(DiagramEdge {
                            id: format!("edge:inheritance:{}:{}", from_node_id, to_node_id),
                            from: from_node_id,
                            to: to_node_id,
                            relationship: RelationshipType::Inheritance,
                            confidence: DiagramConfidence::Confirmed,
                            evidence_id: ev_id,
                            evidence_key: valid_evidence[&ev_id].clone(),
                            label: Some("extends".to_string()),
                        });
                    }
                    Some(_) => {
                        dropped_edges.push(DroppedEdge {
                            from: from_node_id,
                            to: to_node_id,
                            relationship: "inheritance".to_string(),
                            reason: "evidence_id not in source_evidence".to_string(),
                        });
                    }
                    None => {
                        dropped_edges.push(DroppedEdge {
                            from: from_node_id,
                            to: to_node_id,
                            relationship: "inheritance".to_string(),
                            reason: "Missing source_evidence_id on inheritance edge".to_string(),
                        });
                    }
                }
            }
        }
    }

    // 4. Instantiation edges from class_instantiations
    let mut inst_stmt = conn.prepare(
        "SELECT ci.id, ci.file_id, sf.relative_path, ci.caller_symbol_id, cs.stable_id, cs.name, cs.qualified_name,
                ci.class_symbol_id, target_s.name, target_s.qualified_name, ci.class_name,
                ci.resolution_status, ci.source_evidence_id
         FROM class_instantiations ci
         JOIN files sf ON ci.file_id = sf.id
         LEFT JOIN symbols cs ON ci.caller_symbol_id = cs.id
         LEFT JOIN symbols target_s ON ci.class_symbol_id = target_s.id
         WHERE ci.project_id = ?1
         ORDER BY ci.id ASC",
    )?;

    let inst_rows = inst_stmt.query_map(params![project_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<i64>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, Option<i64>>(7)?,
            row.get::<_, Option<String>>(8)?,
            row.get::<_, Option<String>>(9)?,
            row.get::<_, String>(10)?,
            row.get::<_, String>(11)?,
            row.get::<_, Option<i64>>(12)?.unwrap_or(0),
        ))
    })?;

    for r in inst_rows {
        let (
            _inst_id,
            _fid,
            src_path,
            _caller_id,
            caller_stable_id,
            _caller_name,
            caller_qual,
            _target_sym_id,
            _target_name,
            target_qual,
            class_name,
            res_status,
            ev_id,
        ) = r?;

        let src_norm = src_path.replace('\\', "/");
        let from_ident = caller_qual.unwrap_or_else(|| src_norm.clone());
        let from_node_id = format!("class:{}", from_ident);

        // Ensure from_node_id exists in nodes
        if !known_class_names.contains(&from_ident) {
            nodes.push(DiagramNode {
                id: from_node_id.clone(),
                kind: DiagramNodeKind::Class,
                label: from_ident.clone(),
                group_id: None,
                width: cls_w,
                height: cls_h,
                source_ref: None,
                metrics: None,
                members: Vec::new(),
            });
            known_class_names.insert(from_ident.clone());
        }

        let target_ident = target_qual.unwrap_or(class_name);
        let to_node_id = format!("class:{}", target_ident);

        // Ensure to_node_id exists in nodes
        if !known_class_names.contains(&target_ident) {
            nodes.push(DiagramNode {
                id: to_node_id.clone(),
                kind: DiagramNodeKind::Class,
                label: target_ident.clone(),
                group_id: None,
                width: cls_w,
                height: cls_h,
                source_ref: None,
                metrics: None,
                members: Vec::new(),
            });
            known_class_names.insert(target_ident.clone());
        }

        let ev_key = match valid_evidence.get(&ev_id) {
            Some(k) => k.clone(),
            None => {
                dropped_edges.push(DroppedEdge {
                    from: from_node_id,
                    to: to_node_id,
                    relationship: "instantiation".to_string(),
                    reason: "evidence_id not in source_evidence".to_string(),
                });
                continue;
            }
        };

        let conf = DiagramConfidence::from_str(&res_status);
        let caller_ident = caller_stable_id.unwrap_or_else(|| from_node_id.clone());
        let edge_id = format!("edge:instantiation:{}:{}", caller_ident, to_node_id);

        edges.push(DiagramEdge {
            id: edge_id,
            from: from_node_id,
            to: to_node_id,
            relationship: RelationshipType::Instantiation,
            confidence: conf,
            evidence_id: ev_id,
            evidence_key: ev_key,
            label: Some(format!("new {}", target_ident)),
        });
    }

    // Deterministic deduplication and sorting
    let mut unique_nodes: BTreeMap<String, DiagramNode> = BTreeMap::new();
    for n in nodes {
        unique_nodes.entry(n.id.clone()).or_insert(n);
    }
    let mut sorted_nodes: Vec<DiagramNode> = unique_nodes.into_values().collect();
    sorted_nodes.sort_by(|a, b| a.id.cmp(&b.id));

    edges.sort_by(|a, b| a.id.cmp(&b.id));
    let mut groups: Vec<DiagramGroup> = groups_set.into_values().collect();
    groups.sort_by(|a, b| a.id.cmp(&b.id));

    let model = DiagramModel {
        diagram_type: DiagramType::ClassDiagram,
        nodes: sorted_nodes,
        edges,
        groups,
    };

    Ok(DiagramReport {
        model,
        dropped_edges,
    })
}

