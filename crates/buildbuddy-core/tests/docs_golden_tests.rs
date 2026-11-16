use std::fs;
use std::path::{Path, PathBuf};
use rusqlite::Connection;

use buildbuddy_core::arch::ArchitectureAnalyzer;
use buildbuddy_core::docs::{
    check_banned_phrases, DocStore, DependencyInventoryGenerator, ProjectOverviewGenerator,
};
use buildbuddy_core::graph::{
    CycleDetector, FileImportItem, ProjectGraphResolver, UnusedDependencyDetector,
};
use buildbuddy_core::manifest::package_json::parse_package_json;
use buildbuddy_core::manifest::python::{parse_pyproject_toml, parse_requirements_txt};
use buildbuddy_core::manifest::{DependencyType, ManifestDependency};
use buildbuddy_core::parser::{FileParseResult, ParserManager};
use buildbuddy_core::store::arch::ArchStore;
use buildbuddy_core::store::connection::open_in_memory;
use buildbuddy_core::store::files::{batch_insert_or_update_files, ScannedFileInsert};
use buildbuddy_core::store::graph::GraphStore;
use buildbuddy_core::store::migrations::run_migrations;
use buildbuddy_core::store::projects::create_or_get_project;

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("fixtures")
}

fn analyze_fixture_and_setup_db(dir: &Path, reverse_files: bool) -> (Connection, i64) {
    let mut conn = open_in_memory().unwrap();
    run_migrations(&conn).unwrap();

    let project = create_or_get_project(&conn, &dir.to_string_lossy(), "test-fixture").unwrap();
    let project_id = project.id;

    conn.execute(
        "INSERT INTO analysis_runs (id, project_id, status) VALUES (1, ?1, 'completed')",
        rusqlite::params![project_id],
    )
    .unwrap();

    // Discover files
    let mut raw_entries: Vec<_> = walkdir::WalkDir::new(dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .collect();

    if reverse_files {
        raw_entries.reverse();
    } else {
        raw_entries.sort_by(|a, b| a.path().cmp(b.path()));
    }

    let mut scanned_inserts = Vec::new();
    let mut all_files = Vec::new();
    let mut file_tuples = Vec::new();
    let mut parsed_results = Vec::new();
    let mut raw_imports = Vec::new();
    let mut manifest_deps: Vec<ManifestDependency> = Vec::new();

    let parser = ParserManager::new();
    let mut file_id_counter = 1i64;

    for entry in &raw_entries {
        let rel_path = entry
            .path()
            .strip_prefix(dir)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");

        // Skip existing golden files from project index so they don't pollute counts
        if rel_path.starts_with("expected-") {
            continue;
        }

        let content = fs::read_to_string(entry.path()).unwrap_or_default();
        let file_id = file_id_counter;
        file_id_counter += 1;

        let line_count = content.lines().count() as i64;
        let ext = entry.path().extension().and_then(|s| s.to_str()).map(|s| s.to_string());
        let file_name = entry.file_name().to_string_lossy().to_string();
        let content_hash = blake3::hash(content.as_bytes()).to_hex().to_string();

        scanned_inserts.push(ScannedFileInsert {
            relative_path: rel_path.clone(),
            file_name,
            extension: ext.clone(),
            size_bytes: content.len() as i64,
            line_count,
            content_hash,
            status: "parsed".to_string(),
        });

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

        if let Some(ref e) = ext {
            if matches!(e.as_str(), "ts" | "tsx" | "js" | "jsx" | "py") {
                if let Ok(parsed) = parser.parse_source(&rel_path, Some(e.as_str()), &content) {
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

    // Insert files into SQLite
    batch_insert_or_update_files(&mut conn, project_id, 1, &scanned_inserts).unwrap();

    // Map manifest files and insert manifest dependencies
    for dep in &manifest_deps {
        let manifest_file_id: i64 = conn.query_row(
            "SELECT id FROM files WHERE project_id = ?1 AND relative_path = ?2",
            rusqlite::params![project_id, dep.source_file],
            |r| r.get(0),
        ).unwrap_or(1);

        let dep_type_str = match dep.dep_type {
            DependencyType::Direct => "direct",
            DependencyType::Dev => "dev",
            DependencyType::Peer => "peer",
            DependencyType::Optional => "optional",
        };

        let line_num = dep.line_number.unwrap_or(1) as i64;
        let eid: i64 = conn.query_row(
            "INSERT INTO source_evidence (
                project_id, file_path, start_line, end_line,
                start_column, end_column, snippet, confidence, evidence_type
            ) VALUES (?1, ?2, ?3, ?3, 0, 0, ?4, 'confirmed', 'manifest_entry')
            RETURNING id",
            rusqlite::params![
                project_id,
                dep.source_file,
                line_num,
                format!("\"{}\": \"{}\"", dep.name, dep.version_spec.as_deref().unwrap_or("*")),
            ],
            |row| row.get(0),
        ).unwrap();

        conn.execute(
            "INSERT INTO manifest_dependencies (
                project_id, manifest_file_id, package_name, version_spec,
                dependency_type, source_evidence_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                project_id,
                manifest_file_id,
                dep.name,
                dep.version_spec,
                dep_type_str,
                eid,
            ],
        ).unwrap();
    }

    // Resolve import edges
    let tsconfig_content = fs::read_to_string(dir.join("tsconfig.json")).ok();
    let resolver = ProjectGraphResolver::new(&file_tuples, tsconfig_content.as_deref());
    let edges = resolver.resolve_all(&raw_imports);
    GraphStore::insert_import_edges(&mut conn, project_id, &edges).unwrap();

    // Run CycleDetector
    let cycles = CycleDetector::find_circular_dependencies(&edges);
    for cycle in cycles {
        let desc = cycle.cycle_files.join(" <-> ");
        let meta = serde_json::json!({ "cycle": cycle.cycle_files }).to_string();
        GraphStore::insert_finding(
            &conn,
            project_id,
            "circular_dependency",
            "Circular cycle detected",
            &desc,
            "medium",
            "static",
            None,
            &meta,
        ).unwrap();
    }

    // Run UnusedDependencyDetector
    let unused = UnusedDependencyDetector::find_unused(&manifest_deps, &edges);
    for u in unused {
        let meta = serde_json::json!({
            "package_name": u.package_name,
            "file": u.source_file,
            "line": u.line_number.unwrap_or(1),
        }).to_string();
        GraphStore::insert_finding(
            &conn,
            project_id,
            "unused_dependency",
            "Potentially unused dependency",
            &format!("{} ({})", u.package_name, u.source_file),
            "low",
            "inferred",
            None,
            &meta,
        ).unwrap();
    }

    // Run Architecture Analyzer
    let all_files_refs: Vec<(String, &str)> = all_files.iter().map(|(p, c)| (p.clone(), c.as_str())).collect();
    let parsed_refs: Vec<(String, &FileParseResult, &str)> = parsed_results
        .iter()
        .map(|(p, res, c)| (p.clone(), res, c.as_str()))
        .collect();

    let arch_report = ArchitectureAnalyzer::analyze(&all_files_refs, &parsed_refs, &manifest_deps, &edges);

    ArchStore::persist_architecture(
        &mut conn,
        project_id,
        &arch_report.frameworks,
        &arch_report.declared_only,
        &arch_report.entry_points,
        &arch_report.modules,
        &arch_report.architecture_model,
    ).unwrap();

    (conn, project_id)
}

fn verify_or_update_golden(path: &Path, content: &str) {
    let update_golden = std::env::var("UPDATE_GOLDEN").unwrap_or_default() == "1";
    if update_golden {
        fs::write(path, content).unwrap_or_else(|e| panic!("Failed to write golden {}: {}", path.display(), e));
    } else {
        assert!(
            path.exists(),
            "Golden file {} does not exist. Run with UPDATE_GOLDEN=1 to create it.",
            path.display()
        );
        let expected = fs::read_to_string(path)
            .unwrap_or_else(|e| panic!("Failed to read golden {}: {}", path.display(), e));
        let expected_normalized = expected.replace("\r\n", "\n");
        let content_normalized = content.replace("\r\n", "\n");
        assert_eq!(
            content_normalized.trim(),
            expected_normalized.trim(),
            "Mismatch in golden file {}",
            path.display()
        );
    }
}

#[test]
fn test_arch_react_express_docs_goldens() {
    let dir = fixtures_dir().join("arch-react-express");
    let (mut conn, project_id) = analyze_fixture_and_setup_db(&dir, false);

    let overview = ProjectOverviewGenerator::generate(&conn, project_id).unwrap();
    let overview_md = overview.render_markdown();
    verify_or_update_golden(&dir.join("expected-overview.md"), &overview_md);

    let dep_inv = DependencyInventoryGenerator::generate(&conn, project_id).unwrap();
    let dep_inv_md = dep_inv.render_markdown();
    verify_or_update_golden(&dir.join("expected-dependencies.md"), &dep_inv_md);

    // Verify persistence
    let doc_id = DocStore::save_document(&mut conn, project_id, &overview).unwrap();
    let retrieved = DocStore::get_document(&conn, project_id, buildbuddy_core::docs::DocumentType::ProjectOverview).unwrap();
    assert!(retrieved.is_some());
    assert_eq!(retrieved.unwrap().render_markdown(), overview_md);

    let rev = DocStore::get_latest_revision(&conn, doc_id).unwrap();
    assert!(rev.is_some());
    let (rev_num, rev_md) = rev.unwrap();
    assert_eq!(rev_num, 1);
    assert_eq!(rev_md, overview_md);
}

#[test]
fn test_arch_fastapi_docs_goldens() {
    let dir = fixtures_dir().join("arch-fastapi");
    let (conn, project_id) = analyze_fixture_and_setup_db(&dir, false);

    let overview = ProjectOverviewGenerator::generate(&conn, project_id).unwrap();
    let overview_md = overview.render_markdown();
    verify_or_update_golden(&dir.join("expected-overview.md"), &overview_md);

    let dep_inv = DependencyInventoryGenerator::generate(&conn, project_id).unwrap();
    let dep_inv_md = dep_inv.render_markdown();
    verify_or_update_golden(&dir.join("expected-dependencies.md"), &dep_inv_md);
}

#[test]
fn test_resolve_ts_docs_goldens() {
    let dir = fixtures_dir().join("resolve-ts");
    let (conn, project_id) = analyze_fixture_and_setup_db(&dir, false);

    let overview = ProjectOverviewGenerator::generate(&conn, project_id).unwrap();
    let overview_md = overview.render_markdown();
    verify_or_update_golden(&dir.join("expected-overview.md"), &overview_md);

    let dep_inv = DependencyInventoryGenerator::generate(&conn, project_id).unwrap();
    let dep_inv_md = dep_inv.render_markdown();
    verify_or_update_golden(&dir.join("expected-dependencies.md"), &dep_inv_md);
}

#[test]
fn test_docs_empty_all_fields_not_detected() {
    let dir = fixtures_dir().join("docs-empty");
    let (conn, project_id) = analyze_fixture_and_setup_db(&dir, false);

    let overview = ProjectOverviewGenerator::generate(&conn, project_id).unwrap();
    let overview_md = overview.render_markdown();
    verify_or_update_golden(&dir.join("expected-overview.md"), &overview_md);

    // Verify all missing sections have "Not detected"
    let purpose = overview.sections.iter().find(|s| s.section_key == "purpose").unwrap();
    assert_eq!(purpose.content.trim(), "Not detected");

    let frameworks = overview.sections.iter().find(|s| s.section_key == "frameworks").unwrap();
    assert_eq!(frameworks.content.trim(), "Not detected");

    let entry_points = overview.sections.iter().find(|s| s.section_key == "entry_points").unwrap();
    assert_eq!(entry_points.content.trim(), "Not detected");

    let major_modules = overview.sections.iter().find(|s| s.section_key == "major_modules").unwrap();
    assert_eq!(major_modules.content.trim(), "Not detected");

    let external_deps = overview.sections.iter().find(|s| s.section_key == "external_dependencies").unwrap();
    assert_eq!(external_deps.content.trim(), "Not detected");

    let dep_inv = DependencyInventoryGenerator::generate(&conn, project_id).unwrap();
    let dep_inv_md = dep_inv.render_markdown();
    verify_or_update_golden(&dir.join("expected-dependencies.md"), &dep_inv_md);

    let direct_deps = dep_inv.sections.iter().find(|s| s.section_key == "direct_dependencies").unwrap();
    assert_eq!(direct_deps.content.trim(), "Not detected");

    let dev_deps = dep_inv.sections.iter().find(|s| s.section_key == "dev_dependencies").unwrap();
    assert_eq!(dev_deps.content.trim(), "Not detected");

    let internal_deps = dep_inv.sections.iter().find(|s| s.section_key == "internal_dependencies").unwrap();
    assert_eq!(internal_deps.content.trim(), "Not detected");

    let circular_deps = dep_inv.sections.iter().find(|s| s.section_key == "circular_dependencies").unwrap();
    assert_eq!(circular_deps.content.trim(), "Not detected");

    let unused_deps = dep_inv.sections.iter().find(|s| s.section_key == "unused_dependencies").unwrap();
    assert_eq!(unused_deps.content.trim(), "Not detected");
}

#[test]
fn test_docs_secret_redaction() {
    let dir = fixtures_dir().join("docs-secret");
    let (conn, project_id) = analyze_fixture_and_setup_db(&dir, false);

    let overview = ProjectOverviewGenerator::generate(&conn, project_id).unwrap();
    let overview_md = overview.render_markdown();
    verify_or_update_golden(&dir.join("expected-overview.md"), &overview_md);

    let dep_inv = DependencyInventoryGenerator::generate(&conn, project_id).unwrap();
    let dep_inv_md = dep_inv.render_markdown();
    verify_or_update_golden(&dir.join("expected-dependencies.md"), &dep_inv_md);

    // Hard check: sk_live_ must NEVER appear in output
    assert!(!overview_md.contains("sk_live_"), "Fake API key leaked into overview markdown!");
    assert!(!dep_inv_md.contains("sk_live_"), "Fake API key leaked into dependencies markdown!");
    let purpose_sec = overview.sections.iter().find(|s| s.section_key == "purpose").unwrap();
    assert_eq!(purpose_sec.content.trim(), "Not detected (README present at README.md)");
}

#[test]
fn test_lint_passes_on_goldens_and_fails_on_seeded_bad_string() {
    let dir = fixtures_dir().join("arch-react-express");
    let (conn, project_id) = analyze_fixture_and_setup_db(&dir, false);

    let overview = ProjectOverviewGenerator::generate(&conn, project_id).unwrap();
    let dep_inv = DependencyInventoryGenerator::generate(&conn, project_id).unwrap();

    assert!(check_banned_phrases(&overview.render_markdown()).is_ok());
    assert!(check_banned_phrases(&dep_inv.render_markdown()).is_ok());

    // Seeded bad strings
    let bad_text_1 = "In today's rapidly evolving world, let's dive into this system.";
    let res1 = check_banned_phrases(bad_text_1);
    assert!(res1.is_err());
    let errs1 = res1.unwrap_err();
    assert!(errs1.iter().any(|e| e.phrase == "in today's"));
    assert!(errs1.iter().any(|e| e.phrase == "rapidly evolving"));
    assert!(errs1.iter().any(|e| e.phrase == "dive into"));

    let bad_text_2 = "This document aims to provide a comprehensive and robust overview.";
    let res2 = check_banned_phrases(bad_text_2);
    assert!(res2.is_err());
    let errs2 = res2.unwrap_err();
    assert!(errs2.iter().any(|e| e.phrase == "this document aims"));
    assert!(errs2.iter().any(|e| e.phrase == "comprehensive"));
    assert!(errs2.iter().any(|e| e.phrase == "robust"));
}

#[test]
fn test_determinism_byte_identical_on_shuffled_order() {
    let dir = fixtures_dir().join("arch-react-express");
    let (conn1, proj1) = analyze_fixture_and_setup_db(&dir, false);
    let (conn2, proj2) = analyze_fixture_and_setup_db(&dir, true); // reversed file order

    let overview1 = ProjectOverviewGenerator::generate(&conn1, proj1).unwrap().render_markdown();
    let overview2 = ProjectOverviewGenerator::generate(&conn2, proj2).unwrap().render_markdown();
    assert_eq!(overview1, overview2, "Overview markdown differs when file insertion order changes!");

    let dep1 = DependencyInventoryGenerator::generate(&conn1, proj1).unwrap().render_markdown();
    let dep2 = DependencyInventoryGenerator::generate(&conn2, proj2).unwrap().render_markdown();
    assert_eq!(dep1, dep2, "Dependency inventory differs when file insertion order changes!");
}

#[test]
fn test_all_file_references_exist_and_within_bounds() {
    let dir = fixtures_dir().join("arch-react-express");
    let (conn, project_id) = analyze_fixture_and_setup_db(&dir, false);

    let overview = ProjectOverviewGenerator::generate(&conn, project_id).unwrap();
    let dep_inv = DependencyInventoryGenerator::generate(&conn, project_id).unwrap();

    let all_evidence_keys: Vec<String> = overview
        .sections
        .iter()
        .chain(dep_inv.sections.iter())
        .flat_map(|s| s.evidence_keys.clone())
        .collect();

    for key in all_evidence_keys {
        // Format: {rel_path}:{start_line}-{end_line}:{evidence_type}
        let parts: Vec<&str> = key.split(':').collect();
        assert!(parts.len() >= 3, "Invalid evidence key format: {}", key);
        let rel_path = parts[0];
        let range_part = parts[1];

        // Skip directory keys like "src/client/:1-1:heuristic" or "./ (root):1-1:heuristic"
        if rel_path.ends_with('/') || rel_path.contains("(root)") {
            continue;
        }

        let line_count: Option<i64> = conn.query_row(
            "SELECT line_count FROM files WHERE project_id = ?1 AND relative_path = ?2",
            rusqlite::params![project_id, rel_path],
            |r| r.get(0),
        ).ok();

        assert!(
            line_count.is_some(),
            "Referenced file '{}' does not exist in project index!",
            rel_path
        );

        let lines_in_file = line_count.unwrap() as usize;
        let range_nums: Vec<&str> = range_part.split('-').collect();
        let start: usize = range_nums[0].parse().unwrap();
        let end: usize = range_nums.get(1).map(|s| s.parse().unwrap()).unwrap_or(start);

        assert!(start >= 1, "start line {} must be >= 1 for {}", start, key);
        assert!(
            end <= lines_in_file.max(1),
            "end line {} exceeds total lines {} in file {}",
            end,
            lines_in_file,
            rel_path
        );
    }
}
