use std::path::PathBuf;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter, State};
use serde::{Deserialize, Serialize};

use crate::core::parser::{FileToParse, ParserLimits, ParserWorkerPool, WorkerPoolConfig};
use crate::core::store::projects::get_project_by_id;
use crate::core::store::symbols::persist_file_parse_result;
use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseProgressPayload {
    pub project_id: i64,
    pub files_parsed: usize,
    pub total_files: usize,
    pub current_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseCompletePayload {
    pub project_id: i64,
    pub total_parsed: usize,
    pub status: String,
}

#[tauri::command]
pub async fn start_parse(
    project_id: i64,
    concurrency: Option<usize>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    let project = get_project_by_id(&conn, project_id).map_err(|e| e.to_string())?;

    // Only queue files that need parsing (pending status: newly added or modified)
    let files_to_parse: Vec<FileToParse> = {
        let mut stmt = conn
            .prepare("SELECT id, relative_path, extension FROM files WHERE project_id = ?1 AND status = 'pending'")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([project_id], |r| {
                Ok(FileToParse {
                    file_id: r.get(0)?,
                    relative_path: r.get(1)?,
                    extension: r.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut list = Vec::new();
        for row in rows {
            list.push(row.map_err(|e| e.to_string())?);
        }
        list
    };

    let cancel_flag = state.parse_cancel_flag.clone();
    cancel_flag.store(false, Ordering::Relaxed);

    let db_path = state.db_path.clone();
    let root_path = PathBuf::from(&project.root_path);
    let app_handle = app.clone();

    if files_to_parse.is_empty() {
        app_handle.emit("parse:complete", ParseCompletePayload {
            project_id,
            total_parsed: 0,
            status: "completed".to_string(),
        }).ok();
        return Ok(());
    }

    let num_threads = concurrency.unwrap_or_else(|| {
        std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4)
    });

    std::thread::spawn(move || {
        let pool = ParserWorkerPool::new(WorkerPoolConfig {
            concurrency: num_threads,
            limits: ParserLimits::default(),
        });

        let app_progress = app_handle.clone();
        let cancel_for_worker = cancel_flag.clone();

        let parsed_results = match pool.parse_project_files(
            &root_path,
            files_to_parse,
            cancel_for_worker,
            move |progress| {
                app_progress.emit("parse:progress", ParseProgressPayload {
                    project_id,
                    files_parsed: progress.files_parsed,
                    total_files: progress.total_files,
                    current_file: progress.current_file,
                }).ok();
            },
        ) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("Parse worker pool failed: {}", e);
                return;
            }
        };

        // Persist results in SQLite
        if let Ok(mut db_conn) = crate::core::store::connection::open_database(&db_path) {
            for (file_id, result) in &parsed_results {
                if let Err(e) = persist_file_parse_result(&mut db_conn, project_id, *file_id, result) {
                    eprintln!("Failed to persist parsed symbols for {}: {}", result.relative_path, e);
                }
            }

            // Resolve calls and project-wide callers
            if let Err(e) = crate::core::graph::CallResolver::resolve_project_calls(&db_conn, project_id) {
                eprintln!("Failed to resolve project calls: {}", e);
            }
        }

        let is_cancelled = cancel_flag.load(Ordering::Relaxed);
        let final_status = if is_cancelled { "cancelled" } else { "completed" };

        app_handle.emit("parse:complete", ParseCompletePayload {
            project_id,
            total_parsed: parsed_results.len(),
            status: final_status.to_string(),
        }).ok();
    });

    Ok(())
}

#[tauri::command]
pub fn cancel_parse(state: State<'_, AppState>) {
    state.parse_cancel_flag.store(true, Ordering::Relaxed);
}

