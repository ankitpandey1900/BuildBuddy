use std::collections::HashSet;

use crate::manifest::{DependencyType, ManifestDependency};
use super::model::{ImportEdge, ResolutionStatus};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnusedDependencyFinding {
    pub package_name: String,
    pub dep_type: DependencyType,
    pub source_file: String,
    pub line_number: Option<usize>,
    pub is_likely_tooling: bool,
}

pub struct UnusedDependencyDetector;

impl UnusedDependencyDetector {
    pub fn find_unused(
        manifest_deps: &[ManifestDependency],
        edges: &[ImportEdge],
    ) -> Vec<UnusedDependencyFinding> {
        let mut imported_packages = HashSet::new();

        for edge in edges {
            if edge.resolution_status == ResolutionStatus::External {
                let pkg = extract_root_package_name(&edge.target_module);
                imported_packages.insert(pkg.to_lowercase());
                // Also store normalized with hyphens/underscores
                imported_packages.insert(pkg.replace('_', "-").to_lowercase());
                imported_packages.insert(pkg.replace('-', "_").to_lowercase());
            }
        }

        let mut findings = Vec::new();

        for dep in manifest_deps {
            let dep_lower = dep.name.to_lowercase();
            let dep_normalized_hyphen = dep_lower.replace('_', "-");
            let dep_normalized_underscore = dep_lower.replace('-', "_");

            let is_imported = imported_packages.contains(&dep_lower)
                || imported_packages.contains(&dep_normalized_hyphen)
                || imported_packages.contains(&dep_normalized_underscore)
                || (dep_lower.starts_with("@types/")
                    && imported_packages.contains(&dep_lower[7..]));

            if !is_imported {
                let is_likely_tooling = is_common_tooling_dep(&dep_lower)
                    || dep.dep_type == DependencyType::Dev;

                findings.push(UnusedDependencyFinding {
                    package_name: dep.name.clone(),
                    dep_type: dep.dep_type.clone(),
                    source_file: dep.source_file.clone(),
                    line_number: dep.line_number,
                    is_likely_tooling,
                });
            }
        }

        findings.sort_by(|a, b| a.package_name.cmp(&b.package_name));
        findings
    }
}

fn extract_root_package_name(spec: &str) -> String {
    let trimmed = spec.trim().trim_start_matches("node:");
    if trimmed.starts_with('@') {
        // Scoped npm package: @scope/name/subpath -> @scope/name
        let parts: Vec<&str> = trimmed.split('/').collect();
        if parts.len() >= 2 {
            return format!("{}/{}", parts[0], parts[1]);
        }
    }

    // Normal package: name/subpath -> name
    if let Some((root, _)) = trimmed.split_once('/') {
        root.to_string()
    } else if let Some((root, _)) = trimmed.split_once('.') {
        root.to_string()
    } else {
        trimmed.to_string()
    }
}

fn is_common_tooling_dep(name: &str) -> bool {
    let tools = [
        "typescript",
        "eslint",
        "prettier",
        "vite",
        "vitest",
        "jest",
        "webpack",
        "rollup",
        "ts-node",
        "babel",
        "tailwindcss",
        "postcss",
        "autoprefixer",
        "pytest",
        "mypy",
        "black",
        "flake8",
        "isort",
        "ruff",
        "pylint",
        "tox",
        "coverage",
    ];

    tools.iter().any(|&tool| name.contains(tool))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_external_edge(spec: &str) -> ImportEdge {
        ImportEdge {
            source_file_id: 1,
            source_file_path: "src/index.ts".to_string(),
            target_file_id: None,
            target_file_path: None,
            target_module: spec.to_string(),
            imported_name: "default".to_string(),
            is_type_only: false,
            line_number: 1,
            resolution_status: ResolutionStatus::External,
            source_evidence_id: None,
        }
    }

    #[test]
    fn test_unused_dependency_detection() {
        let manifest = vec![
            ManifestDependency {
                name: "react".to_string(),
                version_spec: Some("^18.2.0".to_string()),
                dep_type: DependencyType::Direct,
                source_file: "package.json".to_string(),
                line_number: Some(5),
            },
            ManifestDependency {
                name: "lodash".to_string(),
                version_spec: Some("^4.17.21".to_string()),
                dep_type: DependencyType::Direct,
                source_file: "package.json".to_string(),
                line_number: Some(6),
            },
            ManifestDependency {
                name: "vitest".to_string(),
                version_spec: Some("^1.0.0".to_string()),
                dep_type: DependencyType::Dev,
                source_file: "package.json".to_string(),
                line_number: Some(10),
            },
        ];

        let edges = vec![
            make_external_edge("react"),
            make_external_edge("react/jsx-runtime"),
        ];

        let unused = UnusedDependencyDetector::find_unused(&manifest, &edges);
        assert_eq!(unused.len(), 2);

        let lodash = unused.iter().find(|u| u.package_name == "lodash").unwrap();
        assert_eq!(lodash.dep_type, DependencyType::Direct);
        assert!(!lodash.is_likely_tooling);

        let vitest = unused.iter().find(|u| u.package_name == "vitest").unwrap();
        assert_eq!(vitest.dep_type, DependencyType::Dev);
        assert!(vitest.is_likely_tooling);
    }
}
