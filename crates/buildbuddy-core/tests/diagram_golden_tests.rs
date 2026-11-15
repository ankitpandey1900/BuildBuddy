use std::fs;
use std::path::{Path, PathBuf};

use buildbuddy_core::arch::ArchitectureAnalyzer;
use buildbuddy_core::diagram::builders::{
    build_architecture_overview_diagram, build_class_diagram, build_file_dependency_diagram,
    build_module_dependency_diagram,
};
use buildbuddy_core::diagram::model::*;
use buildbuddy_core::diagram::progressive::{apply_progressive_disclosure, drill_down};
use buildbuddy_core::graph::call_resolver::CallResolver;
use buildbuddy_core::graph::{FileImportItem, ProjectGraphResolver};
use buildbuddy_core::manifest::package_json::parse_package_json;
use buildbuddy_core::manifest::python::{parse_pyproject_toml, parse_requirements_txt};
use buildbuddy_core::manifest::ManifestDependency;
use buildbuddy_core::parser::{FileParseResult, ParserManager};
use buildbuddy_core::store::arch::ArchStore;
use buildbuddy_core::store::connection::open_in_memory;
use buildbuddy_core::store::graph::GraphStore;
use buildbuddy_core::store::migrations::run_migrations;
use buildbuddy_core::store::symbols::persist_file_parse_result;
use rusqlite::Connection;

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("fixtures")
}

fn setup_fixture_db(dir: &Path) -> Connection {
    let mut conn = open_in_memory().unwrap();
    run_migrations(&conn).unwrap();

    let project_id = 1i64;
    conn.execute(
        "INSERT INTO projects (id, name, root_path) VALUES (?1, 'test', ?2)",
        rusqlite::params![project_id, dir.to_string_lossy().to_string()],
    )
    .unwrap();

    let parser = ParserManager::new();
    let mut file_tuples = Vec::new();
    let mut file_contents = Vec::new();
    let mut raw_imports = Vec::new();
    let mut manifest_deps: Vec<ManifestDependency> = Vec::new();
    let mut parsed_results: Vec<(i64, String, FileParseResult, String)> = Vec::new();
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

            file_tuples.push((file_id, rel_path.clone()));
            file_contents.push((file_id, rel_path.clone(), content.clone()));

            conn.execute(
                "INSERT INTO files (id, project_id, relative_path, file_name, extension, size_bytes, content_hash, status)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'parsed')",
                rusqlite::params![
                    file_id,
                    project_id,
                    rel_path,
                    entry.file_name().to_string_lossy().to_string(),
                    entry.path().extension().and_then(|s| s.to_str()).unwrap_or(""),
                    content.len() as i64,
                    format!("hash_{}", file_id),
                ],
            )
            .unwrap();

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
                        parsed_results.push((file_id, rel_path.clone(), parsed, content.clone()));
                    }
                }
            }
        }
    }

    // Persist parsed results into SQLite (symbols, classes, calls, instantiations, source_evidence)
    for (file_id, _rel_path, res, _c) in &parsed_results {
        persist_file_parse_result(&mut conn, project_id, *file_id, res).unwrap();
    }

    // Resolve import edges
    let tsconfig_content = fs::read_to_string(dir.join("tsconfig.json")).ok();
    let resolver = ProjectGraphResolver::new(&file_tuples, tsconfig_content.as_deref());
    let resolved_edges = resolver.resolve_all(&raw_imports);
    GraphStore::insert_import_edges(&mut conn, project_id, &resolved_edges).unwrap();

    // Insert manifest dependencies
    if !manifest_deps.is_empty() {
        GraphStore::insert_manifest_dependencies(&mut conn, project_id, 1, &manifest_deps).unwrap();
    }

    // Resolve calls and instantiations across project
    let _ = CallResolver::resolve_project_calls(&conn, project_id);

    // Run architecture analysis and store modules/entry points
    let all_files_refs: Vec<(String, &str)> = file_contents
        .iter()
        .map(|(_id, p, c)| (p.clone(), c.as_str()))
        .collect();
    let parsed_refs: Vec<(String, &FileParseResult, &str)> = parsed_results
        .iter()
        .map(|(_id, p, res, c)| (p.clone(), res, c.as_str()))
        .collect();

    let arch_report =
        ArchitectureAnalyzer::analyze(&all_files_refs, &parsed_refs, &manifest_deps, &resolved_edges);

    ArchStore::persist_architecture(
        &mut conn,
        project_id,
        &arch_report.frameworks,
        &arch_report.declared_only,
        &arch_report.entry_points,
        &arch_report.modules,
        &arch_report.architecture_model,
    )
    .unwrap();

    conn
}

// ---------------------------------------------------------------------------
// 1. Golden Test: File Dependency Graph (resolve-ts)
// ---------------------------------------------------------------------------
#[test]
fn test_verify_file_dependency_golden() {
    let dir = fixtures_dir().join("resolve-ts");
    let conn = setup_fixture_db(&dir);

    let report = build_file_dependency_diagram(&conn, 1).unwrap();
    assert!(!report.model.nodes.is_empty());
    assert!(!report.model.edges.is_empty());

    // Verify all edges have valid evidence_id
    for edge in &report.model.edges {
        assert!(edge.evidence_id > 0);
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM source_evidence WHERE id = ?1)",
                rusqlite::params![edge.evidence_id],
                |r| r.get(0),
            )
            .unwrap();
        assert!(exists, "Evidence id {} must exist in DB", edge.evidence_id);
    }

    let expected_path = dir.join("expected-file-dep.json");
    let update_golden = std::env::var("UPDATE_GOLDEN").unwrap_or_default() == "1";

    if update_golden {
        fs::write(
            &expected_path,
            serde_json::to_string_pretty(&report.model).unwrap(),
        )
        .expect("Write expected-file-dep.json");
    } else {
        assert!(
            expected_path.exists(),
            "expected-file-dep.json does not exist. Run with UPDATE_GOLDEN=1."
        );
    }

    let expected: DiagramModel =
        serde_json::from_str(&fs::read_to_string(&expected_path).expect("Read expected"))
            .expect("Deserialize expected");
    assert_eq!(report.model, expected);
}

// ---------------------------------------------------------------------------
// 2. Golden Test: Module Dependency Graph (resolve-ts)
// ---------------------------------------------------------------------------
#[test]
fn test_verify_module_dependency_golden() {
    let dir = fixtures_dir().join("resolve-ts");
    let conn = setup_fixture_db(&dir);

    let report = build_module_dependency_diagram(&conn, 1).unwrap();
    assert!(!report.model.nodes.is_empty());

    for edge in &report.model.edges {
        assert!(edge.evidence_id > 0);
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM source_evidence WHERE id = ?1)",
                rusqlite::params![edge.evidence_id],
                |r| r.get(0),
            )
            .unwrap();
        assert!(exists, "Evidence id {} must exist in DB", edge.evidence_id);
    }

    let expected_path = dir.join("expected-module-dep.json");
    let update_golden = std::env::var("UPDATE_GOLDEN").unwrap_or_default() == "1";

    if update_golden {
        fs::write(
            &expected_path,
            serde_json::to_string_pretty(&report.model).unwrap(),
        )
        .expect("Write expected-module-dep.json");
    } else {
        assert!(
            expected_path.exists(),
            "expected-module-dep.json does not exist. Run with UPDATE_GOLDEN=1."
        );
    }

    let expected: DiagramModel =
        serde_json::from_str(&fs::read_to_string(&expected_path).expect("Read expected"))
            .expect("Deserialize expected");
    assert_eq!(report.model, expected);
}

// ---------------------------------------------------------------------------
// 3. Golden Test: Architecture Overview (arch-react-express)
// ---------------------------------------------------------------------------
#[test]
fn test_verify_architecture_overview_golden() {
    let dir = fixtures_dir().join("arch-react-express");
    let conn = setup_fixture_db(&dir);

    let report = build_architecture_overview_diagram(&conn, 1).unwrap();
    assert!(!report.model.nodes.is_empty());

    for edge in &report.model.edges {
        assert!(edge.evidence_id > 0);
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM source_evidence WHERE id = ?1)",
                rusqlite::params![edge.evidence_id],
                |r| r.get(0),
            )
            .unwrap();
        assert!(exists, "Evidence id {} must exist in DB", edge.evidence_id);
    }

    let expected_path = dir.join("expected-arch-overview.json");
    let update_golden = std::env::var("UPDATE_GOLDEN").unwrap_or_default() == "1";

    if update_golden {
        fs::write(
            &expected_path,
            serde_json::to_string_pretty(&report.model).unwrap(),
        )
        .expect("Write expected-arch-overview.json");
    } else {
        assert!(
            expected_path.exists(),
            "expected-arch-overview.json does not exist. Run with UPDATE_GOLDEN=1."
        );
    }

    let expected: DiagramModel =
        serde_json::from_str(&fs::read_to_string(&expected_path).expect("Read expected"))
            .expect("Deserialize expected");
    assert_eq!(report.model, expected);
}

// ---------------------------------------------------------------------------
// 4. Golden Test: Class Diagram (calls-ts)
// ---------------------------------------------------------------------------
#[test]
fn test_verify_class_diagram_golden() {
    let dir = fixtures_dir().join("calls-ts");
    let conn = setup_fixture_db(&dir);

    let report = build_class_diagram(&conn, 1).unwrap();
    assert!(!report.model.nodes.is_empty());
    assert!(!report.model.edges.is_empty());

    // Verify inheritance and instantiation edges exist
    let has_inheritance = report
        .model
        .edges
        .iter()
        .any(|e| e.relationship == RelationshipType::Inheritance);
    let has_instantiation = report
        .model
        .edges
        .iter()
        .any(|e| e.relationship == RelationshipType::Instantiation);
    assert!(has_inheritance, "Must contain inheritance edge");
    assert!(has_instantiation, "Must contain instantiation edge");

    for edge in &report.model.edges {
        assert!(edge.evidence_id > 0);
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM source_evidence WHERE id = ?1)",
                rusqlite::params![edge.evidence_id],
                |r| r.get(0),
            )
            .unwrap();
        assert!(exists, "Evidence id {} must exist in DB", edge.evidence_id);
    }

    let expected_path = dir.join("expected-class-diagram.json");
    let update_golden = std::env::var("UPDATE_GOLDEN").unwrap_or_default() == "1";

    if update_golden {
        fs::write(
            &expected_path,
            serde_json::to_string_pretty(&report.model).unwrap(),
        )
        .expect("Write expected-class-diagram.json");
    } else {
        assert!(
            expected_path.exists(),
            "expected-class-diagram.json does not exist. Run with UPDATE_GOLDEN=1."
        );
    }

    let expected: DiagramModel =
        serde_json::from_str(&fs::read_to_string(&expected_path).expect("Read expected"))
            .expect("Deserialize expected");
    assert_eq!(report.model, expected);
}

// ---------------------------------------------------------------------------
// 5. Test: Every edge in every model has an evidence_id that exists in DB
// ---------------------------------------------------------------------------
#[test]
fn test_all_models_have_real_evidence_ids() {
    let dir = fixtures_dir().join("calls-ts");
    let conn = setup_fixture_db(&dir);

    let file_dep = build_file_dependency_diagram(&conn, 1).unwrap();
    let mod_dep = build_module_dependency_diagram(&conn, 1).unwrap();
    let arch_ov = build_architecture_overview_diagram(&conn, 1).unwrap();
    let class_diag = build_class_diagram(&conn, 1).unwrap();

    let all_edges: Vec<&DiagramEdge> = file_dep
        .model
        .edges
        .iter()
        .chain(mod_dep.model.edges.iter())
        .chain(arch_ov.model.edges.iter())
        .chain(class_diag.model.edges.iter())
        .collect();

    assert!(!all_edges.is_empty(), "Should have multiple edges to verify");

    for edge in all_edges {
        assert!(edge.evidence_id > 0, "edge {} must have positive evidence_id", edge.id);
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM source_evidence WHERE id = ?1)",
                rusqlite::params![edge.evidence_id],
                |r| r.get(0),
            )
            .unwrap();
        assert!(exists, "Evidence id {} for edge {} must exist in DB", edge.evidence_id, edge.id);
    }
}

// ---------------------------------------------------------------------------
// 6. Test: An edge without evidence is dropped and reported
// ---------------------------------------------------------------------------
#[test]
fn test_edge_without_evidence_is_dropped_and_reported() {
    let dir = fixtures_dir().join("resolve-ts");
    let conn = setup_fixture_db(&dir);

    // Insert an invalid import edge with NULL source_evidence_id
    conn.execute(
        "INSERT INTO import_edges (project_id, source_file_id, target_file_id, target_module, imported_name, is_type_only, line_number, resolution_status, source_evidence_id)
         VALUES (1, 1, 2, './cycle_a', 'bogus', 0, 999, 'internal', NULL)",
        [],
    )
    .unwrap();

    // Insert another edge with an evidence_id that does NOT exist in source_evidence
    conn.execute("PRAGMA foreign_keys = OFF", []).unwrap();
    conn.execute(
        "INSERT INTO import_edges (project_id, source_file_id, target_file_id, target_module, imported_name, is_type_only, line_number, resolution_status, source_evidence_id)
         VALUES (1, 1, 2, './cycle_a', 'bogus2', 0, 1000, 'internal', 99999999)",
        [],
    )
    .unwrap();
    conn.execute("PRAGMA foreign_keys = ON", []).unwrap();

    let report = build_file_dependency_diagram(&conn, 1).unwrap();

    // Verify dropped edges contains both
    assert!(
        report.dropped_edges.len() >= 2,
        "Should have dropped at least 2 edges lacking evidence, found: {}",
        report.dropped_edges.len()
    );

    let has_null_drop = report
        .dropped_edges
        .iter()
        .any(|d| d.reason.contains("Missing source_evidence_id"));
    let has_dangling_drop = report
        .dropped_edges
        .iter()
        .any(|d| d.reason.contains("does not exist in source_evidence"));

    assert!(has_null_drop, "Should drop edge with NULL evidence_id");
    assert!(has_dangling_drop, "Should drop edge with non-existent evidence_id");

    // The dropped edges must NOT appear in model.edges
    assert!(!report.model.edges.iter().any(|e| e.id.contains("bogus")));
}

// ---------------------------------------------------------------------------
// 7. Test: Inferred edges keep confidence 'inferred' and are never merged
// ---------------------------------------------------------------------------
#[test]
fn test_inferred_edges_never_merged_with_confirmed() {
    let dir = fixtures_dir().join("calls-ts");
    let conn = setup_fixture_db(&dir);

    // In calls-ts/sample.ts, client.fetchData() is an inferred call,
    // while directLocalHelper() is a confirmed call.
    let arch_ov = build_architecture_overview_diagram(&conn, 1).unwrap();

    let inferred_edges: Vec<&DiagramEdge> = arch_ov
        .model
        .edges
        .iter()
        .filter(|e| e.confidence == DiagramConfidence::Inferred)
        .collect();

    let confirmed_or_static_edges: Vec<&DiagramEdge> = arch_ov
        .model
        .edges
        .iter()
        .filter(|e| e.confidence == DiagramConfidence::Confirmed || e.confidence == DiagramConfidence::Static)
        .collect();

    assert!(!inferred_edges.is_empty(), "Must have inferred edges");
    assert!(!confirmed_or_static_edges.is_empty(), "Must have confirmed/static edges");

    // Ensure distinct IDs and relationships
    for inf in &inferred_edges {
        assert_eq!(inf.confidence, DiagramConfidence::Inferred);
        // Verify none of the confirmed edges share an ID with an inferred edge
        for conf in &confirmed_or_static_edges {
            assert_ne!(inf.id, conf.id);
        }
    }
}

// ---------------------------------------------------------------------------
// 8. Test: Synthetic graph above threshold returns collapsed overview,
//          and drill_down returns group's contents
// ---------------------------------------------------------------------------
#[test]
fn test_synthetic_threshold_and_drill_down() {
    // Generate synthetic model with 200 nodes across 4 groups
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let groups = vec![
        DiagramGroup {
            id: "group:frontend".to_string(),
            label: "Frontend".to_string(),
            parent_group: None,
            collapsed: false,
        },
        DiagramGroup {
            id: "group:backend".to_string(),
            label: "Backend".to_string(),
            parent_group: None,
            collapsed: false,
        },
        DiagramGroup {
            id: "group:data".to_string(),
            label: "Data".to_string(),
            parent_group: None,
            collapsed: false,
        },
        DiagramGroup {
            id: "group:utils".to_string(),
            label: "Utils".to_string(),
            parent_group: None,
            collapsed: false,
        },
    ];

    for i in 0..200 {
        let gid = match i % 4 {
            0 => "group:frontend",
            1 => "group:backend",
            2 => "group:data",
            _ => "group:utils",
        };
        nodes.push(DiagramNode {
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

    // Add internal edges (within frontend) and cross-group edges (frontend -> backend)
    for i in (0..200).step_by(4) {
        // Internal frontend edge (0 -> 4, 4 -> 8, etc.)
        if i + 4 < 200 {
            edges.push(DiagramEdge {
                id: format!("edge:internal:{}", i),
                from: format!("node:{}", i),
                to: format!("node:{}", i + 4),
                relationship: RelationshipType::Import,
                confidence: DiagramConfidence::Static,
                evidence_id: 1000 + i as i64,
                label: None,
            });
        }
        // Cross edge (frontend -> backend: i -> i+1)
        edges.push(DiagramEdge {
            id: format!("edge:cross:{}", i),
            from: format!("node:{}", i),
            to: format!("node:{}", i + 1),
            relationship: RelationshipType::Import,
            confidence: DiagramConfidence::Static,
            evidence_id: 2000 + i as i64,
            label: None,
        });
    }

    let synthetic_model = DiagramModel {
        diagram_type: DiagramType::FileDependency,
        nodes,
        edges,
        groups,
    };

    assert_eq!(synthetic_model.nodes.len(), 200);

    // 1. Threshold check produces collapsed overview
    let collapsed = apply_progressive_disclosure(&synthetic_model)
        .expect("Should produce collapsed overview for 200 nodes > 150 threshold");

    assert_eq!(collapsed.total_node_count, 200);
    assert_eq!(collapsed.threshold, 150);

    // Collapsed groups
    assert_eq!(collapsed.model.groups.len(), 4);
    for g in &collapsed.model.groups {
        assert!(g.collapsed);
    }

    // Aggregated edges keep track of underlying edge IDs and evidence
    assert!(!collapsed.aggregated_edges.is_empty());
    for agg in &collapsed.aggregated_edges {
        assert!(!agg.underlying_edge_ids.is_empty());
        assert_eq!(agg.underlying_edge_ids.len(), agg.evidence_ids.len());
        assert_eq!(agg.edge_count, agg.underlying_edge_ids.len());
    }

    // 2. Drill down into group:frontend
    let frontend_drill = drill_down(&synthetic_model, "group:frontend");
    assert_eq!(frontend_drill.group_id, "group:frontend");
    // Exactly 50 nodes in group:frontend (200 / 4 = 50)
    assert_eq!(frontend_drill.nodes.len(), 50);
    for n in &frontend_drill.nodes {
        assert_eq!(n.group_id.as_deref(), Some("group:frontend"));
    }

    // Internal edges returned for group:frontend
    assert!(!frontend_drill.edges.is_empty());
    for e in &frontend_drill.edges {
        assert!(e.id.starts_with("edge:internal"));
    }
}
