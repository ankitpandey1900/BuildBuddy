use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use buildbuddy_core::pipeline::PipelineRunner;
use buildbuddy_core::store::connection::open_in_memory;
use buildbuddy_core::store::migrations::run_migrations;
use buildbuddy_core::store::projects::create_or_get_project;
use rusqlite::params;

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("fixtures")
}

#[test]
fn test_full_pipeline_on_arch_react_express() {
    let fixture_path = fixtures_dir().join("arch-react-express");
    assert!(fixture_path.exists(), "fixtures/arch-react-express must exist");

    let mut conn = open_in_memory().unwrap();
    run_migrations(&conn).unwrap();

    let proj = create_or_get_project(
        &conn,
        fixture_path.to_str().unwrap(),
        "arch-react-express",
    ).unwrap();

    conn.execute(
        "INSERT INTO analysis_runs (project_id, status) VALUES (?1, 'in_progress')",
        params![proj.id],
    ).unwrap();
    let run_id = conn.last_insert_rowid();

    let cancel_flag = Arc::new(AtomicBool::new(false));

    let stages_visited = Arc::new(std::sync::Mutex::new(Vec::new()));
    let st_clone = stages_visited.clone();
    let report_res = PipelineRunner::run(
        &mut conn,
        proj.id,
        run_id,
        &fixture_path,
        cancel_flag,
        move |progress| {
            st_clone.lock().unwrap().push(progress.stage);
        },
    );

    assert!(report_res.is_ok(), "PipelineRunner failed: {:?}", report_res.err());
    let report = report_res.unwrap();

    // 1. Assert analysis_runs status is completed
    let run_status: String = conn.query_row(
        "SELECT status FROM analysis_runs WHERE id = ?1",
        params![run_id],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(run_status, "completed", "Overall run status must be 'completed'");

    // 2. Assert symbols > 0
    let symbol_count: i64 = conn.query_row(
        "SELECT count(*) FROM symbols WHERE project_id = ?1",
        params![proj.id],
        |r| r.get(0),
    ).unwrap();
    println!("Total symbols extracted and persisted: {}", symbol_count);
    assert!(symbol_count > 0, "Symbols count must be > 0 (got {})", symbol_count);

    // 3. Assert modules > 0
    let module_count: i64 = conn.query_row(
        "SELECT count(*) FROM modules WHERE project_id = ?1",
        params![proj.id],
        |r| r.get(0),
    ).unwrap();
    println!("Total modules detected: {}", module_count);
    assert!(module_count > 0, "Modules count must be > 0 (got {})", module_count);

    // 4. Assert React and Express detected in frameworks
    let mut stmt = conn.prepare("SELECT name FROM frameworks WHERE project_id = ?1").unwrap();
    let framework_names: Vec<String> = stmt.query_map(params![proj.id], |r| r.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();
    println!("Detected frameworks: {:?}", framework_names);

    let has_react = framework_names.iter().any(|f| f.to_lowercase().contains("react"));
    let has_express = framework_names.iter().any(|f| f.to_lowercase().contains("express"));

    assert!(has_react, "React must be detected in frameworks (found: {:?})", framework_names);
    assert!(has_express, "Express must be detected in frameworks (found: {:?})", framework_names);

    // Also verify from report directly
    assert!(report.frameworks.iter().any(|f| f.name.to_lowercase().contains("react")));
    assert!(report.frameworks.iter().any(|f| f.name.to_lowercase().contains("express")));
    assert!(!report.modules.is_empty(), "Modules in report must not be empty");

    // 5. Assert no files in error state
    let error_files: i64 = conn.query_row(
        "SELECT count(*) FROM files WHERE project_id = ?1 AND status = 'error'",
        params![proj.id],
        |r| r.get(0),
    ).unwrap();
    assert_eq!(error_files, 0, "No files should be in error state");
}
