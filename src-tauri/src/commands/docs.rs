use buildbuddy_core::diagram::export::validate_export_path;
use buildbuddy_core::docs::model::{DocumentType, GeneratedDocument};
use buildbuddy_core::docs::store::{DocStore, StoredDocumentRevision};
use buildbuddy_core::docs::generate_document_by_type;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::State;

use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentExportResult {
    pub success: bool,
    pub path: String,
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[tauri::command]
pub async fn get_document(
    project_id: i64,
    doc_type: String,
    state: State<'_, AppState>,
) -> Result<GeneratedDocument, String> {
    let dtype = doc_type.parse::<DocumentType>().map_err(|e| e.to_string())?;
    let mut conn = state.conn().map_err(|e| e.to_string())?;

    if let Some(existing) = DocStore::get_document(&conn, project_id, dtype).map_err(|e| e.to_string())? {
        return Ok(existing);
    }

    // Generate fresh document and persist
    let doc = generate_document_by_type(&conn, project_id, dtype).map_err(|e| e.to_string())?;
    DocStore::save_document(&mut conn, project_id, &doc).map_err(|e| e.to_string())?;
    Ok(doc)
}

#[tauri::command]
pub async fn generate_document(
    project_id: i64,
    doc_type: String,
    state: State<'_, AppState>,
) -> Result<GeneratedDocument, String> {
    let dtype = doc_type.parse::<DocumentType>().map_err(|e| e.to_string())?;
    let mut conn = state.conn().map_err(|e| e.to_string())?;

    let doc = generate_document_by_type(&conn, project_id, dtype).map_err(|e| e.to_string())?;
    DocStore::save_document(&mut conn, project_id, &doc).map_err(|e| e.to_string())?;
    Ok(doc)
}

#[tauri::command]
pub async fn save_document_section(
    project_id: i64,
    doc_type: String,
    section_key: String,
    content: String,
    title: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let dtype = doc_type.parse::<DocumentType>().map_err(|e| e.to_string())?;
    let mut conn = state.conn().map_err(|e| e.to_string())?;
    let sec_title = title.as_deref().unwrap_or(&section_key);
    DocStore::upsert_section(&mut conn, project_id, dtype, &section_key, sec_title, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_document_revisions(
    project_id: i64,
    doc_type: String,
    state: State<'_, AppState>,
) -> Result<Vec<StoredDocumentRevision>, String> {
    let dtype = doc_type.parse::<DocumentType>().map_err(|e| e.to_string())?;
    let conn = state.conn().map_err(|e| e.to_string())?;
    DocStore::list_revisions(&conn, project_id, dtype).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_document(
    project_id: i64,
    doc_type: String,
    format: String,
    target_path: String,
    state: State<'_, AppState>,
) -> Result<DocumentExportResult, String> {
    let dtype = doc_type.parse::<DocumentType>().map_err(|e| e.to_string())?;
    let conn = state.conn().map_err(|e| e.to_string())?;

    let root_path: String = conn.query_row(
        "SELECT root_path FROM projects WHERE id = ?1",
        rusqlite::params![project_id],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;

    // Security validation: never write inside analyzed project root
    let target = Path::new(&target_path);
    let root = Path::new(&root_path);
    validate_export_path(target, root).map_err(|e| e.to_string())?;

    let doc = DocStore::get_document(&conn, project_id, dtype)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Document has not been generated yet".to_string())?;

    let markdown = doc.render_markdown();
    let output_content = if format == "html" {
        format!(
            "<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<title>{}</title>\n<style>\nbody {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #24292f; }}\npre {{ background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }}\ntable {{ border-collapse: collapse; width: 100%; margin: 16px 0; }}\nth, td {{ border: 1px solid #d0d7de; padding: 8px 12px; text-align: left; }}\nth {{ background: #f6f8fa; }}\n</style>\n</head>\n<body>\n<pre>{}</pre>\n</body>\n</html>",
            doc.title,
            escape_html(&markdown)
        )
    } else {
        markdown
    };

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(target, output_content).map_err(|e| e.to_string())?;

    Ok(DocumentExportResult {
        success: true,
        path: target_path,
    })
}
