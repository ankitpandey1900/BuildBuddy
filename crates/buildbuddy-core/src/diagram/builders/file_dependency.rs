use std::collections::{BTreeMap, HashSet};
use rusqlite::{params, Connection, Result};

use crate::diagram::model::{
    node_size_for_kind, DiagramConfidence, DiagramEdge, DiagramGroup, DiagramModel, DiagramNode,
    DiagramNodeKind, DiagramReport, DroppedEdge, NodeMetrics, RelationshipType, SourceRef,
    DiagramType,
};

/// Builds a file dependency graph from SQLite records for a project.
pub fn build_file_dependency_diagram(conn: &Connection, project_id: i64) -> Result<DiagramReport> {
    // 1. Fetch valid evidence IDs and metadata for this project for quick O(1) membership check
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

    // 2. Query all files for this project
    let mut file_stmt = conn.prepare(
        "SELECT id, relative_path, file_name, line_count, function_count, class_count, import_count
         FROM files
         WHERE project_id = ?1 AND status != 'ignored'
         ORDER BY relative_path ASC",
    )?;

    let mut file_map: BTreeMap<i64, (String, String, usize, usize, usize, usize)> = BTreeMap::new();
    let mut nodes: Vec<DiagramNode> = Vec::new();
    let mut groups_set: BTreeMap<String, DiagramGroup> = BTreeMap::new();

    let file_rows = file_stmt.query_map(params![project_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i64>(3)? as usize,
            row.get::<_, i64>(4)? as usize,
            row.get::<_, i64>(5)? as usize,
            row.get::<_, i64>(6)? as usize,
        ))
    })?;

    for r in file_rows {
        let (fid, rel_path, file_name, line_count, func_count, class_count, imp_count) = r?;
        file_map.insert(
            fid,
            (rel_path.clone(), file_name.clone(), line_count, func_count, class_count, imp_count),
        );

        // Derive directory group
        let norm_path = rel_path.replace('\\', "/");
        let group_id = if let Some(last_slash) = norm_path.rfind('/') {
            let dir = &norm_path[..last_slash];
            let gid = format!("group:dir:{}", dir);
            groups_set.entry(gid.clone()).or_insert_with(|| DiagramGroup {
                id: gid.clone(),
                label: dir.to_string(),
                parent_group: None,
                collapsed: false,
            });
            Some(gid)
        } else {
            None
        };

        let (w, h) = node_size_for_kind(&DiagramNodeKind::File);
        nodes.push(DiagramNode {
            id: format!("file:{}", norm_path),
            kind: DiagramNodeKind::File,
            label: file_name,
            group_id,
            width: w,
            height: h,
            source_ref: Some(SourceRef {
                file_path: norm_path.clone(),
                start_line: 1,
                end_line: line_count.max(1),
            }),
            metrics: Some(NodeMetrics {
                line_count: Some(line_count),
                function_count: Some(func_count),
                class_count: Some(class_count),
                import_count: Some(imp_count),
                complexity: None,
            }),
        });
    }

    // 3. Query import edges
    let mut edge_stmt = conn.prepare(
        "SELECT e.id, e.source_file_id, sf.relative_path, e.target_file_id, tf.relative_path,
                e.target_module, e.imported_name, e.line_number, e.resolution_status, e.source_evidence_id
         FROM import_edges e
         JOIN files sf ON e.source_file_id = sf.id
         LEFT JOIN files tf ON e.target_file_id = tf.id
         WHERE e.project_id = ?1
         ORDER BY sf.relative_path ASC, e.line_number ASC, e.imported_name ASC",
    )?;

    let mut edges: Vec<DiagramEdge> = Vec::new();
    let mut dropped_edges: Vec<DroppedEdge> = Vec::new();
    let mut external_nodes_set: HashSet<String> = HashSet::new();

    let edge_rows = edge_stmt.query_map(params![project_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<i64>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, i64>(7)? as usize,
            row.get::<_, String>(8)?,
            row.get::<_, Option<i64>>(9)?,
        ))
    })?;

    for r in edge_rows {
        let (
            _eid,
            _src_fid,
            src_path,
            _tgt_fid,
            tgt_path,
            target_module,
            imported_name,
            line_num,
            res_status,
            evidence_id_opt,
        ) = r?;

        let src_norm = src_path.replace('\\', "/");
        let from_node_id = format!("file:{}", src_norm);

        let (to_node_id, confidence) = if res_status == "internal" {
            if let Some(tp) = tgt_path {
                let tp_norm = tp.replace('\\', "/");
                (format!("file:{}", tp_norm), DiagramConfidence::Static)
            } else {
                let ext_id = format!("external:{}", target_module);
                external_nodes_set.insert(target_module.clone());
                (ext_id, DiagramConfidence::Inferred)
            }
        } else {
            let ext_id = format!("external:{}", target_module);
            external_nodes_set.insert(target_module.clone());
            (ext_id, DiagramConfidence::Static)
        };

        // Evidence validation: MUST exist in source_evidence
        let (evidence_id, evidence_key) = match evidence_id_opt {
            Some(id) if valid_evidence.contains_key(&id) => (id, valid_evidence[&id].clone()),
            Some(_) => {
                dropped_edges.push(DroppedEdge {
                    from: from_node_id.clone(),
                    to: to_node_id.clone(),
                    relationship: "import".to_string(),
                    reason: "evidence_id does not exist in source_evidence table".to_string(),
                });
                continue;
            }
            None => {
                dropped_edges.push(DroppedEdge {
                    from: from_node_id.clone(),
                    to: to_node_id.clone(),
                    relationship: "import".to_string(),
                    reason: "Missing source_evidence_id on import edge".to_string(),
                });
                continue;
            }
        };

        let label = if imported_name.is_empty() {
            None
        } else {
            Some(format!("import {}", imported_name))
        };

        let edge_id = format!(
            "edge:import:{}:{}:{}:{}",
            from_node_id, to_node_id, imported_name, line_num
        );

        edges.push(DiagramEdge {
            id: edge_id,
            from: from_node_id,
            to: to_node_id,
            relationship: RelationshipType::Import,
            confidence,
            evidence_id,
            evidence_key,
            label,
        });
    }

    // 4. Add external nodes
    let (ext_w, ext_h) = node_size_for_kind(&DiagramNodeKind::External);
    for ext_mod in external_nodes_set {
        nodes.push(DiagramNode {
            id: format!("external:{}", ext_mod),
            kind: DiagramNodeKind::External,
            label: ext_mod,
            group_id: None,
            width: ext_w,
            height: ext_h,
            source_ref: None,
            metrics: None,
        });
    }

    // 5. Deterministic sorting
    nodes.sort_by(|a, b| a.id.cmp(&b.id));
    edges.sort_by(|a, b| a.id.cmp(&b.id));
    let mut groups: Vec<DiagramGroup> = groups_set.into_values().collect();
    groups.sort_by(|a, b| a.id.cmp(&b.id));

    let model = DiagramModel {
        diagram_type: DiagramType::FileDependency,
        nodes,
        edges,
        groups,
    };

    Ok(DiagramReport {
        model,
        dropped_edges,
    })
}

