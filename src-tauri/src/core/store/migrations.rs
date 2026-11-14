use rusqlite::{Connection, Result};

pub fn run_migrations(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            root_path TEXT NOT NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            settings_json TEXT DEFAULT '{}' NOT NULL
        );

        CREATE TABLE IF NOT EXISTS analysis_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            completed_at DATETIME,
            status TEXT CHECK(status IN ('in_progress', 'completed', 'failed', 'cancelled')) NOT NULL,
            is_incremental INTEGER DEFAULT 0 NOT NULL,
            files_discovered INTEGER DEFAULT 0 NOT NULL,
            files_scanned INTEGER DEFAULT 0 NOT NULL,
            files_parsed INTEGER DEFAULT 0 NOT NULL,
            duration_ms INTEGER,
            error_summary TEXT
        );

        CREATE TABLE IF NOT EXISTS project_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            analysis_run_id INTEGER NOT NULL REFERENCES analysis_runs(id) ON DELETE CASCADE,
            git_commit_hash TEXT,
            git_branch TEXT,
            snapshot_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
        );

        CREATE TABLE IF NOT EXISTS source_evidence (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            file_path TEXT NOT NULL,
            start_line INTEGER NOT NULL,
            end_line INTEGER NOT NULL,
            start_column INTEGER NOT NULL,
            end_column INTEGER NOT NULL,
            snippet TEXT,
            confidence TEXT CHECK(confidence IN ('confirmed', 'static', 'inferred', 'unknown')) NOT NULL,
            evidence_type TEXT CHECK(evidence_type IN ('ast_node', 'manifest_entry', 'import_stmt', 'call_site', 'type_annotation', 'heuristic')) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_source_evidence_lookup 
        ON source_evidence(project_id, file_path, start_line);

        CREATE TABLE IF NOT EXISTS languages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            category TEXT CHECK(category IN ('programming', 'markup', 'data', 'config')) NOT NULL
        );

        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            relative_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            extension TEXT,
            language_id INTEGER REFERENCES languages(id) ON DELETE SET NULL,
            size_bytes INTEGER NOT NULL,
            line_count INTEGER DEFAULT 0 NOT NULL,
            function_count INTEGER DEFAULT 0 NOT NULL,
            class_count INTEGER DEFAULT 0 NOT NULL,
            import_count INTEGER DEFAULT 0 NOT NULL,
            content_hash TEXT NOT NULL,
            status TEXT CHECK(status IN ('pending', 'parsed', 'ignored', 'error', 'unsupported')) NOT NULL,
            last_analysis_run_id INTEGER REFERENCES analysis_runs(id) ON DELETE SET NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            UNIQUE(project_id, relative_path)
        );

        CREATE INDEX IF NOT EXISTS idx_files_project_path ON files(project_id, relative_path);
        CREATE INDEX IF NOT EXISTS idx_files_extension ON files(extension);
        CREATE INDEX IF NOT EXISTS idx_files_hash ON files(project_id, content_hash);
        "
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::store::connection::open_in_memory;

    #[test]
    fn test_migrations_run_cleanly() {
        let conn = open_in_memory().unwrap();
        let res = run_migrations(&conn);
        assert!(res.is_ok());

        // Verify tables exist
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
            .unwrap();
        let tables: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();

        assert!(tables.contains(&"projects".to_string()));
        assert!(tables.contains(&"analysis_runs".to_string()));
        assert!(tables.contains(&"files".to_string()));
        assert!(tables.contains(&"source_evidence".to_string()));
    }
}

