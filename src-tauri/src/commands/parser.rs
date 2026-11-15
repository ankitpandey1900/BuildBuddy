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

pub fn get_pending_files_to_parse(
    conn: &rusqlite::Connection,
    project_id: i64,
) -> rusqlite::Result<Vec<FileToParse>> {
    let mut stmt = conn.prepare(
        "SELECT id, relative_path, extension FROM files WHERE project_id = ?1 AND status = 'pending'",
    )?;
    let rows = stmt.query_map([project_id], |r| {
        Ok(FileToParse {
            file_id: r.get(0)?,
            relative_path: r.get(1)?,
            extension: r.get(2)?,
        })
    })?;
    let mut list = Vec::new();
    for row in rows {
        list.push(row?);
    }
    Ok(list)
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
    let files_to_parse: Vec<FileToParse> = get_pending_files_to_parse(&conn, project_id)
        .map_err(|e| e.to_string())?;

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::scanner::incremental::IncrementalEngine;
    use crate::core::store::connection::open_in_memory;
    use crate::core::store::files::ScannedFileInsert;
    use crate::core::store::migrations::run_migrations;
    use crate::core::store::projects::create_or_get_project;
    use rusqlite::params;

    #[test]
    fn test_get_pending_files_to_parse_skips_unchanged() {
        let mut conn = open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let proj = create_or_get_project(&conn, "/test/path", "test").unwrap();

        // 1. Insert 3 files: 2 parsed (unchanged), 1 pending (new or modified)
        conn.execute(
            "INSERT INTO files (project_id, relative_path, file_name, extension, size_bytes, content_hash, status)
             VALUES (?1, 'src/unchanged1.ts', 'unchanged1.ts', 'ts', 100, 'hash1', 'parsed')",
            params![proj.id],
        ).unwrap();

        conn.execute(
            "INSERT INTO files (project_id, relative_path, file_name, extension, size_bytes, content_hash, status)
             VALUES (?1, 'src/pending_new.ts', 'pending_new.ts', 'ts', 200, 'hash2', 'pending')",
            params![proj.id],
        ).unwrap();
        let pending_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO files (project_id, relative_path, file_name, extension, size_bytes, content_hash, status)
             VALUES (?1, 'src/unchanged2.ts', 'unchanged2.ts', 'ts', 300, 'hash3', 'parsed')",
            params![proj.id],
        ).unwrap();

        // 2. Command query should ONLY return the pending file
        let to_parse = get_pending_files_to_parse(&conn, proj.id).unwrap();
        assert_eq!(to_parse.len(), 1, "Only 1 file with status='pending' should be queued");
        assert_eq!(to_parse[0].file_id, pending_id);
        assert_eq!(to_parse[0].relative_path, "src/pending_new.ts");

        // 3. Simulate re-scan where no files changed
        let scanned = vec![
            ScannedFileInsert {
                relative_path: "src/unchanged1.ts".to_string(),
                file_name: "unchanged1.ts".to_string(),
                extension: Some("ts".to_string()),
                size_bytes: 100,
                line_count: 10,
                content_hash: "hash1".to_string(),
                status: "pending".to_string(),
            },
            ScannedFileInsert {
                relative_path: "src/unchanged2.ts".to_string(),
                file_name: "unchanged2.ts".to_string(),
                extension: Some("ts".to_string()),
                size_bytes: 300,
                line_count: 20,
                content_hash: "hash3".to_string(),
                status: "pending".to_string(),
            },
        ];

        // Mark pending_new as parsed as well (simulating parse finished)
        conn.execute("UPDATE files SET status = 'parsed' WHERE id = ?1", params![pending_id]).unwrap();

        let plan = IncrementalEngine::compute_plan(&conn, proj.id, &scanned).unwrap();
        assert_eq!(plan.unchanged.len(), 2);
        assert_eq!(plan.modified.len(), 0);

        // Files to parse must be 0 after re-scan with unchanged content
        let to_parse_after = get_pending_files_to_parse(&conn, proj.id).unwrap();
        assert_eq!(to_parse_after.len(), 0, "No files should be parsed on re-scan when unchanged");

        // 4. Now modify unchanged1.ts
        let scanned_modified = vec![
            ScannedFileInsert {
                relative_path: "src/unchanged1.ts".to_string(),
                file_name: "unchanged1.ts".to_string(),
                extension: Some("ts".to_string()),
                size_bytes: 150,
                line_count: 15,
                content_hash: "hash1_modified".to_string(),
                status: "pending".to_string(),
            },
        ];
        let plan_modified = IncrementalEngine::compute_plan(&conn, proj.id, &scanned_modified).unwrap();
        assert_eq!(plan_modified.modified.len(), 1);

        IncrementalEngine::apply_plan_deletions(&mut conn, &plan_modified).unwrap();

        let to_parse_modified = get_pending_files_to_parse(&conn, proj.id).unwrap();
        assert_eq!(to_parse_modified.len(), 1);
        assert_eq!(to_parse_modified[0].relative_path, "src/unchanged1.ts");
    }
}

