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
fn test_verify_calls_ts_golden() {
    let dir = fixtures_dir().join("calls-ts");
    let sample_path = dir.join("sample.ts");
    let content = fs::read_to_string(&sample_path).expect("Read sample.ts");

    let manager = ParserManager::new();
    let result = manager
        .parse_source("fixtures/calls-ts/sample.ts", Some("ts"), &content)
        .expect("Parse sample.ts");

    assert_eq!(result.status, ParseStatus::Full);
    assert!(!result.functions.is_empty());
    assert!(!result.classes.is_empty());
    assert!(!result.calls.is_empty());

    // =========================================================================
    // Hand-computed Cyclomatic Complexity (CC) Verification for >= 5 Functions
    // Formula: CC = 1 (base) + sum(branches) + sum(loops)
    // =========================================================================

    // Function 1: simpleLinear
    // Arithmetic: CC = 1 (base) + 0 (branches) + 0 (loops) = 1
    let fn1 = result.functions.iter().find(|f| f.name == "simpleLinear").expect("find simpleLinear");
    assert_eq!(fn1.metrics.branch_count, 0, "simpleLinear branch count");
    assert_eq!(fn1.metrics.loop_count, 0, "simpleLinear loop count");
    assert_eq!(fn1.metrics.cyclomatic_complexity, 1, "simpleLinear CC arithmetic: 1 (base) = 1");

    // Function 2: singleBranch
    // Arithmetic: CC = 1 (base) + 1 (if) + 0 (loops) = 2
    let fn2 = result.functions.iter().find(|f| f.name == "singleBranch").expect("find singleBranch");
    assert_eq!(fn2.metrics.branch_count, 1, "singleBranch branch count");
    assert_eq!(fn2.metrics.loop_count, 0, "singleBranch loop count");
    assert_eq!(fn2.metrics.cyclomatic_complexity, 2, "singleBranch CC arithmetic: 1 (base) + 1 (if) = 2");

    // Function 3: compoundConditionWithEffects
    // Arithmetic: CC = 1 (base) + 1 (if) + 1 (&&) + 1 (||) + 0 (loops) = 4
    let fn3 = result.functions.iter().find(|f| f.name == "compoundConditionWithEffects").expect("find compoundConditionWithEffects");
    assert_eq!(fn3.metrics.branch_count, 3, "compoundConditionWithEffects branch count");
    assert_eq!(fn3.metrics.loop_count, 0, "compoundConditionWithEffects loop count");
    assert_eq!(fn3.metrics.cyclomatic_complexity, 4, "compoundConditionWithEffects CC arithmetic: 1 (base) + 1 (if) + 1 (&&) + 1 (||) = 4");
    assert_eq!(fn3.metrics.side_effects.len(), 1);
    assert_eq!(fn3.metrics.side_effects[0].category, "network");
    assert_eq!(fn3.metrics.side_effects[0].confidence, "static");

    // Function 4: loopWithCatchAndFs
    // Arithmetic: CC = 1 (base) + 1 (for loop) + 1 (if) + 1 (catch) = 4
    let fn4 = result.functions.iter().find(|f| f.name == "loopWithCatchAndFs").expect("find loopWithCatchAndFs");
    assert_eq!(fn4.metrics.branch_count, 2, "loopWithCatchAndFs branch count (if + catch)");
    assert_eq!(fn4.metrics.loop_count, 1, "loopWithCatchAndFs loop count (for..of)");
    assert_eq!(fn4.metrics.cyclomatic_complexity, 4, "loopWithCatchAndFs CC arithmetic: 1 (base) + 1 (for) + 1 (if) + 1 (catch) = 4");
    assert!(fn4.metrics.has_error_handling, "loopWithCatchAndFs has error handling");
    assert_eq!(fn4.metrics.side_effects.len(), 1);
    assert_eq!(fn4.metrics.side_effects[0].category, "fs");
    assert_eq!(fn4.metrics.side_effects[0].confidence, "static");

    // Function 5: complexSwitchAndDynamic
    // Arithmetic: CC = 1 (base) + 1 (ternary ? :) + 3 (cases 1, 2, 3) + 0 (loops) = 5
    let fn5 = result.functions.iter().find(|f| f.name == "complexSwitchAndDynamic").expect("find complexSwitchAndDynamic");
    assert_eq!(fn5.metrics.branch_count, 4, "complexSwitchAndDynamic branch count (ternary + 3 cases)");
    assert_eq!(fn5.metrics.loop_count, 0, "complexSwitchAndDynamic loop count");
    assert_eq!(fn5.metrics.cyclomatic_complexity, 5, "complexSwitchAndDynamic CC arithmetic: 1 (base) + 1 (ternary) + 3 (cases) = 5");
    assert_eq!(fn5.metrics.side_effects.len(), 1);
    assert_eq!(fn5.metrics.side_effects[0].category, "db");
    assert_eq!(fn5.metrics.side_effects[0].confidence, "static");

    // =========================================================================
    // Ambiguous & Dynamic Call Status Rules:
    // Ambiguous and dynamic calls MUST be 'inferred' or 'unknown'.
    // Test FAILS if any of them is labeled 'confirmed'.
    // =========================================================================
    for call in &result.calls {
        if call.callee_name.contains('[') || call.is_dynamic {
            assert_ne!(
                call.resolution_status,
                buildbuddy_core::symbols::CallResolutionStatus::Confirmed,
                "Dynamic call '{}' must NOT be labeled confirmed",
                call.callee_name
            );
            assert_eq!(
                call.resolution_status,
                buildbuddy_core::symbols::CallResolutionStatus::Inferred,
                "Dynamic call '{}' must be inferred",
                call.callee_name
            );
        }

        if call.callee_name == "client.fetchData" || call.callee_name == "callback" {
            assert_ne!(
                call.resolution_status,
                buildbuddy_core::symbols::CallResolutionStatus::Confirmed,
                "Ambiguous call '{}' must NOT be labeled confirmed",
                call.callee_name
            );
            assert_eq!(
                call.resolution_status,
                buildbuddy_core::symbols::CallResolutionStatus::Inferred,
                "Ambiguous call '{}' must be inferred",
                call.callee_name
            );
        }

        if call.callee_name == "unresolvedGlobalFunction" {
            assert_eq!(
                call.resolution_status,
                buildbuddy_core::symbols::CallResolutionStatus::Unknown,
                "Unresolved call '{}' must be unknown",
                call.callee_name
            );
        }
    }

    // Verify this.getBaseName() resolving to parent class method is static
    let parent_call = result.calls.iter().find(|c| c.callee_name == "this.getBaseName").expect("find this.getBaseName");
    assert_eq!(
        parent_call.resolution_status,
        buildbuddy_core::symbols::CallResolutionStatus::Static,
        "this.getBaseName() resolving to parent class method must be static"
    );

    // Verify this.internalCompute() defined in same class is confirmed
    let same_class_call = result.calls.iter().find(|c| c.callee_name == "this.internalCompute").expect("find this.internalCompute");
    assert_eq!(
        same_class_call.resolution_status,
        buildbuddy_core::symbols::CallResolutionStatus::Confirmed,
        "this.internalCompute() defined in same class must be confirmed"
    );

    // Golden JSON persistence/verification
    let calls_path = dir.join("expected-calls.json");
    let metrics_path = dir.join("expected-metrics.json");
    let update_golden = std::env::var("UPDATE_GOLDEN").unwrap_or_default() == "1";

    if update_golden {
        fs::write(&calls_path, serde_json::to_string_pretty(&result.calls).unwrap())
            .expect("Write expected-calls.json");
        fs::write(
            &metrics_path,
            serde_json::to_string_pretty(&(&result.functions, &result.classes)).unwrap(),
        )
        .expect("Write expected-metrics.json");
    } else {
        assert!(calls_path.exists(), "expected-calls.json does not exist. Run with UPDATE_GOLDEN=1 to generate it.");
        assert!(metrics_path.exists(), "expected-metrics.json does not exist. Run with UPDATE_GOLDEN=1 to generate it.");
    }

    let expected_calls: Vec<buildbuddy_core::symbols::ExtractedCallSite> =
        serde_json::from_str(&fs::read_to_string(&calls_path).expect("Read calls")).expect("Deserialize calls");
    assert_eq!(result.calls, expected_calls, "Calls mismatch");

    let expected_metrics: (Vec<buildbuddy_core::symbols::ExtractedFunction>, Vec<buildbuddy_core::symbols::ExtractedClass>) =
        serde_json::from_str(&fs::read_to_string(&metrics_path).expect("Read metrics")).expect("Deserialize metrics");
    assert_eq!(result.functions, expected_metrics.0, "Functions mismatch");
    assert_eq!(result.classes, expected_metrics.1, "Classes mismatch");
}

#[test]
fn test_verify_calls_py_golden() {
    let dir = fixtures_dir().join("calls-py");
    let sample_path = dir.join("sample.py");
    let content = fs::read_to_string(&sample_path).expect("Read sample.py");

    let manager = ParserManager::new();
    let result = manager
        .parse_source("fixtures/calls-py/sample.py", Some("py"), &content)
        .expect("Parse sample.py");

    assert_eq!(result.status, ParseStatus::Full);
    assert!(!result.functions.is_empty());
    assert!(!result.classes.is_empty());
    assert!(!result.calls.is_empty());

    // =========================================================================
    // Hand-computed Cyclomatic Complexity (CC) Verification for Python Functions
    // =========================================================================

    // Function 1: py_linear
    // Arithmetic: CC = 1 (base) + 0 (branches) + 0 (loops) = 1
    let fn1 = result.functions.iter().find(|f| f.name == "py_linear").expect("find py_linear");
    assert_eq!(fn1.metrics.branch_count, 0, "py_linear branch count");
    assert_eq!(fn1.metrics.loop_count, 0, "py_linear loop count");
    assert_eq!(fn1.metrics.cyclomatic_complexity, 1, "py_linear CC arithmetic: 1 (base) = 1");

    // Function 2: py_branch
    // Arithmetic: CC = 1 (base) + 1 (if) + 0 (loops) = 2
    let fn2 = result.functions.iter().find(|f| f.name == "py_branch").expect("find py_branch");
    assert_eq!(fn2.metrics.branch_count, 1, "py_branch branch count");
    assert_eq!(fn2.metrics.loop_count, 0, "py_branch loop count");
    assert_eq!(fn2.metrics.cyclomatic_complexity, 2, "py_branch CC arithmetic: 1 (base) + 1 (if) = 2");

    // Function 3: py_compound_with_network
    // Arithmetic: CC = 1 (base) + 1 (if) + 1 (and) + 1 (or) = 4
    let fn3 = result.functions.iter().find(|f| f.name == "py_compound_with_network").expect("find py_compound_with_network");
    assert_eq!(fn3.metrics.branch_count, 3, "py_compound_with_network branch count");
    assert_eq!(fn3.metrics.loop_count, 0, "py_compound_with_network loop count");
    assert_eq!(fn3.metrics.cyclomatic_complexity, 4, "py_compound_with_network CC arithmetic: 1 (base) + 1 (if) + 1 (and) + 1 (or) = 4");
    assert_eq!(fn3.metrics.side_effects.len(), 1);
    assert_eq!(fn3.metrics.side_effects[0].category, "network");
    assert_eq!(fn3.metrics.side_effects[0].confidence, "static");

    // Function 4: py_loop_with_fs
    // Arithmetic: CC = 1 (base) + 1 (for) + 1 (if) + 1 (except) = 4
    let fn4 = result.functions.iter().find(|f| f.name == "py_loop_with_fs").expect("find py_loop_with_fs");
    assert_eq!(fn4.metrics.branch_count, 2, "py_loop_with_fs branch count (if + except)");
    assert_eq!(fn4.metrics.loop_count, 1, "py_loop_with_fs loop count (for)");
    assert_eq!(fn4.metrics.cyclomatic_complexity, 4, "py_loop_with_fs CC arithmetic: 1 (base) + 1 (for) + 1 (if) + 1 (except) = 4");
    assert!(fn4.metrics.has_error_handling, "py_loop_with_fs has error handling");
    assert_eq!(fn4.metrics.side_effects.len(), 1);
    assert_eq!(fn4.metrics.side_effects[0].category, "fs");
    assert_eq!(fn4.metrics.side_effects[0].confidence, "static");

    // Function 5: py_conditional_elif_db
    // Arithmetic: CC = 1 (base) + 1 (conditional if/else) + 1 (if) + 1 (elif) = 4
    let fn5 = result.functions.iter().find(|f| f.name == "py_conditional_elif_db").expect("find py_conditional_elif_db");
    assert_eq!(fn5.metrics.branch_count, 3, "py_conditional_elif_db branch count");
    assert_eq!(fn5.metrics.loop_count, 0, "py_conditional_elif_db loop count");
    assert_eq!(fn5.metrics.cyclomatic_complexity, 4, "py_conditional_elif_db CC arithmetic: 1 (base) + 1 (conditional) + 1 (if) + 1 (elif) = 4");
    assert_eq!(fn5.metrics.side_effects.len(), 1);
    assert_eq!(fn5.metrics.side_effects[0].category, "db");
    assert_eq!(fn5.metrics.side_effects[0].confidence, "static");

    // =========================================================================
    // Ambiguous & Dynamic Call Status Rules:
    // Ambiguous and dynamic calls MUST be 'inferred' or 'unknown'.
    // Test FAILS if any of them is labeled 'confirmed'.
    // =========================================================================
    for call in &result.calls {
        if call.callee_name.contains('[') || call.is_dynamic {
            assert_ne!(
                call.resolution_status,
                buildbuddy_core::symbols::CallResolutionStatus::Confirmed,
                "Dynamic call '{}' must NOT be labeled confirmed",
                call.callee_name
            );
            assert_eq!(
                call.resolution_status,
                buildbuddy_core::symbols::CallResolutionStatus::Inferred,
                "Dynamic call '{}' must be inferred",
                call.callee_name
            );
        }

        if call.callee_name == "client.fetch_data" || call.callee_name == "callback" {
            assert_ne!(
                call.resolution_status,
                buildbuddy_core::symbols::CallResolutionStatus::Confirmed,
                "Ambiguous call '{}' must NOT be labeled confirmed",
                call.callee_name
            );
            assert_eq!(
                call.resolution_status,
                buildbuddy_core::symbols::CallResolutionStatus::Inferred,
                "Ambiguous call '{}' must be inferred",
                call.callee_name
            );
        }

        if call.callee_name == "unresolved_external_func" {
            assert_eq!(
                call.resolution_status,
                buildbuddy_core::symbols::CallResolutionStatus::Unknown,
                "Unresolved call '{}' must be unknown",
                call.callee_name
            );
        }
    }

    // Verify self.get_base_name() resolving to parent class method is static
    let parent_call = result.calls.iter().find(|c| c.callee_name == "self.get_base_name").expect("find self.get_base_name");
    assert_eq!(
        parent_call.resolution_status,
        buildbuddy_core::symbols::CallResolutionStatus::Static,
        "self.get_base_name() resolving to parent class method must be static"
    );

    // Verify self.internal_compute() defined in same class is confirmed
    let same_class_call = result.calls.iter().find(|c| c.callee_name == "self.internal_compute").expect("find self.internal_compute");
    assert_eq!(
        same_class_call.resolution_status,
        buildbuddy_core::symbols::CallResolutionStatus::Confirmed,
        "self.internal_compute() defined in same class must be confirmed"
    );

    // Golden JSON persistence/verification
    let calls_path = dir.join("expected-calls.json");
    let metrics_path = dir.join("expected-metrics.json");
    let update_golden = std::env::var("UPDATE_GOLDEN").unwrap_or_default() == "1";

    if update_golden {
        fs::write(&calls_path, serde_json::to_string_pretty(&result.calls).unwrap())
            .expect("Write expected-calls.json");
        fs::write(
            &metrics_path,
            serde_json::to_string_pretty(&(&result.functions, &result.classes)).unwrap(),
        )
        .expect("Write expected-metrics.json");
    } else {
        assert!(calls_path.exists(), "expected-calls.json does not exist. Run with UPDATE_GOLDEN=1 to generate it.");
        assert!(metrics_path.exists(), "expected-metrics.json does not exist. Run with UPDATE_GOLDEN=1 to generate it.");
    }

    let expected_calls: Vec<buildbuddy_core::symbols::ExtractedCallSite> =
        serde_json::from_str(&fs::read_to_string(&calls_path).expect("Read calls")).expect("Deserialize calls");
    assert_eq!(result.calls, expected_calls, "Calls mismatch");

    let expected_metrics: (Vec<buildbuddy_core::symbols::ExtractedFunction>, Vec<buildbuddy_core::symbols::ExtractedClass>) =
        serde_json::from_str(&fs::read_to_string(&metrics_path).expect("Read metrics")).expect("Deserialize metrics");
    assert_eq!(result.functions, expected_metrics.0, "Functions mismatch");
    assert_eq!(result.classes, expected_metrics.1, "Classes mismatch");
}

#[test]
fn test_call_edges_evidence_rows_persisted() {
    use buildbuddy_core::store::calls::{
        get_calls_for_file, get_classes_for_file, get_functions_for_file,
        get_instantiations_for_class,
    };
    use buildbuddy_core::store::connection::open_in_memory;
    use buildbuddy_core::store::migrations::run_migrations;
    use buildbuddy_core::store::projects::create_or_get_project;
    use buildbuddy_core::store::symbols::persist_file_parse_result;
    use rusqlite::params;

    let mut conn = open_in_memory().unwrap();
    run_migrations(&conn).unwrap();
    let proj = create_or_get_project(&conn, "/test/path", "test").unwrap();

    let dir = fixtures_dir().join("calls-ts");
    let sample_path = dir.join("sample.ts");
    let content = fs::read_to_string(&sample_path).expect("Read sample.ts");

    conn.execute(
        "INSERT INTO files (project_id, relative_path, file_name, extension, size_bytes, content_hash, status)
         VALUES (?1, 'fixtures/calls-ts/sample.ts', 'sample.ts', 'ts', ?2, 'hash1', 'pending')",
        params![proj.id, content.len() as i64],
    ).unwrap();
    let file_id = conn.last_insert_rowid();

    let manager = ParserManager::new();
    let result = manager
        .parse_source("fixtures/calls-ts/sample.ts", Some("ts"), &content)
        .expect("Parse sample.ts");

    persist_file_parse_result(&mut conn, proj.id, file_id, &result).unwrap();

    // Verify stored calls
    let stored_calls = get_calls_for_file(&conn, file_id).unwrap();
    assert!(!stored_calls.is_empty(), "Stored calls must not be empty");
    assert_eq!(stored_calls.len(), result.calls.len());

    // Verify EVERY call edge has an evidence row
    let orphaned_calls: i64 = conn
        .query_row(
            "SELECT count(*) FROM call_relationships c
             LEFT JOIN source_evidence e ON c.source_evidence_id = e.id
             WHERE e.id IS NULL",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(orphaned_calls, 0, "No call relationship without source_evidence");

    // Verify evidence row confidence strictly matches call resolution_status
    let mismatched_confidence: i64 = conn
        .query_row(
            "SELECT count(*) FROM call_relationships c
             JOIN source_evidence e ON c.source_evidence_id = e.id
             WHERE c.resolution_status != e.confidence",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(mismatched_confidence, 0, "Evidence confidence must match resolution_status");

    // Verify stored functions and metrics
    let stored_funcs = get_functions_for_file(&conn, file_id).unwrap();
    assert_eq!(stored_funcs.len(), result.functions.len());

    // Verify stored classes and instantiations
    let stored_classes = get_classes_for_file(&conn, file_id).unwrap();
    assert_eq!(stored_classes.len(), 1);
    assert_eq!(stored_classes[0].name, "AdvancedCalculator");
    assert_eq!(stored_classes[0].superclass_name.as_deref(), Some("BaseService"));
    assert_eq!(stored_classes[0].interfaces, vec!["ICalculator".to_string()]);

    let insts = get_instantiations_for_class(&conn, stored_classes[0].symbol_id).unwrap();
    assert_eq!(insts.len(), 1);
    assert_eq!(insts[0].class_name, "AdvancedCalculator");
}

#[test]
fn test_incremental_calls_recomputation() {
    use buildbuddy_core::scanner::incremental::IncrementalEngine;
    use buildbuddy_core::store::calls::get_calls_for_file;
    use buildbuddy_core::store::connection::open_in_memory;
    use buildbuddy_core::store::files::ScannedFileInsert;
    use buildbuddy_core::store::migrations::run_migrations;
    use buildbuddy_core::store::projects::create_or_get_project;
    use buildbuddy_core::store::symbols::persist_file_parse_result;
    use rusqlite::params;

    let mut conn = open_in_memory().unwrap();
    run_migrations(&conn).unwrap();
    let proj = create_or_get_project(&conn, "/test/path", "test").unwrap();

    let dir = fixtures_dir().join("calls-ts");
    let sample_path = dir.join("sample.ts");
    let content = fs::read_to_string(&sample_path).expect("Read sample.ts");

    conn.execute(
        "INSERT INTO files (project_id, relative_path, file_name, extension, size_bytes, content_hash, status)
         VALUES (?1, 'src/sample.ts', 'sample.ts', 'ts', 500, 'hash_initial', 'parsed')",
        params![proj.id],
    ).unwrap();
    let file_id = conn.last_insert_rowid();

    let manager = ParserManager::new();
    let result = manager
        .parse_source("src/sample.ts", Some("ts"), &content)
        .unwrap();

    persist_file_parse_result(&mut conn, proj.id, file_id, &result).unwrap();

    let initial_calls = get_calls_for_file(&conn, file_id).unwrap();
    assert!(!initial_calls.is_empty());

    // Now simulate modifying the file: new content hash
    let scanned_files = vec![ScannedFileInsert {
        relative_path: "src/sample.ts".to_string(),
        file_name: "sample.ts".to_string(),
        extension: Some("ts".to_string()),
        size_bytes: content.len() as i64,
        line_count: 50,
        content_hash: "hash_modified_123".to_string(),
        status: "pending".to_string(),
    }];

    let plan = IncrementalEngine::compute_plan(&conn, proj.id, &scanned_files).unwrap();
    assert_eq!(plan.modified.len(), 1);

    // Apply incremental deletions
    IncrementalEngine::apply_plan_deletions(&mut conn, &plan).unwrap();

    // Calls originating or targeting this file must be cleared
    let cleared_calls = get_calls_for_file(&conn, file_id).unwrap();
    assert_eq!(cleared_calls.len(), 0, "Calls cleared after modification in incremental plan");

    // Re-parse and re-persist only the modified file
    let re_result = manager
        .parse_source("src/sample.ts", Some("ts"), &content)
        .unwrap();
    persist_file_parse_result(&mut conn, proj.id, file_id, &re_result).unwrap();

    let recomputed_calls = get_calls_for_file(&conn, file_id).unwrap();
    assert_eq!(recomputed_calls.len(), initial_calls.len());
}

