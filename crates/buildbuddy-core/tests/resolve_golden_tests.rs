use std::fs;
use std::path::{Path, PathBuf};

use buildbuddy_core::graph::{
    CycleDetector, FileImportItem, ManifestDependencySummary, ProjectGraphResolver,
    ProjectResolutionReport, ResolvedEdgeSummary, UnusedDependencyDetector,
};
use buildbuddy_core::manifest::package_json::parse_package_json;
use buildbuddy_core::manifest::python::{parse_pyproject_toml, parse_requirements_txt};
use buildbuddy_core::parser::ParserManager;

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("fixtures")
}

fn analyze_fixture_resolution(dir: &Path) -> ProjectResolutionReport {
    let mut files = Vec::new();
    let mut all_imports = Vec::new();
    let mut manifest_deps = Vec::new();
    let parser = ParserManager::new();

    let mut id_counter = 1i64;
    for entry in walkdir::WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let rel_path = entry
                .path()
                .strip_prefix(dir)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            let file_id = id_counter;
            id_counter += 1;
            files.push((file_id, rel_path.clone()));

            let content = fs::read_to_string(entry.path()).unwrap_or_default();

            if rel_path == "package.json" {
                if let Ok(deps) = parse_package_json(&content, &rel_path) {
                    manifest_deps.extend(deps);
                }
            } else if rel_path == "requirements.txt" {
                if let Ok(deps) = parse_requirements_txt(&content, &rel_path) {
                    manifest_deps.extend(deps);
                }
            } else if rel_path == "pyproject.toml" {
                if let Ok(deps) = parse_pyproject_toml(&content, &rel_path) {
                    manifest_deps.extend(deps);
                }
            } else if rel_path.ends_with(".ts") || rel_path.ends_with(".tsx") || rel_path.ends_with(".py") {
                let ext = entry.path().extension().and_then(|s| s.to_str());
                if let Ok(parsed) = parser.parse_source(&rel_path, ext, &content) {
                    for imp in parsed.imports {
                        all_imports.push(FileImportItem {
                            source_file_id: file_id,
                            source_file_path: rel_path.clone(),
                            source_module: imp.source_module,
                            imported_name: imp.imported_name,
                            is_type_only: imp.is_type_only,
                            line_number: imp.line_number,
                            source_evidence_id: None,
                        });
                    }
                }
            }
        }
    }

    let tsconfig_content = fs::read_to_string(dir.join("tsconfig.json")).ok();
    let resolver = ProjectGraphResolver::new(&files, tsconfig_content.as_deref());
    let edges = resolver.resolve_all(&all_imports);

    let raw_cycles = CycleDetector::find_circular_dependencies(&edges);
    let cycles: Vec<Vec<String>> = raw_cycles.into_iter().map(|c| c.cycle_files).collect();

    let raw_unused = UnusedDependencyDetector::find_unused(&manifest_deps, &edges);
    let mut unused_dependencies: Vec<String> = raw_unused
        .into_iter()
        .map(|u| u.package_name)
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    unused_dependencies.sort();

    let mut resolved_edges: Vec<ResolvedEdgeSummary> = edges
        .into_iter()
        .map(|e| ResolvedEdgeSummary {
            source_file: e.source_file_path,
            target_module: e.target_module,
            imported_name: e.imported_name,
            resolution_status: e.resolution_status.as_str().to_string(),
            target_file: e.target_file_path,
        })
        .collect();

    resolved_edges.sort_by(|a, b| {
        (&a.source_file, &a.target_module, &a.imported_name)
            .cmp(&(&b.source_file, &b.target_module, &b.imported_name))
    });

    let mut manifest_dependencies: Vec<ManifestDependencySummary> = manifest_deps
        .into_iter()
        .map(|d| ManifestDependencySummary {
            name: d.name,
            version_spec: d.version_spec,
            dep_type: d.dep_type.as_str().to_string(),
        })
        .collect();
    manifest_dependencies.sort_by(|a, b| a.name.cmp(&b.name));

    ProjectResolutionReport {
        edges: resolved_edges,
        cycles,
        manifest_dependencies,
        unused_dependencies,
    }
}

#[test]
fn test_verify_resolve_ts_golden() {
    let dir = fixtures_dir().join("resolve-ts");
    let report = analyze_fixture_resolution(&dir);

    let expected_path = dir.join("expected-resolved.json");
    let update_golden = std::env::var("UPDATE_GOLDEN").unwrap_or_default() == "1";

    if update_golden {
        fs::write(
            &expected_path,
            serde_json::to_string_pretty(&report).unwrap(),
        )
        .expect("Write expected-resolved.json");
    } else {
        assert!(
            expected_path.exists(),
            "expected-resolved.json does not exist. Run with UPDATE_GOLDEN=1 to generate it."
        );
    }

    let expected: ProjectResolutionReport =
        serde_json::from_str(&fs::read_to_string(&expected_path).expect("Read expected"))
            .expect("Deserialize expected");

    assert_eq!(report, expected);
}

