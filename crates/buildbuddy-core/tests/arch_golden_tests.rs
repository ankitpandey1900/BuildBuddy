use std::fs;
use std::path::{Path, PathBuf};

use buildbuddy_core::arch::model::ProjectArchReport;
use buildbuddy_core::arch::ArchitectureAnalyzer;
use buildbuddy_core::graph::{FileImportItem, ProjectGraphResolver};
use buildbuddy_core::manifest::package_json::parse_package_json;
use buildbuddy_core::manifest::python::{parse_pyproject_toml, parse_requirements_txt};
use buildbuddy_core::manifest::ManifestDependency;
use buildbuddy_core::parser::{FileParseResult, ParserManager};
use buildbuddy_core::store::arch::ArchStore;
use buildbuddy_core::store::connection::open_in_memory;
use buildbuddy_core::store::migrations::run_migrations;
use rusqlite::Connection;

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("fixtures")
}

fn analyze_fixture_arch(dir: &Path) -> (ProjectArchReport, Connection) {
    let mut all_files = Vec::new();
    let mut file_tuples = Vec::new(); // (id, rel_path)
    let mut parsed_results: Vec<(String, FileParseResult, String)> = Vec::new();
    let mut manifest_deps: Vec<ManifestDependency> = Vec::new();
    let mut raw_imports: Vec<FileImportItem> = Vec::new();

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

            if rel_path.starts_with("expected-") {
                continue;
            }

            let content = fs::read_to_string(entry.path()).unwrap_or_default();
            let file_id = id_counter;
            id_counter += 1;

            all_files.push((rel_path.clone(), content.clone()));
            file_tuples.push((file_id, rel_path.clone()));

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
            }

            let ext = entry.path().extension().and_then(|s| s.to_str());
            if let Some(e) = ext {
                if matches!(e, "ts" | "tsx" | "js" | "jsx" | "py") {
                    if let Ok(parsed) = parser.parse_source(&rel_path, Some(e), &content) {
                        for imp in &parsed.imports {
                            raw_imports.push(FileImportItem {
                                source_file_id: file_id,
                                source_file_path: rel_path.clone(),
                                source_module: imp.source_module.clone(),
                                imported_name: imp.imported_name.clone(),
                                is_type_only: imp.is_type_only,
                                line_number: imp.line_number,
                                source_evidence_id: None,
                            });
                        }
                        parsed_results.push((rel_path.clone(), parsed, content.clone()));
                    }
                }
            }
        }
    }

    // Resolve import edges
    let tsconfig_content = fs::read_to_string(dir.join("tsconfig.json")).ok();
    let resolver = ProjectGraphResolver::new(&file_tuples, tsconfig_content.as_deref());
    let edges = resolver.resolve_all(&raw_imports);

    let all_files_refs: Vec<(String, &str)> = all_files.iter().map(|(p, c)| (p.clone(), c.as_str())).collect();
    let parsed_refs: Vec<(String, &FileParseResult, &str)> = parsed_results
        .iter()
        .map(|(p, res, c)| (p.clone(), res, c.as_str()))
        .collect();

    let report = ArchitectureAnalyzer::analyze(&all_files_refs, &parsed_refs, &manifest_deps, &edges);

    // Persist in SQLite
    let mut conn = open_in_memory().unwrap();
    run_migrations(&conn).unwrap();
    conn.execute(
        "INSERT INTO projects (id, name, root_path) VALUES (1, 'test', ?1)",
        rusqlite::params![dir.to_string_lossy().to_string()],
    )
    .unwrap();

    ArchStore::persist_architecture(
        &mut conn,
        1,
        &report.frameworks,
        &report.declared_only,
        &report.entry_points,
        &report.modules,
        &report.architecture_model,
    )
    .unwrap();

    (report, conn)
}

#[test]
fn test_verify_arch_react_express_golden() {
    let dir = fixtures_dir().join("arch-react-express");
    let (report, _conn) = analyze_fixture_arch(&dir);

    let expected_path = dir.join("expected-arch.json");
    let update_golden = std::env::var("UPDATE_GOLDEN").unwrap_or_default() == "1";

    if update_golden {
        fs::write(
            &expected_path,
            serde_json::to_string_pretty(&report).unwrap(),
        )
        .expect("Write expected-arch.json");
    } else {
        assert!(
            expected_path.exists(),
            "expected-arch.json does not exist. Run with UPDATE_GOLDEN=1 to generate it."
        );
    }

    let expected: ProjectArchReport =
        serde_json::from_str(&fs::read_to_string(&expected_path).expect("Read expected"))
            .expect("Deserialize expected");

    assert_eq!(report, expected);

    // Verify key elements
    assert!(report.frameworks.iter().any(|f| f.name == "React" && f.confidence == buildbuddy_core::arch::model::Confidence::Static));
    assert!(report.frameworks.iter().any(|f| f.name == "Express" && f.confidence == buildbuddy_core::arch::model::Confidence::Static));
    assert!(report.entry_points.iter().any(|e| e.name == "Express HTTP Server Entry" && e.confidence == buildbuddy_core::arch::model::Confidence::Static));
    assert!(report.entry_points.iter().any(|e| e.name == "React DOM Root Entry" && e.confidence == buildbuddy_core::arch::model::Confidence::Static));
    assert!(report.entry_points.iter().any(|e| e.name.contains("script: dev") && e.entry_type == "script"));
    assert!(!report.entry_points.iter().any(|e| e.name.contains("build")), "build script must NOT be an entry point");
}

#[test]
fn test_verify_arch_fastapi_golden() {
    let dir = fixtures_dir().join("arch-fastapi");
    let (report, _conn) = analyze_fixture_arch(&dir);

    let expected_path = dir.join("expected-arch.json");
    let update_golden = std::env::var("UPDATE_GOLDEN").unwrap_or_default() == "1";

    if update_golden {
        fs::write(
            &expected_path,
            serde_json::to_string_pretty(&report).unwrap(),
        )
        .expect("Write expected-arch.json");
    } else {
        assert!(
            expected_path.exists(),
            "expected-arch.json does not exist. Run with UPDATE_GOLDEN=1 to generate it."
        );
    }

    let expected: ProjectArchReport =
        serde_json::from_str(&fs::read_to_string(&expected_path).expect("Read expected"))
            .expect("Deserialize expected");

    assert_eq!(report, expected);

    // Verify key elements
    assert!(report.frameworks.iter().any(|f| f.name == "FastAPI" && f.confidence == buildbuddy_core::arch::model::Confidence::Static));
    assert!(report.entry_points.iter().any(|e| e.name == "Python __main__ Entry" && e.confidence == buildbuddy_core::arch::model::Confidence::Static));
    assert!(report.entry_points.iter().any(|e| e.name.contains("FastAPI Application") && e.confidence == buildbuddy_core::arch::model::Confidence::Static));
}

#[test]
fn test_verify_arch_nextjs_golden() {
    let dir = fixtures_dir().join("arch-nextjs");
    let (report, _conn) = analyze_fixture_arch(&dir);

    let expected_path = dir.join("expected-arch.json");
    let update_golden = std::env::var("UPDATE_GOLDEN").unwrap_or_default() == "1";

    if update_golden {
        fs::write(
            &expected_path,
            serde_json::to_string_pretty(&report).unwrap(),
        )
        .expect("Write expected-arch.json");
    } else {
        assert!(
            expected_path.exists(),
            "expected-arch.json does not exist. Run with UPDATE_GOLDEN=1 to generate it."
        );
    }

    let expected: ProjectArchReport =
        serde_json::from_str(&fs::read_to_string(&expected_path).expect("Read expected"))
            .expect("Deserialize expected");

    assert_eq!(report, expected);

    assert!(report.frameworks.iter().any(|f| f.name == "Next.js" && f.confidence == buildbuddy_core::arch::model::Confidence::Static));
    assert!(report.frameworks.iter().any(|f| f.name == "React" && f.confidence == buildbuddy_core::arch::model::Confidence::Static));
    assert!(report.entry_points.iter().any(|e| e.name.contains("Next.js Route Entry")));
    assert!(report.entry_points.iter().any(|e| e.name.contains("script: dev") && e.entry_type == "script"));
    assert!(!report.entry_points.iter().any(|e| e.name.contains("build")));
}

#[test]
fn test_verify_arch_vue_golden() {
    let dir = fixtures_dir().join("arch-vue");
    let (report, _conn) = analyze_fixture_arch(&dir);

    let expected_path = dir.join("expected-arch.json");
    let update_golden = std::env::var("UPDATE_GOLDEN").unwrap_or_default() == "1";

    if update_golden {
        fs::write(
            &expected_path,
            serde_json::to_string_pretty(&report).unwrap(),
        )
        .expect("Write expected-arch.json");
    } else {
        assert!(
            expected_path.exists(),
            "expected-arch.json does not exist. Run with UPDATE_GOLDEN=1 to generate it."
        );
    }

    let expected: ProjectArchReport =
        serde_json::from_str(&fs::read_to_string(&expected_path).expect("Read expected"))
            .expect("Deserialize expected");

    assert_eq!(report, expected);

    assert!(report.frameworks.iter().any(|f| f.name == "Vue" && f.confidence == buildbuddy_core::arch::model::Confidence::Static));
    assert!(report.entry_points.iter().any(|e| e.name == "Vue Application Entry" && e.confidence == buildbuddy_core::arch::model::Confidence::Static));
    assert!(report.entry_points.iter().any(|e| e.name.contains("script: dev") && e.entry_type == "script"));
    assert!(report.entry_points.iter().any(|e| e.name.contains("script: serve") && e.entry_type == "script"));
    assert!(!report.entry_points.iter().any(|e| e.name.contains("build")));
}

#[test]
fn test_verify_arch_flask_golden() {
    let dir = fixtures_dir().join("arch-flask");
    let (report, _conn) = analyze_fixture_arch(&dir);

    let expected_path = dir.join("expected-arch.json");
    let update_golden = std::env::var("UPDATE_GOLDEN").unwrap_or_default() == "1";

    if update_golden {
        fs::write(
            &expected_path,
            serde_json::to_string_pretty(&report).unwrap(),
        )
        .expect("Write expected-arch.json");
    } else {
        assert!(
            expected_path.exists(),
            "expected-arch.json does not exist. Run with UPDATE_GOLDEN=1 to generate it."
        );
    }

    let expected: ProjectArchReport =
        serde_json::from_str(&fs::read_to_string(&expected_path).expect("Read expected"))
            .expect("Deserialize expected");

    assert_eq!(report, expected);

    assert!(report.frameworks.iter().any(|f| f.name == "Flask" && f.confidence == buildbuddy_core::arch::model::Confidence::Static));
    assert!(report.entry_points.iter().any(|e| e.name == "Python __main__ Entry" && e.confidence == buildbuddy_core::arch::model::Confidence::Static));
    assert!(report.entry_points.iter().any(|e| e.name == "Flask Application Factory / Instance" && e.confidence == buildbuddy_core::arch::model::Confidence::Static));
}

#[test]
fn test_verify_arch_django_golden() {
    let dir = fixtures_dir().join("arch-django");
    let (report, _conn) = analyze_fixture_arch(&dir);

    let expected_path = dir.join("expected-arch.json");
    let update_golden = std::env::var("UPDATE_GOLDEN").unwrap_or_default() == "1";

    if update_golden {
        fs::write(
            &expected_path,
            serde_json::to_string_pretty(&report).unwrap(),
        )
        .expect("Write expected-arch.json");
    } else {
        assert!(
            expected_path.exists(),
            "expected-arch.json does not exist. Run with UPDATE_GOLDEN=1 to generate it."
        );
    }

    let expected: ProjectArchReport =
        serde_json::from_str(&fs::read_to_string(&expected_path).expect("Read expected"))
            .expect("Deserialize expected");

    assert_eq!(report, expected);

    assert!(report.frameworks.iter().any(|f| f.name == "Django" && f.confidence == buildbuddy_core::arch::model::Confidence::Static));
    assert!(report.entry_points.iter().any(|e| e.name.contains("Django System Entry") && e.confidence == buildbuddy_core::arch::model::Confidence::Static));
    assert!(report.entry_points.iter().any(|e| e.name == "Python __main__ Entry" && e.confidence == buildbuddy_core::arch::model::Confidence::Static));
}

#[test]
fn test_negative_arch_golden_and_assertions() {
    let dir = fixtures_dir().join("arch-negative");
    let (report, _conn) = analyze_fixture_arch(&dir);

    let expected_path = dir.join("expected-arch.json");
    let update_golden = std::env::var("UPDATE_GOLDEN").unwrap_or_default() == "1";

    if update_golden {
        fs::write(
            &expected_path,
            serde_json::to_string_pretty(&report).unwrap(),
        )
        .expect("Write expected-arch.json");
    } else {
        assert!(
            expected_path.exists(),
            "expected-arch.json does not exist. Run with UPDATE_GOLDEN=1 to generate it."
        );
    }

    let expected: ProjectArchReport =
        serde_json::from_str(&fs::read_to_string(&expected_path).expect("Read expected"))
            .expect("Deserialize expected");

    assert_eq!(report, expected);

    // Negative assertions: React MUST NOT be detected as an active framework
    assert!(
        !report.frameworks.iter().any(|f| f.name == "React"),
        "React must NOT be detected when only in devDependencies and comment string"
    );
    assert_eq!(report.frameworks.len(), 0, "No frameworks should be detected in negative fixture");

    // But it MUST be reported in declared_only
    assert!(
        report.declared_only.iter().any(|d| d.name == "React"),
        "React must be listed under declared_only when in manifest without code usage"
    );
}

#[test]
fn test_architecture_graph_stored_edges_have_evidence_references() {
    let dir = fixtures_dir().join("arch-react-express");
    let (_report, conn) = analyze_fixture_arch(&dir);

    let model = ArchStore::get_architecture_model(&conn, 1)
        .expect("query architecture model")
        .expect("architecture model must exist");

    assert!(!model.edges.is_empty(), "Architecture model must have edges");
    for edge in &model.edges {
        assert!(
            edge.evidence_id.is_some(),
            "Stored edge {} ({} -> {}) must have an evidence_id reference",
            edge.id,
            edge.source,
            edge.target
        );
        let ev_id = edge.evidence_id.unwrap();
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM source_evidence WHERE id = ?1)",
                rusqlite::params![ev_id],
                |r| r.get(0),
            )
            .expect("verify source evidence exists");
        assert!(exists, "Evidence ID {} for edge {} must exist in source_evidence table", ev_id, edge.id);
    }
}

#[test]
fn test_provenance_evidence_rows_persisted_for_detections() {
    let dir = fixtures_dir().join("arch-react-express");
    let (report, conn) = analyze_fixture_arch(&dir);

    // 1. Check frameworks evidence rows
    let fw_evidence_count: i64 = conn
        .query_row(
            "SELECT count(*) FROM source_evidence WHERE evidence_type IN ('manifest_entry', 'import_stmt', 'config_file', 'source_pattern')",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(fw_evidence_count > 0, "Must persist source evidence rows for framework detections");

    // 2. Check entry points evidence rows
    let ep_evidence_count: i64 = conn
        .query_row(
            "SELECT count(*) FROM source_evidence WHERE evidence_type = 'entry_point'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(
        ep_evidence_count as usize,
        report.entry_points.len(),
        "Every entry point must have a persisted source_evidence row"
    );

    // 3. Check every framework row references a valid source_evidence
    let fws = ArchStore::get_frameworks(&conn, 1).unwrap();
    assert_eq!(fws.len(), 2);
    for fw in fws {
        assert!(!fw.evidence.is_empty(), "Framework must have evidence items");
    }

    // 4. Check entry points query
    let eps = ArchStore::get_entry_points(&conn, 1).unwrap();
    assert_eq!(eps.len(), report.entry_points.len());

    // 5. Check modules query
    let mods = ArchStore::get_modules(&conn, 1).unwrap();
    assert!(!mods.is_empty());

    // 6. Check architecture diagram query
    let diagram = ArchStore::get_architecture_model(&conn, 1).unwrap();
    assert!(diagram.is_some());
}
