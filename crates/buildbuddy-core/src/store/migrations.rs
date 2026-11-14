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
            evidence_type TEXT CHECK(evidence_type IN ('ast_node', 'manifest_entry', 'import_stmt', 'export_stmt', 'call_site', 'type_annotation', 'heuristic')) NOT NULL,
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

        CREATE TABLE IF NOT EXISTS symbols (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
            stable_id TEXT NOT NULL,
            name TEXT NOT NULL,
            qualified_name TEXT NOT NULL,
            kind TEXT NOT NULL,
            parent_name TEXT,
            signature TEXT,
            return_type TEXT,
            visibility TEXT,
            is_exported INTEGER DEFAULT 0 NOT NULL,
            is_async INTEGER DEFAULT 0 NOT NULL,
            docstring TEXT,
            source_evidence_id INTEGER REFERENCES source_evidence(id) ON DELETE SET NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            UNIQUE(project_id, stable_id)
        );

        CREATE INDEX IF NOT EXISTS idx_symbols_file_id ON symbols(file_id);
        CREATE INDEX IF NOT EXISTS idx_symbols_stable_id ON symbols(project_id, stable_id);
        CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(project_id, name);

        CREATE TABLE IF NOT EXISTS imports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
            source_module TEXT NOT NULL,
            imported_name TEXT NOT NULL,
            alias TEXT,
            is_type_only INTEGER DEFAULT 0 NOT NULL,
            line_number INTEGER NOT NULL,
            source_evidence_id INTEGER REFERENCES source_evidence(id) ON DELETE SET NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_imports_file_id ON imports(file_id);

        CREATE TABLE IF NOT EXISTS exports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
            exported_name TEXT NOT NULL,
            local_name TEXT NOT NULL,
            is_default INTEGER DEFAULT 0 NOT NULL,
            line_number INTEGER NOT NULL,
            source_evidence_id INTEGER REFERENCES source_evidence(id) ON DELETE SET NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_exports_file_id ON exports(file_id);

        CREATE VIRTUAL TABLE IF NOT EXISTS fts_symbols USING fts5(
            name,
            qualified_name,
            signature,
            docstring,
            content='symbols',
            content_rowid='id'
        );

        CREATE TRIGGER IF NOT EXISTS trg_symbols_ai AFTER INSERT ON symbols BEGIN
            INSERT INTO fts_symbols(rowid, name, qualified_name, signature, docstring)
            VALUES (new.id, new.name, new.qualified_name, new.signature, new.docstring);
        END;

        CREATE TRIGGER IF NOT EXISTS trg_symbols_ad AFTER DELETE ON symbols BEGIN
            INSERT INTO fts_symbols(fts_symbols, rowid, name, qualified_name, signature, docstring)
            VALUES ('delete', old.id, old.name, old.qualified_name, old.signature, old.docstring);
        END;

        CREATE TRIGGER IF NOT EXISTS trg_symbols_au AFTER UPDATE ON symbols BEGIN
            INSERT INTO fts_symbols(fts_symbols, rowid, name, qualified_name, signature, docstring)
            VALUES ('delete', old.id, old.name, old.qualified_name, old.signature, old.docstring);
            INSERT INTO fts_symbols(rowid, name, qualified_name, signature, docstring)
            VALUES (new.id, new.name, new.qualified_name, new.signature, new.docstring);
        END;
        "
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::connection::open_in_memory;

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
        assert!(tables.contains(&"symbols".to_string()));
        assert!(tables.contains(&"imports".to_string()));
        assert!(tables.contains(&"fts_symbols".to_string()));
    }
}

