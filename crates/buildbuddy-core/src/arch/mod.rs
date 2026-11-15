pub mod entry_points;
pub mod frameworks;
pub mod model;
pub mod modules;

use crate::arch::entry_points::EntryPointDetector;
use crate::arch::frameworks::FrameworkDetector;
use crate::arch::model::{
    ArchitectureEdge, ArchitectureGroup, ArchitectureModel, ArchitectureNode,
    ProjectArchReport,
};
use crate::arch::modules::ModuleGrouper;
use crate::graph::model::ImportEdge;
use crate::manifest::ManifestDependency;
use crate::parser::FileParseResult;

pub struct ArchitectureAnalyzer;

impl ArchitectureAnalyzer {
    pub fn analyze(
        all_files: &[(String, &str)], // (relative_path, content)
        parsed_files: &[(String, &FileParseResult, &str)],
        manifest_deps: &[ManifestDependency],
        import_edges: &[ImportEdge],
    ) -> ProjectArchReport {
        let all_paths: Vec<String> = all_files.iter().map(|(p, _)| p.clone()).collect();

        // 1. Framework detection
        let (frameworks, declared_only) = FrameworkDetector::detect(manifest_deps, parsed_files, &all_paths);

        // 2. Entry points
        let entry_points = EntryPointDetector::detect(all_files, parsed_files);

        // 3. Modules and layer grouping
        let modules = ModuleGrouper::group_modules(&all_paths, import_edges);

        // 4. Build Architecture Model (nodes, edges, groups)
        let mut nodes = Vec::new();
        let mut edges = Vec::new();
        let mut groups = Vec::new();

        for module in &modules {
            let mod_id = format!("module:{}", module.root_directory);
            nodes.push(ArchitectureNode {
                id: mod_id.clone(),
                label: module.name.clone(),
                kind: "module".to_string(),
                layer: module.layer.as_str().to_string(),
                file_path: Some(module.root_directory.clone()),
            });

            let mut group_node_ids = Vec::new();

            for f in &module.files {
                let file_id = format!("file:{}", f);
                let file_name = f.split('/').last().unwrap_or(f).to_string();

                nodes.push(ArchitectureNode {
                    id: file_id.clone(),
                    label: file_name,
                    kind: "file".to_string(),
                    layer: module.layer.as_str().to_string(),
                    file_path: Some(f.clone()),
                });

                group_node_ids.push(file_id.clone());

                edges.push(ArchitectureEdge {
                    id: format!("edge:{}:{}", f, module.root_directory),
                    source: file_id,
                    target: mod_id.clone(),
                    edge_type: "belongs_to".to_string(),
                    evidence_id: None,
                });
            }

            groups.push(ArchitectureGroup {
                id: format!("group:{}", module.root_directory),
                label: module.name.clone(),
                layer: module.layer.as_str().to_string(),
                node_ids: group_node_ids,
            });
        }

        // Add import edges between files
        for edge in import_edges {
            if let Some(target_path) = &edge.target_file_path {
                edges.push(ArchitectureEdge {
                    id: format!("import:{}:{}:{}", edge.source_file_path, target_path, edge.line_number),
                    source: format!("file:{}", edge.source_file_path),
                    target: format!("file:{}", target_path),
                    edge_type: "imports".to_string(),
                    evidence_id: edge.source_evidence_id,
                });
            }
        }

        // Add entry point nodes
        for entry in &entry_points {
            let entry_id = format!("entry:{}:{}", entry.file_path, entry.start_line);
            nodes.push(ArchitectureNode {
                id: entry_id.clone(),
                label: entry.name.clone(),
                kind: "entry_point".to_string(),
                layer: "entry".to_string(),
                file_path: Some(entry.file_path.clone()),
            });

            edges.push(ArchitectureEdge {
                id: format!("starts:{}:{}", entry.name, entry.file_path),
                source: entry_id,
                target: format!("file:{}", entry.file_path),
                edge_type: "starts".to_string(),
                evidence_id: None,
            });
        }

        ProjectArchReport {
            frameworks,
            declared_only,
            entry_points,
            modules,
            architecture_model: ArchitectureModel {
                nodes,
                edges,
                groups,
            },
        }
    }
}
