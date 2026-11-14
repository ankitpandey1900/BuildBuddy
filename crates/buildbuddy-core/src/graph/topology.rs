use std::collections::{HashMap, HashSet};

use super::model::{CircularDependencyCycle, ImportEdge, ResolutionStatus};

pub struct CycleDetector;

impl CycleDetector {
    pub fn find_circular_dependencies(edges: &[ImportEdge]) -> Vec<CircularDependencyCycle> {
        // Build adjacency list for internal edges only
        let mut adj: HashMap<String, HashSet<String>> = HashMap::new();
        let mut all_nodes = HashSet::new();

        for edge in edges {
            if edge.resolution_status == ResolutionStatus::Internal {
                if let Some(ref target) = edge.target_file_path {
                    // Skip self-imports if any (or track if needed)
                    adj.entry(edge.source_file_path.clone())
                        .or_default()
                        .insert(target.clone());
                    all_nodes.insert(edge.source_file_path.clone());
                    all_nodes.insert(target.clone());
                }
            }
        }

        let mut index = 0;
        let mut stack = Vec::new();
        let mut indices: HashMap<String, usize> = HashMap::new();
        let mut lowlink: HashMap<String, usize> = HashMap::new();
        let mut on_stack: HashSet<String> = HashSet::new();
        let mut sccs: Vec<Vec<String>> = Vec::new();

        for node in &all_nodes {
            if !indices.contains_key(node) {
                strongconnect(
                    node,
                    &adj,
                    &mut index,
                    &mut stack,
                    &mut indices,
                    &mut lowlink,
                    &mut on_stack,
                    &mut sccs,
                );
            }
        }

        let mut cycles = Vec::new();
        for mut scc in sccs {
            // A component is a cycle if it contains more than 1 node,
            // or 1 node with a self-loop.
            let is_cycle = if scc.len() > 1 {
                true
            } else if scc.len() == 1 {
                adj.get(&scc[0])
                    .map(|neighbors| neighbors.contains(&scc[0]))
                    .unwrap_or(false)
            } else {
                false
            };

            if is_cycle {
                scc.sort();
                cycles.push(CircularDependencyCycle { cycle_files: scc });
            }
        }

        // Sort cycles deterministically
        cycles.sort_by(|a, b| a.cycle_files.cmp(&b.cycle_files));
        cycles
    }
}

fn strongconnect(
    u: &str,
    adj: &HashMap<String, HashSet<String>>,
    index: &mut usize,
    stack: &mut Vec<String>,
    indices: &mut HashMap<String, usize>,
    lowlink: &mut HashMap<String, usize>,
    on_stack: &mut HashSet<String>,
    sccs: &mut Vec<Vec<String>>,
) {
    indices.insert(u.to_string(), *index);
    lowlink.insert(u.to_string(), *index);
    *index += 1;
    stack.push(u.to_string());
    on_stack.insert(u.to_string());

    if let Some(neighbors) = adj.get(u) {
        for v in neighbors {
            if !indices.contains_key(v) {
                strongconnect(
                    v, adj, index, stack, indices, lowlink, on_stack, sccs,
                );
                let v_low = *lowlink.get(v).unwrap();
                let u_low = lowlink.get_mut(u).unwrap();
                *u_low = (*u_low).min(v_low);
            } else if on_stack.contains(v) {
                let v_idx = *indices.get(v).unwrap();
                let u_low = lowlink.get_mut(u).unwrap();
                *u_low = (*u_low).min(v_idx);
            }
        }
    }

    if lowlink.get(u) == indices.get(u) {
        let mut scc = Vec::new();
        while let Some(w) = stack.pop() {
            on_stack.remove(&w);
            scc.push(w.clone());
            if w == u {
                break;
            }
        }
        sccs.push(scc);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_edge(src: &str, tgt: &str) -> ImportEdge {
        ImportEdge {
            source_file_id: 0,
            source_file_path: src.to_string(),
            target_file_id: Some(0),
            target_file_path: Some(tgt.to_string()),
            target_module: tgt.to_string(),
            imported_name: "foo".to_string(),
            is_type_only: false,
            line_number: 1,
            resolution_status: ResolutionStatus::Internal,
            source_evidence_id: None,
        }
    }

    #[test]
    fn test_no_cycle_in_dag() {
        let edges = vec![
            make_edge("a.ts", "b.ts"),
            make_edge("b.ts", "c.ts"),
            make_edge("a.ts", "c.ts"),
        ];

        let cycles = CycleDetector::find_circular_dependencies(&edges);
        assert!(cycles.is_empty());
    }

    #[test]
    fn test_detect_two_node_cycle() {
        let edges = vec![
            make_edge("a.ts", "b.ts"),
            make_edge("b.ts", "a.ts"),
            make_edge("b.ts", "c.ts"),
        ];

        let cycles = CycleDetector::find_circular_dependencies(&edges);
        assert_eq!(cycles.len(), 1);
        assert_eq!(cycles[0].cycle_files, vec!["a.ts".to_string(), "b.ts".to_string()]);
    }

    #[test]
    fn test_detect_three_node_cycle() {
        let edges = vec![
            make_edge("x.ts", "y.ts"),
            make_edge("y.ts", "z.ts"),
            make_edge("z.ts", "x.ts"),
        ];

        let cycles = CycleDetector::find_circular_dependencies(&edges);
        assert_eq!(cycles.len(), 1);
        assert_eq!(cycles[0].cycle_files, vec!["x.ts", "y.ts", "z.ts"]);
    }
}

