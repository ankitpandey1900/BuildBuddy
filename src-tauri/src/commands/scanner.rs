use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::time::Instant;
use tauri::{AppHandle, Emitter, State};
use serde::{Deserialize, Serialize};

use crate::core::pipeline::PipelineRunner;
use crate::core::store::projects::get_project_by_id;
use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgressPayload {
    pub project_id: i64,
    pub files_scanned: usize,
    pub current_file: String,
    pub stage: Option<String>,
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

    // Run full pipeline in background thread
    tokio::task::spawn_blocking(move || {
        let app_handle = app_clone;
        let mut db_conn = match crate::core::store::connection::open_database(&db_path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Failed to open DB for pipeline: {}", e);
                return;
            }
        };

        let start_time = Instant::now();
        let app_progress = app_handle.clone();
        let res = PipelineRunner::run(
            &mut db_conn,
            project_id,
            run_id,
            &root_path,
            cancel_flag.clone(),
            move |prog| {
                app_progress.emit("scan:progress", ScanProgressPayload {
                    project_id,
                    files_scanned: prog.count,
                    current_file: prog.message,
                    stage: Some(prog.stage.as_str().to_string()),
                }).ok();
            },
        );

        let duration_ms = start_time.elapsed().as_millis() as u64;

        let (final_status, total_files) = match res {
            Ok(report) => ("completed".to_string(), report.architecture_model.nodes.len()),
            Err(e) => {
                let is_cancelled = cancel_flag.load(Ordering::Relaxed);
                let st = if is_cancelled { "cancelled" } else { "failed" };
                db_conn.execute(
                    "UPDATE analysis_runs SET status = ?1, error_summary = ?2 WHERE id = ?3",
                    rusqlite::params![st, e, run_id],
                ).ok();
                (st.to_string(), 0)
            }
        };

        app_handle.emit("scan:complete", ScanCompletePayload {
            project_id,
            analysis_run_id: run_id,
            total_files,
            duration_ms,
            status: final_status,
        }).ok();
    });

    Ok(run_id)
}

#[tauri::command]
pub async fn cancel_scan(state: State<'_, AppState>) -> Result<bool, String> {
    state.scan_cancel_flag.store(true, Ordering::Relaxed);
    Ok(true)
}

