use std::collections::HashMap;

use super::model::ImportEdge;
use super::resolver_py::PyResolver;
use super::resolver_ts::{TsConfigOptions, TsResolver};

pub struct FileImportItem {
    pub source_file_id: i64,
    pub source_file_path: String,
    pub source_module: String,
    pub imported_name: String,
    pub is_type_only: bool,
    pub line_number: usize,
    pub source_evidence_id: Option<i64>,
}

pub struct ProjectGraphResolver {
    ts_resolver: TsResolver,
    py_resolver: PyResolver,
    file_id_to_path: HashMap<i64, String>,
}

impl ProjectGraphResolver {
    pub fn new(
        files: &[(i64, String)],
        tsconfig_content: Option<&str>,
    ) -> Self {
        let mut known_files = HashMap::new();
        let mut file_id_to_path = HashMap::new();

        for (id, path) in files {
            known_files.insert(path.clone(), *id);
            file_id_to_path.insert(*id, path.clone());
        }

        let tsconfig = tsconfig_content.map(TsConfigOptions::parse);
        let ts_resolver = TsResolver::new(known_files.clone(), tsconfig);
        let py_resolver = PyResolver::new(known_files);

        Self {
            ts_resolver,
            py_resolver,
            file_id_to_path,
        }
    }

    pub fn file_path(&self, id: i64) -> Option<&str> {
        self.file_id_to_path.get(&id).map(|s| s.as_str())
    }

    pub fn resolve_all(&self, imports: &[FileImportItem]) -> Vec<ImportEdge> {
        let mut edges = Vec::new();

        for item in imports {
            let is_py = item.source_file_path.ends_with(".py");
            let (status, target_file_id, target_file_path) = if is_py {
                self.py_resolver
                    .resolve(&item.source_file_path, &item.source_module)
            } else {
                self.ts_resolver
                    .resolve(&item.source_file_path, &item.source_module)
            };

            edges.push(ImportEdge {
                source_file_id: item.source_file_id,
                source_file_path: item.source_file_path.clone(),
                target_file_id,
                target_file_path,
                target_module: item.source_module.clone(),
                imported_name: item.imported_name.clone(),
                is_type_only: item.is_type_only,
                line_number: item.line_number,
                resolution_status: status,
                source_evidence_id: item.source_evidence_id,
            });
        }

        edges
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::model::ResolutionStatus;

    #[test]
    fn test_project_graph_resolver_mixed() {
        let files = vec![
            (1, "src/index.ts".to_string()),
            (2, "src/utils.ts".to_string()),
            (3, "app/main.py".to_string()),
            (4, "app/helper.py".to_string()),
        ];

        let resolver = ProjectGraphResolver::new(&files, None);

        let imports = vec![
            FileImportItem {
                source_file_id: 1,
                source_file_path: "src/index.ts".to_string(),
                source_module: "./utils".to_string(),
                imported_name: "helper".to_string(),
                is_type_only: false,
                line_number: 1,
                source_evidence_id: Some(101),
            },
            FileImportItem {
                source_file_id: 1,
                source_file_path: "src/index.ts".to_string(),
                source_module: "react".to_string(),
                imported_name: "useState".to_string(),
                is_type_only: false,
                line_number: 2,
                source_evidence_id: Some(102),
            },
            FileImportItem {
                source_file_id: 3,
                source_file_path: "app/main.py".to_string(),
                source_module: ".helper".to_string(),
                imported_name: "do_work".to_string(),
                is_type_only: false,
                line_number: 1,
                source_evidence_id: Some(103),
            },
            FileImportItem {
                source_file_id: 3,
                source_file_path: "app/main.py".to_string(),
                source_module: "os".to_string(),
                imported_name: "environ".to_string(),
                is_type_only: false,
                line_number: 2,
                source_evidence_id: Some(104),
            },
        ];

        let edges = resolver.resolve_all(&imports);
        assert_eq!(edges.len(), 4);

        assert_eq!(edges[0].resolution_status, ResolutionStatus::Internal);
        assert_eq!(edges[0].target_file_id, Some(2));
        assert_eq!(edges[0].target_file_path.as_deref(), Some("src/utils.ts"));

        assert_eq!(edges[1].resolution_status, ResolutionStatus::External);
        assert_eq!(edges[1].target_file_id, None);

        assert_eq!(edges[2].resolution_status, ResolutionStatus::Internal);
        assert_eq!(edges[2].target_file_id, Some(4));
        assert_eq!(edges[2].target_file_path.as_deref(), Some("app/helper.py"));

        assert_eq!(edges[3].resolution_status, ResolutionStatus::External);
    }
}
