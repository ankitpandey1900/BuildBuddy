use std::collections::{BTreeMap, HashSet};

use super::model::{
    node_size_for_kind, AggregatedEdge, CollapsedOverview, DiagramEdge, DiagramGroup, DiagramModel,
    DiagramNode, DiagramNodeKind, DrillDownResult, PROGRESSIVE_DISCLOSURE_THRESHOLD,
};

/// Evaluates if the diagram exceeds the progressive disclosure threshold.
/// If it does, returns a `CollapsedOverview` containing a module-level view with collapsed groups
/// and aggregated inter-module edges.
pub fn apply_progressive_disclosure(model: &DiagramModel) -> Option<CollapsedOverview> {
    if model.nodes.len() <= PROGRESSIVE_DISCLOSURE_THRESHOLD {
        return None;
    }

    Some(build_collapsed_overview(model))
}

/// Builds a collapsed overview for a model.
/// Groups become collapsed, and individual edges between groups are aggregated into `AggregatedEdge`s.
pub fn build_collapsed_overview(model: &DiagramModel) -> CollapsedOverview {
    // 1. Map each node ID to its containing group ID (or its own ID if no group).
    let mut node_to_group: BTreeMap<String, String> = BTreeMap::new();
    for node in &model.nodes {
        if let Some(gid) = &node.group_id {
            node_to_group.insert(node.id.clone(), gid.clone());
        } else {
            node_to_group.insert(node.id.clone(), node.id.clone());
        }
    }

    // 2. Mark all groups as collapsed
    let mut collapsed_groups: Vec<DiagramGroup> = model
        .groups
        .iter()
        .map(|g| DiagramGroup {
            id: g.id.clone(),
            label: g.label.clone(),
            parent_group: g.parent_group.clone(),
            collapsed: true,
        })
        .collect();
    collapsed_groups.sort_by(|a, b| a.id.cmp(&b.id));

    // 3. For the module-level overview nodes:
    // Create one representative node per group (or keep groups collapsed with representative module nodes)
    let mut overview_nodes: Vec<DiagramNode> = Vec::new();
    let mut seen_groups: HashSet<String> = HashSet::new();

    for group in &collapsed_groups {
        if seen_groups.insert(group.id.clone()) {
            let (w, h) = node_size_for_kind(&DiagramNodeKind::Module);
            overview_nodes.push(DiagramNode {
                id: group.id.clone(),
                kind: DiagramNodeKind::Module,
                label: group.label.clone(),
                group_id: group.parent_group.clone(),
                width: w,
                height: h,
                source_ref: None,
                metrics: None,
            });
        }
    }

    // Also include top-level nodes that don't belong to any group
    for node in &model.nodes {
        if node.group_id.is_none() {
            overview_nodes.push(node.clone());
        }
    }
    overview_nodes.sort_by(|a, b| a.id.cmp(&b.id));

    // 4. Aggregate edges between different groups/nodes
    // Group key: (from_group, to_group, relationship)
    let mut edge_groups: BTreeMap<(String, String, String), (Vec<String>, Vec<i64>, Vec<String>)> =
        BTreeMap::new();

    for edge in &model.edges {
        let from_target = node_to_group.get(&edge.from).cloned().unwrap_or_else(|| edge.from.clone());
        let to_target = node_to_group.get(&edge.to).cloned().unwrap_or_else(|| edge.to.clone());

        // Skip self-edges inside the same collapsed group for the overview
        if from_target == to_target {
            continue;
        }

        let key = (from_target, to_target, edge.relationship.as_str().to_string());
        let entry = edge_groups.entry(key).or_insert_with(|| (Vec::new(), Vec::new(), Vec::new()));
        entry.0.push(edge.id.clone());
        entry.1.push(edge.evidence_id);
        entry.2.push(edge.evidence_key.clone());
    }

    let mut aggregated_edges: Vec<AggregatedEdge> = Vec::new();
    let mut overview_edges: Vec<DiagramEdge> = Vec::new();

    for ((from, to, rel_str), (edge_ids, evidence_ids, evidence_keys)) in edge_groups {
        let rel = super::model::RelationshipType::from_str(&rel_str);
        let agg_id = format!("agg:{}:{}:{}", from, to, rel.as_str());

        // Overview diagram edge using representative evidence (the first one)
        let first_evidence = evidence_ids[0];
        let first_evidence_key = evidence_keys[0].clone();
        overview_edges.push(DiagramEdge {
            id: agg_id.clone(),
            from: from.clone(),
            to: to.clone(),
            relationship: rel.clone(),
            confidence: super::model::DiagramConfidence::Static,
            evidence_id: first_evidence,
            evidence_key: first_evidence_key,
            label: Some(format!("{} ({} links)", rel.as_str(), edge_ids.len())),
        });

        aggregated_edges.push(AggregatedEdge {
            id: agg_id,
            from,
            to,
            relationship: rel,
            edge_count: edge_ids.len(),
            underlying_edge_ids: edge_ids,
            evidence_ids,
            evidence_keys,
        });
    }

    overview_edges.sort_by(|a, b| a.id.cmp(&b.id));
    aggregated_edges.sort_by(|a, b| a.id.cmp(&b.id));

    let overview_model = DiagramModel {
        diagram_type: model.diagram_type.clone(),
        nodes: overview_nodes,
        edges: overview_edges,
        groups: collapsed_groups,
    };

    CollapsedOverview {
        model: overview_model,
        aggregated_edges,
        total_node_count: model.nodes.len(),
        threshold: PROGRESSIVE_DISCLOSURE_THRESHOLD,
    }
}

/// Drills down into a specific group, returning all nodes and internal/incident edges for that group.
pub fn drill_down(model: &DiagramModel, group_id: &str) -> DrillDownResult {
    // 1. Find all nodes belonging to this group
    let nodes: Vec<DiagramNode> = model
        .nodes
        .iter()
        .filter(|n| n.group_id.as_deref() == Some(group_id))
        .cloned()
        .collect();

    let node_ids: HashSet<String> = nodes.iter().map(|n| n.id.clone()).collect();

    // 2. Find all edges where both from and to are inside this group
    let mut edges: Vec<DiagramEdge> = model
        .edges
        .iter()
        .filter(|e| node_ids.contains(&e.from) && node_ids.contains(&e.to))
        .cloned()
        .collect();

    edges.sort_by(|a, b| a.id.cmp(&b.id));

    let mut sorted_nodes = nodes;
    sorted_nodes.sort_by(|a, b| a.id.cmp(&b.id));

    DrillDownResult {
        group_id: group_id.to_string(),
        nodes: sorted_nodes,
        edges,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::diagram::model::*;

    #[test]
    fn test_progressive_disclosure_threshold() {
        // Below threshold: None
        let mut nodes = Vec::new();
        for i in 0..100 {
            nodes.push(DiagramNode {
                id: format!("node:{}", i),
                kind: DiagramNodeKind::File,
                label: format!("file_{}.ts", i),
                group_id: Some("group:1".to_string()),
                width: 180.0,
                height: 40.0,
                source_ref: None,
                metrics: None,
            });
        }
        let model = DiagramModel {
            diagram_type: DiagramType::FileDependency,
            nodes,
            edges: vec![],
            groups: vec![DiagramGroup {
                id: "group:1".to_string(),
                label: "Group 1".to_string(),
                parent_group: None,
                collapsed: false,
            }],
        };

        assert!(apply_progressive_disclosure(&model).is_none());

        // Above threshold: Some(CollapsedOverview)
        let mut large_nodes = Vec::new();
        for i in 0..160 {
            let gid = if i < 80 { "group:1" } else { "group:2" };
            large_nodes.push(DiagramNode {
                id: format!("node:{}", i),
                kind: DiagramNodeKind::File,
                label: format!("file_{}.ts", i),
                group_id: Some(gid.to_string()),
                width: 180.0,
                height: 40.0,
                source_ref: None,
                metrics: None,
            });
        }

        let edges = vec![
            DiagramEdge {
                id: "e:1".to_string(),
                from: "node:1".to_string(),
                to: "node:85".to_string(),
                relationship: RelationshipType::Import,
                confidence: DiagramConfidence::Static,
                evidence_id: 101,
                evidence_key: "src/file_1.ts:1-1:import_stmt".to_string(),
                label: None,
            },
            DiagramEdge {
                id: "e:2".to_string(),
                from: "node:2".to_string(),
                to: "node:86".to_string(),
                relationship: RelationshipType::Import,
                confidence: DiagramConfidence::Static,
                evidence_id: 102,
                evidence_key: "src/file_2.ts:1-1:import_stmt".to_string(),
                label: None,
            },
            DiagramEdge {
                id: "e:internal".to_string(),
                from: "node:1".to_string(),
                to: "node:2".to_string(),
                relationship: RelationshipType::Import,
                confidence: DiagramConfidence::Static,
                evidence_id: 103,
                evidence_key: "src/file_1.ts:2-2:import_stmt".to_string(),
                label: None,
            },
        ];

        let large_model = DiagramModel {
            diagram_type: DiagramType::FileDependency,
            nodes: large_nodes,
            edges,
            groups: vec![
                DiagramGroup {
                    id: "group:1".to_string(),
                    label: "Group 1".to_string(),
                    parent_group: None,
                    collapsed: false,
                },
                DiagramGroup {
                    id: "group:2".to_string(),
                    label: "Group 2".to_string(),
                    parent_group: None,
                    collapsed: false,
                },
            ],
        };

        let overview = apply_progressive_disclosure(&large_model).expect("Should collapse");
        assert_eq!(overview.total_node_count, 160);
        assert_eq!(overview.threshold, 150);

        // Groups are collapsed
        for g in &overview.model.groups {
            assert!(g.collapsed);
        }

        // Check aggregated edges
        assert_eq!(overview.aggregated_edges.len(), 1);
        let agg = &overview.aggregated_edges[0];
        assert_eq!(agg.from, "group:1");
        assert_eq!(agg.to, "group:2");
        assert_eq!(agg.edge_count, 2);
        assert_eq!(agg.underlying_edge_ids, vec!["e:1", "e:2"]);
        assert_eq!(agg.evidence_ids, vec![101, 102]);

        // Drill down into group:1
        let drill = drill_down(&large_model, "group:1");
        assert_eq!(drill.group_id, "group:1");
        assert_eq!(drill.nodes.len(), 80);
        assert_eq!(drill.edges.len(), 1);
        assert_eq!(drill.edges[0].id, "e:internal");
    }
}

