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
fn test_generate_or_verify_ts_golden() {
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

    let expected_path = dir.join("expected-symbols.json");
    if !expected_path.exists() {
        let serialized = serde_json::to_string_pretty(&result.symbols).unwrap();
        fs::write(&expected_path, serialized).expect("Write expected-symbols.json");
    }

    let expected_str = fs::read_to_string(&expected_path).expect("Read expected-symbols.json");
    let expected_symbols: Vec<buildbuddy_core::symbols::ExtractedSymbol> =
        serde_json::from_str(&expected_str).expect("Deserialize expected");

    assert_eq!(result.symbols, expected_symbols);
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
fn test_generate_or_verify_py_golden() {
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

    let expected_path = dir.join("expected-symbols.json");
    if !expected_path.exists() {
        let serialized = serde_json::to_string_pretty(&result.symbols).unwrap();
        fs::write(&expected_path, serialized).expect("Write expected-symbols.json");
    }

    let expected_str = fs::read_to_string(&expected_path).expect("Read expected-symbols.json");
    let expected_symbols: Vec<buildbuddy_core::symbols::ExtractedSymbol> =
        serde_json::from_str(&expected_str).expect("Deserialize expected");

    assert_eq!(result.symbols, expected_symbols);
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
