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
