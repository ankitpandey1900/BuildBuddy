use std::collections::BTreeMap;
use rusqlite::{params, Connection, Result};

use crate::diagram::model::{
    node_size_for_kind, DiagramConfidence, DiagramEdge, DiagramGroup, DiagramModel, DiagramNode,
    DiagramNodeKind, DiagramReport, DroppedEdge, NodeMetrics, RelationshipType, DiagramType,
};

/// Builds an architecture overview diagram (grouped by module/layer) from SQLite records.
pub fn build_architecture_overview_diagram(
    conn: &Connection,
    project_id: i64,
) -> Result<DiagramReport> {
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

    let mut nodes: Vec<DiagramNode> = Vec::new();
    let mut edges: Vec<DiagramEdge> = Vec::new();
    let mut dropped_edges: Vec<DroppedEdge> = Vec::new();
    let mut groups_map: BTreeMap<String, DiagramGroup> = BTreeMap::new();

    // 2. Query architectural modules
    let mut mod_stmt = conn.prepare(
        "SELECT id, name, root_directory, layer, file_count, cohesion_score
         FROM modules
         WHERE project_id = ?1
         ORDER BY root_directory ASC",
    )?;

    let (mod_w, mod_h) = node_size_for_kind(&DiagramNodeKind::Module);
    let mut module_roots: Vec<String> = Vec::new();

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
        let (_mid, name, root_dir, layer, file_count, _cohesion) = r?;
        module_roots.push(root_dir.clone());
        let layer_group_id = format!("group:layer:{}", layer);

        groups_map.entry(layer_group_id.clone()).or_insert_with(|| DiagramGroup {
            id: layer_group_id.clone(),
            label: format!("{} Layer", layer),
            parent_group: None,
            collapsed: false,
        });

        nodes.push(DiagramNode {
            id: format!("module:{}", root_dir),
            kind: DiagramNodeKind::Module,
            label: format!("{} ({} files)", name, file_count),
            group_id: Some(layer_group_id),
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

    // 3. Query entry points
    let mut ep_stmt = conn.prepare(
        "SELECT id, name, entry_type, file_path, start_line, end_line, confidence, source_evidence_id
         FROM entry_points
         WHERE project_id = ?1
         ORDER BY file_path ASC, start_line ASC",
    )?;

    let (comp_w, comp_h) = node_size_for_kind(&DiagramNodeKind::Component);
    let ep_rows = ep_stmt.query_map(params![project_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, i64>(4)? as usize,
            row.get::<_, i64>(5)? as usize,
            row.get::<_, String>(6)?,
            row.get::<_, Option<i64>>(7)?,
        ))
    })?;

    for r in ep_rows {
        let (_epid, name, entry_type, file_path, start_line, end_line, conf_str, ev_id_opt) = r?;
        let norm_path = file_path.replace('\\', "/");
        let ep_node_id = format!("entry_point:{}", norm_path);

        // Map to containing module if available
        let mut target_mod_id: Option<String> = None;
        for root in &module_roots {
            let norm_root = root.replace('\\', "/");
            if norm_root == "." || norm_path.starts_with(&format!("{}/", norm_root)) || norm_path == norm_root {
                target_mod_id = Some(format!("module:{}", root));
                break;
            }
        }

        nodes.push(DiagramNode {
            id: ep_node_id.clone(),
            kind: DiagramNodeKind::Component,
            label: format!("{}: {}", entry_type, name),
            group_id: None,
            width: comp_w,
            height: comp_h,
            source_ref: Some(crate::diagram::model::SourceRef {
                file_path: norm_path.clone(),
                start_line,
                end_line,
            }),
            metrics: None,
        });

        if let Some(mod_id) = target_mod_id {
            if let Some(ev_id) = ev_id_opt {
                if let Some(ev_key) = valid_evidence.get(&ev_id) {
                    let conf = DiagramConfidence::from_str(&conf_str);
                    edges.push(DiagramEdge {
                        id: format!("edge:entry:{}:{}", ep_node_id, mod_id),
                        from: ep_node_id.clone(),
                        to: mod_id,
                        relationship: RelationshipType::Entry,
                        confidence: conf,
                        evidence_id: ev_id,
                        evidence_key: ev_key.clone(),
                        label: Some(format!("starts {}", name)),
                    });
                } else {
                    dropped_edges.push(DroppedEdge {
                        from: ep_node_id,
                        to: mod_id,
                        relationship: "entry".to_string(),
                        reason: "evidence_id not in source_evidence".to_string(),
                    });
                }
            }
        }
    }

    // 4. Query call relationships (call edges between modules/externals)
    let mut call_stmt = conn.prepare(
        "SELECT cr.id, cr.file_id, f.relative_path, cr.caller_symbol_id, cs.stable_id,
                cr.callee_symbol_id, cr.callee_name, cr.resolution_status, cr.source_evidence_id
         FROM call_relationships cr
         JOIN files f ON cr.file_id = f.id
         LEFT JOIN symbols cs ON cr.caller_symbol_id = cs.id
         WHERE cr.project_id = ?1
         ORDER BY f.relative_path ASC, cr.id ASC",
    )?;

    let call_rows = call_stmt.query_map(params![project_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, i64>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<i64>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<i64>>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, i64>(8)?,
        ))
    })?;

    for r in call_rows {
        let (_cid, _fid, src_path, _caller_id, caller_stable_id, _callee_id, callee_name, res_status, ev_id) = r?;
        let src_norm = src_path.replace('\\', "/");

        // Determine from module
        let mut from_mod = "module:root".to_string();
        for root in &module_roots {
            let norm_root = root.replace('\\', "/");
            if norm_root == "." || src_norm.starts_with(&format!("{}/", norm_root)) || src_norm == norm_root {
                from_mod = format!("module:{}", root);
                break;
            }
        }

        let to_target = format!("external:{}", callee_name);

        let ev_key = match valid_evidence.get(&ev_id) {
            Some(k) => k.clone(),
            None => {
                dropped_edges.push(DroppedEdge {
                    from: from_mod,
                    to: to_target,
                    relationship: "call".to_string(),
                    reason: "evidence_id not in source_evidence".to_string(),
                });
                continue;
            }
        };

        let conf = DiagramConfidence::from_str(&res_status);
        let caller_ident = caller_stable_id.unwrap_or_else(|| src_norm.clone());
        let edge_id = format!("edge:call:{}:{}:{}", from_mod, caller_ident, callee_name);

        edges.push(DiagramEdge {
            id: edge_id,
            from: from_mod,
            to: to_target,
            relationship: RelationshipType::Call,
            confidence: conf,
            evidence_id: ev_id,
            evidence_key: ev_key,
            label: Some(format!("calls {}", callee_name)),
        });
    }

    // 5. Query manifest dependencies (declared_dependency)
    let mut dep_stmt = conn.prepare(
        "SELECT id, package_name, version_spec, dependency_type, source_evidence_id
         FROM manifest_dependencies
         WHERE project_id = ?1
         ORDER BY package_name ASC",
    )?;

    let (ext_w, ext_h) = node_size_for_kind(&DiagramNodeKind::External);
    let dep_rows = dep_stmt.query_map(params![project_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, Option<i64>>(4)?,
        ))
    })?;

    for r in dep_rows {
        let (_dep_id, pkg_name, ver_spec, dep_type, ev_id_opt) = r?;
        let ext_node_id = format!("external:{}", pkg_name);

        nodes.push(DiagramNode {
            id: ext_node_id.clone(),
            kind: DiagramNodeKind::External,
            label: format!("{} ({})", pkg_name, ver_spec.as_deref().unwrap_or("*")),
            group_id: None,
            width: ext_w,
            height: ext_h,
            source_ref: None,
            metrics: None,
        });

        if let Some(ev_id) = ev_id_opt {
            if let Some(ev_key) = valid_evidence.get(&ev_id) {
                edges.push(DiagramEdge {
                    id: format!("edge:declared:{}:{}", pkg_name, dep_type),
                    from: "module:root".to_string(),
                    to: ext_node_id,
                    relationship: RelationshipType::DeclaredDependency,
                    confidence: DiagramConfidence::Confirmed,
                    evidence_id: ev_id,
                    evidence_key: ev_key.clone(),
                    label: Some(format!("declared ({})", dep_type)),
                });
            } else {
                dropped_edges.push(DroppedEdge {
                    from: "module:root".to_string(),
                    to: ext_node_id,
                    relationship: "declared_dependency".to_string(),
                    reason: "evidence_id not in source_evidence".to_string(),
                });
            }
        }
    }

    // Deterministic deduplication of nodes and sorting
    let mut unique_nodes: BTreeMap<String, DiagramNode> = BTreeMap::new();
    for n in nodes {
        unique_nodes.entry(n.id.clone()).or_insert(n);
    }
    let mut sorted_nodes: Vec<DiagramNode> = unique_nodes.into_values().collect();
    sorted_nodes.sort_by(|a, b| a.id.cmp(&b.id));

    edges.sort_by(|a, b| a.id.cmp(&b.id));
    let mut groups: Vec<DiagramGroup> = groups_map.into_values().collect();
    groups.sort_by(|a, b| a.id.cmp(&b.id));

    let model = DiagramModel {
        diagram_type: DiagramType::ArchitectureOverview,
        nodes: sorted_nodes,
        edges,
        groups,
    };

    Ok(DiagramReport {
        model,
        dropped_edges,
    })
}
