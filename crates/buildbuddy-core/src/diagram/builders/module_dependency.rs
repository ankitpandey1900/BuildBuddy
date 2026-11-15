use std::collections::{BTreeMap, HashSet};
use rusqlite::{params, Connection, Result};

use crate::diagram::model::{
    node_size_for_kind, DiagramConfidence, DiagramEdge, DiagramGroup, DiagramModel, DiagramNode,
    DiagramNodeKind, DiagramReport, DroppedEdge, NodeMetrics, RelationshipType, DiagramType,
};

/// Builds a module dependency graph from SQLite records for a project.
pub fn build_module_dependency_diagram(conn: &Connection, project_id: i64) -> Result<DiagramReport> {
    // 1. Fetch valid evidence IDs and metadata for quick validation
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

    // 2. Fetch modules for this project
    let mut mod_stmt = conn.prepare(
        "SELECT id, name, root_directory, layer, file_count, cohesion_score
         FROM modules
         WHERE project_id = ?1
         ORDER BY root_directory ASC",
    )?;

    let mut module_list: Vec<(i64, String, String, String, usize, f64)> = Vec::new();
    let mod_rows = mod_stmt.query_map(params![project_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, i64>(4)? as usize,
            row.get::<_, f64>(5)?,
        ))
    })?;

    for r in mod_rows {
        module_list.push(r?);
    }

    // 3. Map each file to its containing module
    // If modules were stored, match by root_directory.
    let mut file_stmt = conn.prepare(
        "SELECT id, relative_path FROM files WHERE project_id = ?1 AND status != 'ignored'",
    )?;
    let files: Vec<(i64, String)> = file_stmt
        .query_map(params![project_id], |row| Ok((row.get(0)?, row.get(1)?)))?
        .filter_map(|r| r.ok())
        .collect();

    let mut file_to_module: BTreeMap<i64, String> = BTreeMap::new();

    if module_list.is_empty() {
        // Fallback: derive module from first directory segment of file path
        for (fid, path) in &files {
            let norm = path.replace('\\', "/");
            let mod_name = if let Some(slash_idx) = norm.find('/') {
                norm[..slash_idx].to_string()
            } else {
                "root".to_string()
            };
            file_to_module.insert(*fid, mod_name);
        }
    } else {
        // Match file path to longest matching module root_directory
        for (fid, path) in &files {
            let norm = path.replace('\\', "/");
            let mut best_match: Option<&str> = None;
            for (_mid, _name, root_dir, _layer, _fc, _coh) in &module_list {
                let norm_root = root_dir.replace('\\', "/");
                if norm_root == "." || norm.starts_with(&format!("{}/", norm_root)) || norm == norm_root {
                    if best_match.is_none() || norm_root.len() > best_match.unwrap().len() {
                        best_match = Some(root_dir.as_str());
                    }
                }
            }
            if let Some(matched) = best_match {
                file_to_module.insert(*fid, matched.to_string());
            } else {
                file_to_module.insert(*fid, "root".to_string());
            }
        }
    }

    // 4. Create module nodes
    let mut nodes: Vec<DiagramNode> = Vec::new();
    let mut seen_modules: HashSet<String> = HashSet::new();
    let (mod_w, mod_h) = node_size_for_kind(&DiagramNodeKind::Module);

    if !module_list.is_empty() {
        for (_mid, name, root_dir, layer, _file_count, _coh) in &module_list {
            let mod_id = format!("module:{}", root_dir);
            seen_modules.insert(root_dir.clone());
            nodes.push(DiagramNode {
                id: mod_id,
                kind: DiagramNodeKind::Module,
                label: format!("{} ({})", name, layer),
                group_id: Some(format!("layer:{}", layer)),
                width: mod_w,
                height: mod_h,
                source_ref: None,
                metrics: Some(NodeMetrics {
                    line_count: None,
                    function_count: None,
                    class_count: None,
                    import_count: None,
                    complexity: None,
                }),
            });
        }
    } else {
        // From fallback
        let mut fallback_counts: BTreeMap<String, usize> = BTreeMap::new();
        for m in file_to_module.values() {
            *fallback_counts.entry(m.clone()).or_insert(0) += 1;
        }
        for (m, _cnt) in fallback_counts {
            nodes.push(DiagramNode {
                id: format!("module:{}", m),
                kind: DiagramNodeKind::Module,
                label: m.clone(),
                group_id: None,
                width: mod_w,
                height: mod_h,
                source_ref: None,
                metrics: Some(NodeMetrics {
                    line_count: None,
                    function_count: None,
                    class_count: None,
                    import_count: None,
                    complexity: None,
                }),
            });
        }
    }

    // 5. Query import edges and map to module edges
    let mut edge_stmt = conn.prepare(
        "SELECT e.id, e.source_file_id, sf.relative_path, e.target_file_id, tf.relative_path,
                e.target_module, e.imported_name, e.line_number, e.resolution_status, e.source_evidence_id
         FROM import_edges e
         JOIN files sf ON e.source_file_id = sf.id
         LEFT JOIN files tf ON e.target_file_id = tf.id
         WHERE e.project_id = ?1
         ORDER BY sf.relative_path ASC, e.line_number ASC",
    )?;

    let mut edges: Vec<DiagramEdge> = Vec::new();
    let mut dropped_edges: Vec<DroppedEdge> = Vec::new();
    let mut external_nodes: HashSet<String> = HashSet::new();

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
            src_fid,
            _src_path,
            tgt_fid_opt,
            _tgt_path,
            target_module,
            imported_name,
            line_num,
            res_status,
            evidence_id_opt,
        ) = r?;

        let src_mod = file_to_module
            .get(&src_fid)
            .cloned()
            .unwrap_or_else(|| "root".to_string());
        let from_node_id = format!("module:{}", src_mod);

        let (to_node_id, confidence) = if res_status == "internal" {
            if let Some(tgt_fid) = tgt_fid_opt {
                let tgt_mod = file_to_module
                    .get(&tgt_fid)
                    .cloned()
                    .unwrap_or_else(|| "root".to_string());
                (format!("module:{}", tgt_mod), DiagramConfidence::Static)
            } else {
                let ext_id = format!("external:{}", target_module);
                external_nodes.insert(target_module.clone());
                (ext_id, DiagramConfidence::Inferred)
            }
        } else {
            let ext_id = format!("external:{}", target_module);
            external_nodes.insert(target_module.clone());
            (ext_id, DiagramConfidence::Static)
        };

        // Validate evidence_id
        let (evidence_id, evidence_key) = match evidence_id_opt {
            Some(id) if valid_evidence.contains_key(&id) => (id, valid_evidence[&id].clone()),
            Some(_) => {
                dropped_edges.push(DroppedEdge {
                    from: from_node_id,
                    to: to_node_id,
                    relationship: "import".to_string(),
                    reason: "evidence_id does not exist in source_evidence table".to_string(),
                });
                continue;
            }
            None => {
                dropped_edges.push(DroppedEdge {
                    from: from_node_id,
                    to: to_node_id,
                    relationship: "import".to_string(),
                    reason: "Missing source_evidence_id on import edge".to_string(),
                });
                continue;
            }
        };

        let edge_id = format!(
            "edge:module_import:{}:{}:{}:{}",
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
            label: if imported_name.is_empty() {
                None
            } else {
                Some(format!("import {}", imported_name))
            },
        });
    }

    // 6. External nodes
    let (ext_w, ext_h) = node_size_for_kind(&DiagramNodeKind::External);
    for ext_mod in external_nodes {
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

    // 7. Groups (by architectural layer)
    let mut layer_groups: BTreeMap<String, DiagramGroup> = BTreeMap::new();
    for (_, _, _, layer, _, _) in &module_list {
        let gid = format!("layer:{}", layer);
        layer_groups.entry(gid.clone()).or_insert_with(|| DiagramGroup {
            id: gid,
            label: format!("{} Layer", layer),
            parent_group: None,
            collapsed: false,
        });
    }

    nodes.sort_by(|a, b| a.id.cmp(&b.id));
    edges.sort_by(|a, b| a.id.cmp(&b.id));
    let mut groups: Vec<DiagramGroup> = layer_groups.into_values().collect();
    groups.sort_by(|a, b| a.id.cmp(&b.id));

    let model = DiagramModel {
        diagram_type: DiagramType::ModuleDependency,
        nodes,
        edges,
        groups,
    };

    Ok(DiagramReport {
        model,
        dropped_edges,
    })
}
