use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::time::Instant;
use tauri::{AppHandle, Emitter, State};
use serde::{Deserialize, Serialize};

use crate::core::scanner::walker::scan_directory;
use crate::core::store::files::batch_insert_or_update_files;
use crate::core::store::projects::get_project_by_id;
use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgressPayload {
    pub project_id: i64,
    pub files_scanned: usize,
    pub current_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanCompletePayload {
    pub project_id: i64,
    pub analysis_run_id: i64,
    pub total_files: usize,
    pub duration_ms: u64,
    pub status: String,
}

#[tauri::command]
pub async fn start_scan(
    project_id: i64,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    let project = get_project_by_id(&conn, project_id).map_err(|e| e.to_string())?;

    // Create an analysis_runs record
    conn.execute(
        "INSERT INTO analysis_runs (project_id, status) VALUES (?1, 'in_progress')",
        rusqlite::params![project_id],
    ).map_err(|e| e.to_string())?;
    let run_id = conn.last_insert_rowid();

    let cancel_flag = state.scan_cancel_flag.clone();
    cancel_flag.store(false, Ordering::Relaxed);

    let db_path = state.db_path.clone();
    let root_path = PathBuf::from(&project.root_path);
    let app_clone = app.clone();

    // Run scanning in background thread
    tokio::task::spawn_blocking(move || {
        let start_time = Instant::now();
        let app_handle = app_clone;

        let scanned_res = scan_directory(
            &root_path,
            &[],
            cancel_flag.clone(),
            |progress| {
                app_handle.emit("scan:progress", ScanProgressPayload {
                    project_id,
                    files_scanned: progress.files_scanned,
                    current_file: progress.current_file,
                }).ok();
            },
        );

        let duration_ms = start_time.elapsed().as_millis() as u64;

        let mut db_conn = match crate::core::store::connection::open_database(&db_path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Failed to open DB for scan results: {}", e);
                return;
            }
        };

        match scanned_res {
            Ok(files) => {
                let is_cancelled = cancel_flag.load(Ordering::Relaxed);
                let final_status = if is_cancelled { "cancelled" } else { "completed" };
                let total_count = files.len();

                // Persist files in SQLite
                if let Err(e) = batch_insert_or_update_files(&mut db_conn, project_id, run_id, &files) {
                    eprintln!("Failed to persist scanned files: {}", e);
                }

                // Update analysis_run record
                db_conn.execute(
                    "UPDATE analysis_runs 
                     SET status = ?1, files_discovered = ?2, files_scanned = ?2, completed_at = CURRENT_TIMESTAMP, duration_ms = ?3 
                     WHERE id = ?4",
                    rusqlite::params![final_status, total_count as i64, duration_ms as i64, run_id],
                ).ok();

                app_handle.emit("scan:complete", ScanCompletePayload {
                    project_id,
                    analysis_run_id: run_id,
                    total_files: total_count,
                    duration_ms,
                    status: final_status.to_string(),
                }).ok();
            }
            Err(e) => {
                db_conn.execute(
                    "UPDATE analysis_runs 
                     SET status = 'failed', completed_at = CURRENT_TIMESTAMP, duration_ms = ?1, error_summary = ?2 
                     WHERE id = ?3",
                    rusqlite::params![duration_ms as i64, e.to_string(), run_id],
                ).ok();

                app_handle.emit("scan:complete", ScanCompletePayload {
                    project_id,
                    analysis_run_id: run_id,
                    total_files: 0,
                    duration_ms,
                    status: "failed".to_string(),
                }).ok();
            }
        }
    });

    Ok(run_id)
}

#[tauri::command]
pub async fn cancel_scan(state: State<'_, AppState>) -> Result<bool, String> {
    state.scan_cancel_flag.store(true, Ordering::Relaxed);
    Ok(true)
}

