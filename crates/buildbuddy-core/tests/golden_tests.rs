use std::fs;
use std::path::PathBuf;

use buildbuddy_core::parser::traits::ParseStatus;
use buildbuddy_core::parser::ParserManager;

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("fixtures")
}

#[test]
fn test_verify_ts_golden() {
    let dir = fixtures_dir().join("ts-basic");
    let sample_path = dir.join("sample.ts");
    let content = fs::read_to_string(&sample_path).expect("Read sample.ts");

    let manager = ParserManager::new();
    let result = manager
        .parse_source("fixtures/ts-basic/sample.ts", Some("ts"), &content)
        .expect("Parse sample.ts");

    assert_eq!(result.status, ParseStatus::Full);
    assert!(!result.symbols.is_empty());
    assert!(!result.imports.is_empty());
    assert!(!result.exports.is_empty());

    let symbols_path = dir.join("expected-symbols.json");
    let imports_path = dir.join("expected-imports.json");
    let exports_path = dir.join("expected-exports.json");
    let update_golden = std::env::var("UPDATE_GOLDEN").unwrap_or_default() == "1";

    if update_golden {
        fs::write(&symbols_path, serde_json::to_string_pretty(&result.symbols).unwrap()).expect("Write expected-symbols.json");
        fs::write(&imports_path, serde_json::to_string_pretty(&result.imports).unwrap()).expect("Write expected-imports.json");
        fs::write(&exports_path, serde_json::to_string_pretty(&result.exports).unwrap()).expect("Write expected-exports.json");
    } else {
        assert!(symbols_path.exists(), "expected-symbols.json does not exist. Run with UPDATE_GOLDEN=1 to generate it.");
        assert!(imports_path.exists(), "expected-imports.json does not exist. Run with UPDATE_GOLDEN=1 to generate it.");
        assert!(exports_path.exists(), "expected-exports.json does not exist. Run with UPDATE_GOLDEN=1 to generate it.");
    }

    let expected_symbols: Vec<buildbuddy_core::symbols::ExtractedSymbol> =
        serde_json::from_str(&fs::read_to_string(&symbols_path).expect("Read symbols")).expect("Deserialize symbols");
    assert_eq!(result.symbols, expected_symbols, "Symbols mismatch");

    let expected_imports: Vec<buildbuddy_core::symbols::ExtractedImport> =
        serde_json::from_str(&fs::read_to_string(&imports_path).expect("Read imports")).expect("Deserialize imports");
    assert_eq!(result.imports, expected_imports, "Imports mismatch");

    let expected_exports: Vec<buildbuddy_core::symbols::ExtractedExport> =
        serde_json::from_str(&fs::read_to_string(&exports_path).expect("Read exports")).expect("Deserialize exports");
    assert_eq!(result.exports, expected_exports, "Exports mismatch");
}

#[test]
fn test_verify_ts_default_fn_golden() {
    let dir = fixtures_dir().join("ts-basic");
    let sample_path = dir.join("default-fn.ts");
    let content = fs::read_to_string(&sample_path).expect("Read default-fn.ts");

    let manager = ParserManager::new();
    let result = manager
        .parse_source("fixtures/ts-basic/default-fn.ts", Some("ts"), &content)
        .expect("Parse default-fn.ts");

    assert_eq!(result.status, ParseStatus::Full);
    assert!(!result.symbols.is_empty());
    assert!(!result.exports.is_empty());

    let symbols_path = dir.join("default-fn-expected-symbols.json");
    let imports_path = dir.join("default-fn-expected-imports.json");
    let exports_path = dir.join("default-fn-expected-exports.json");
    let update_golden = std::env::var("UPDATE_GOLDEN").unwrap_or_default() == "1";

    if update_golden {
        fs::write(&symbols_path, serde_json::to_string_pretty(&result.symbols).unwrap()).expect("Write default-fn-expected-symbols.json");
        fs::write(&imports_path, serde_json::to_string_pretty(&result.imports).unwrap()).expect("Write default-fn-expected-imports.json");
        fs::write(&exports_path, serde_json::to_string_pretty(&result.exports).unwrap()).expect("Write default-fn-expected-exports.json");
    } else {
        assert!(symbols_path.exists(), "default-fn-expected-symbols.json does not exist. Run with UPDATE_GOLDEN=1 to generate it.");
        assert!(imports_path.exists(), "default-fn-expected-imports.json does not exist. Run with UPDATE_GOLDEN=1 to generate it.");
        assert!(exports_path.exists(), "default-fn-expected-exports.json does not exist. Run with UPDATE_GOLDEN=1 to generate it.");
    }

    let expected_symbols: Vec<buildbuddy_core::symbols::ExtractedSymbol> =
        serde_json::from_str(&fs::read_to_string(&symbols_path).expect("Read symbols")).expect("Deserialize symbols");
    assert_eq!(result.symbols, expected_symbols, "Symbols mismatch");

    let expected_imports: Vec<buildbuddy_core::symbols::ExtractedImport> =
        serde_json::from_str(&fs::read_to_string(&imports_path).expect("Read imports")).expect("Deserialize imports");
    assert_eq!(result.imports, expected_imports, "Imports mismatch");

    let expected_exports: Vec<buildbuddy_core::symbols::ExtractedExport> =
        serde_json::from_str(&fs::read_to_string(&exports_path).expect("Read exports")).expect("Deserialize exports");
    assert_eq!(result.exports, expected_exports, "Exports mismatch");
}

#[test]
fn test_ts_malformed_file_partial_status() {
    let dir = fixtures_dir().join("ts-basic");
    let malformed_path = dir.join("malformed.ts");
    let content = fs::read_to_string(&malformed_path).expect("Read malformed.ts");

    let manager = ParserManager::new();
    let result = manager
        .parse_source("fixtures/ts-basic/malformed.ts", Some("ts"), &content)
        .expect("Parse malformed.ts");

    // Must not crash, status must be Partial
    assert_eq!(result.status, ParseStatus::Partial);
    assert!(!result.errors.is_empty());
}

#[test]
fn test_ts_rescan_idempotent_symbol_ids() {
    let dir = fixtures_dir().join("ts-basic");
    let sample_path = dir.join("sample.ts");
    let content = fs::read_to_string(&sample_path).expect("Read sample.ts");

    let manager = ParserManager::new();
    let run1 = manager
        .parse_source("fixtures/ts-basic/sample.ts", Some("ts"), &content)
        .unwrap();
    let run2 = manager
        .parse_source("fixtures/ts-basic/sample.ts", Some("ts"), &content)
        .unwrap();

    let ids1: Vec<String> = run1.symbols.iter().map(|s| s.stable_id.clone()).collect();
    let ids2: Vec<String> = run2.symbols.iter().map(|s| s.stable_id.clone()).collect();

    assert_eq!(ids1, ids2);
}

#[test]
fn test_verify_py_golden() {
    let dir = fixtures_dir().join("py-basic");
    let sample_path = dir.join("sample.py");
    let content = fs::read_to_string(&sample_path).expect("Read sample.py");

    let manager = ParserManager::new();
    let result = manager
        .parse_source("fixtures/py-basic/sample.py", Some("py"), &content)
        .expect("Parse sample.py");

    assert_eq!(result.status, ParseStatus::Full);
    assert!(!result.symbols.is_empty());
    assert!(!result.imports.is_empty());
    assert!(!result.exports.is_empty());

    let symbols_path = dir.join("expected-symbols.json");
    let imports_path = dir.join("expected-imports.json");
    let exports_path = dir.join("expected-exports.json");
    let update_golden = std::env::var("UPDATE_GOLDEN").unwrap_or_default() == "1";

    if update_golden {
        fs::write(&symbols_path, serde_json::to_string_pretty(&result.symbols).unwrap()).expect("Write expected-symbols.json");
        fs::write(&imports_path, serde_json::to_string_pretty(&result.imports).unwrap()).expect("Write expected-imports.json");
        fs::write(&exports_path, serde_json::to_string_pretty(&result.exports).unwrap()).expect("Write expected-exports.json");
    } else {
        assert!(symbols_path.exists(), "expected-symbols.json does not exist. Run with UPDATE_GOLDEN=1 to generate it.");
        assert!(imports_path.exists(), "expected-imports.json does not exist. Run with UPDATE_GOLDEN=1 to generate it.");
        assert!(exports_path.exists(), "expected-exports.json does not exist. Run with UPDATE_GOLDEN=1 to generate it.");
    }

    let expected_symbols: Vec<buildbuddy_core::symbols::ExtractedSymbol> =
        serde_json::from_str(&fs::read_to_string(&symbols_path).expect("Read symbols")).expect("Deserialize symbols");
    assert_eq!(result.symbols, expected_symbols, "Symbols mismatch");

    let expected_imports: Vec<buildbuddy_core::symbols::ExtractedImport> =
        serde_json::from_str(&fs::read_to_string(&imports_path).expect("Read imports")).expect("Deserialize imports");
    assert_eq!(result.imports, expected_imports, "Imports mismatch");

    let expected_exports: Vec<buildbuddy_core::symbols::ExtractedExport> =
        serde_json::from_str(&fs::read_to_string(&exports_path).expect("Read exports")).expect("Deserialize exports");
    assert_eq!(result.exports, expected_exports, "Exports mismatch");
}

#[test]
fn test_verify_py_all_export_golden() {
    let dir = fixtures_dir().join("py-basic");
    let sample_path = dir.join("all_export.py");
    let content = fs::read_to_string(&sample_path).expect("Read all_export.py");

    let manager = ParserManager::new();
    let result = manager
        .parse_source("fixtures/py-basic/all_export.py", Some("py"), &content)
        .expect("Parse all_export.py");

    assert_eq!(result.status, ParseStatus::Full);
    assert!(!result.symbols.is_empty());
    assert!(!result.exports.is_empty());

    let symbols_path = dir.join("all-export-expected-symbols.json");
    let imports_path = dir.join("all-export-expected-imports.json");
    let exports_path = dir.join("all-export-expected-exports.json");
    let update_golden = std::env::var("UPDATE_GOLDEN").unwrap_or_default() == "1";

    if update_golden {
        fs::write(&symbols_path, serde_json::to_string_pretty(&result.symbols).unwrap()).expect("Write all-export-expected-symbols.json");
        fs::write(&imports_path, serde_json::to_string_pretty(&result.imports).unwrap()).expect("Write all-export-expected-imports.json");
        fs::write(&exports_path, serde_json::to_string_pretty(&result.exports).unwrap()).expect("Write all-export-expected-exports.json");
    } else {
        assert!(symbols_path.exists(), "all-export-expected-symbols.json does not exist. Run with UPDATE_GOLDEN=1 to generate it.");
        assert!(imports_path.exists(), "all-export-expected-imports.json does not exist. Run with UPDATE_GOLDEN=1 to generate it.");
        assert!(exports_path.exists(), "all-export-expected-exports.json does not exist. Run with UPDATE_GOLDEN=1 to generate it.");
    }

    let expected_symbols: Vec<buildbuddy_core::symbols::ExtractedSymbol> =
        serde_json::from_str(&fs::read_to_string(&symbols_path).expect("Read symbols")).expect("Deserialize symbols");
    assert_eq!(result.symbols, expected_symbols, "Symbols mismatch");

    let expected_imports: Vec<buildbuddy_core::symbols::ExtractedImport> =
        serde_json::from_str(&fs::read_to_string(&imports_path).expect("Read imports")).expect("Deserialize imports");
    assert_eq!(result.imports, expected_imports, "Imports mismatch");

    let expected_exports: Vec<buildbuddy_core::symbols::ExtractedExport> =
        serde_json::from_str(&fs::read_to_string(&exports_path).expect("Read exports")).expect("Deserialize exports");
    assert_eq!(result.exports, expected_exports, "Exports mismatch");

    // Explicitly assert that only public_api is exported and DEFAULT_RETRIES / internal_worker are not exported
    assert_eq!(result.exports.len(), 1);
    assert_eq!(result.exports[0].exported_name, "public_api");
}

#[test]
fn test_py_malformed_file_partial_status() {
    let dir = fixtures_dir().join("py-basic");
    let malformed_path = dir.join("malformed.py");
    let content = fs::read_to_string(&malformed_path).expect("Read malformed.py");

    let manager = ParserManager::new();
    let result = manager
        .parse_source("fixtures/py-basic/malformed.py", Some("py"), &content)
        .expect("Parse malformed.py");

    // Must not crash, status must be Partial
    assert_eq!(result.status, ParseStatus::Partial);
    assert!(!result.errors.is_empty());
}

#[test]
fn test_py_rescan_idempotent_symbol_ids() {
    let dir = fixtures_dir().join("py-basic");
    let sample_path = dir.join("sample.py");
    let content = fs::read_to_string(&sample_path).expect("Read sample.py");

    let manager = ParserManager::new();
    let run1 = manager
        .parse_source("fixtures/py-basic/sample.py", Some("py"), &content)
        .unwrap();
    let run2 = manager
        .parse_source("fixtures/py-basic/sample.py", Some("py"), &content)
        .unwrap();

    let ids1: Vec<String> = run1.symbols.iter().map(|s| s.stable_id.clone()).collect();
    let ids2: Vec<String> = run2.symbols.iter().map(|s| s.stable_id.clone()).collect();

    assert_eq!(ids1, ids2);
}

use buildbuddy_core::graph::{
    CycleDetector, FileImportItem, ManifestDependencySummary, ProjectGraphResolver,
    ProjectResolutionReport, ResolvedEdgeSummary, UnusedDependencyDetector,
};
use buildbuddy_core::manifest::package_json::parse_package_json;
use buildbuddy_core::manifest::python::{parse_pyproject_toml, parse_requirements_txt};

fn analyze_fixture_resolution(dir: &std::path::Path) -> ProjectResolutionReport {
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

#[test]
fn test_verify_resolve_py_golden() {
    let dir = fixtures_dir().join("resolve-py");
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
