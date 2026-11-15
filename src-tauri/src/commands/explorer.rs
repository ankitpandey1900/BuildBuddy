use std::fs::File;
use std::io::Read;
use std::path::PathBuf;
use tauri::State;
use serde::{Deserialize, Serialize};

use crate::core::store::files::{get_file_by_id as get_file_db, list_files_for_project, FileRecord};
use crate::core::store::projects::get_project_by_id;
use crate::core::store::symbols::{
    get_imports_for_file, get_symbol_detail as get_symbol_detail_db, get_symbols_for_file,
    list_symbols as list_symbols_db, search_symbols_fts, SymbolDetail, SymbolRecord,
};
use crate::core::symbols::{ExtractedImport, ExtractedSymbol};
use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContentDto {
    pub file_name: String,
    pub relative_path: String,
    pub extension: Option<String>,
    pub size_bytes: i64,
    pub content: String,
    pub is_truncated: bool,
}

#[tauri::command]
pub async fn get_files(
    project_id: i64,
    search: Option<String>,
    extension: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<FileRecord>, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    list_files_for_project(
        &conn,
        project_id,
        search.as_deref(),
        extension.as_deref(),
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_file_details(
    file_id: i64,
    state: State<'_, AppState>,
) -> Result<FileRecord, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    get_file_db(&conn, file_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn read_file_content(
    project_id: i64,
    relative_path: String,
    state: State<'_, AppState>,
) -> Result<FileContentDto, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    let project = get_project_by_id(&conn, project_id).map_err(|e| e.to_string())?;

    let root_path = PathBuf::from(&project.root_path);
    let target_path = root_path.join(&relative_path);

    // Confinement check: canonical path must start with canonical root path
    let canonical_root = root_path
        .canonicalize()
        .map_err(|e| format!("Invalid project root: {}", e))?;
    let canonical_target = target_path
        .canonicalize()
        .map_err(|e| format!("File not found or invalid: {}", e))?;

    if !canonical_target.starts_with(&canonical_root) {
        return Err("Security violation: path traversal outside project root is forbidden".to_string());
    }

    let metadata = std::fs::metadata(&canonical_target)
        .map_err(|e| format!("Cannot read file metadata: {}", e))?;
    let size_bytes = metadata.len() as i64;

    // Safety limit: 10MB
    const MAX_SIZE: u64 = 10 * 1024 * 1024;
    let mut file = File::open(&canonical_target)
        .map_err(|e| format!("Failed to open file: {}", e))?;

    let mut buffer = Vec::new();
    let mut is_truncated = false;

    if size_bytes > MAX_SIZE as i64 {
        is_truncated = true;
        let mut handle = (&mut file).take(MAX_SIZE);
        handle.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
    } else {
        file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
    }

    // Convert to UTF-8 lossy if non-UTF8 binary characters exist
    let content = String::from_utf8_lossy(&buffer).to_string();

    let file_name = canonical_target
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_default();

    let extension = canonical_target
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase());

    Ok(FileContentDto {
        file_name,
        relative_path,
        extension,
        size_bytes,
        content,
        is_truncated,
    })
}

#[tauri::command]
pub async fn get_file_symbols(
    file_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<ExtractedSymbol>, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    get_symbols_for_file(&conn, file_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_file_imports(
    file_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<ExtractedImport>, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    get_imports_for_file(&conn, file_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_symbols(
    project_id: i64,
    query: String,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<(String, String, String)>, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    search_symbols_fts(&conn, project_id, &query, limit.unwrap_or(20)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_symbols(
    project_id: i64,
    file_id: Option<i64>,
    kind: Option<String>,
    search: Option<String>,
    limit: Option<usize>,
    offset: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<SymbolRecord>, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    list_symbols_db(
        &conn,
        project_id,
        file_id,
        kind.as_deref(),
        search.as_deref(),
        limit.unwrap_or(100),
        offset.unwrap_or(0),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_symbol_detail(
    symbol_id: i64,
    state: State<'_, AppState>,
) -> Result<Option<SymbolDetail>, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    get_symbol_detail_db(&conn, symbol_id).map_err(|e| e.to_string())
}

