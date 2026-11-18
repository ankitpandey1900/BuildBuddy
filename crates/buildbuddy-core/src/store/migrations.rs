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
            status TEXT CHECK(status IN ('in_progress', 'scanned', 'parsing', 'analyzing', 'completed', 'failed', 'cancelled')) NOT NULL,
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
            evidence_type TEXT CHECK(evidence_type IN ('ast_node', 'manifest_entry', 'import_stmt', 'export_stmt', 'call_site', 'type_annotation', 'heuristic', 'config_file', 'source_pattern', 'entry_point')) NOT NULL,
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
            status TEXT CHECK(status IN ('pending', 'parsed', 'partial', 'ignored', 'error', 'unsupported', 'skipped_too_large', 'timeout')) NOT NULL,
            error_message TEXT,
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

        CREATE TABLE IF NOT EXISTS import_edges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            source_file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
            target_file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
            target_module TEXT NOT NULL,
            imported_name TEXT NOT NULL,
            is_type_only INTEGER DEFAULT 0 NOT NULL,
            line_number INTEGER NOT NULL,
            resolution_status TEXT CHECK(resolution_status IN ('internal', 'external', 'unresolved')) NOT NULL,
            source_evidence_id INTEGER REFERENCES source_evidence(id) ON DELETE SET NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_import_edges_project ON import_edges(project_id);
        CREATE INDEX IF NOT EXISTS idx_import_edges_src ON import_edges(source_file_id);
        CREATE INDEX IF NOT EXISTS idx_import_edges_tgt ON import_edges(target_file_id);

        CREATE TABLE IF NOT EXISTS manifest_dependencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            manifest_file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
            package_name TEXT NOT NULL,
            version_spec TEXT,
            dependency_type TEXT CHECK(dependency_type IN ('direct', 'dev', 'peer', 'optional')) NOT NULL,
            source_evidence_id INTEGER REFERENCES source_evidence(id) ON DELETE SET NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_manifest_deps_project ON manifest_dependencies(project_id);

        CREATE TABLE IF NOT EXISTS findings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            category TEXT CHECK(category IN ('circular_dependency', 'unused_dependency', 'dead_code', 'security', 'complexity')) NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            severity TEXT CHECK(severity IN ('info', 'low', 'medium', 'high', 'critical')) NOT NULL,
            confidence TEXT CHECK(confidence IN ('confirmed', 'static', 'inferred', 'unknown')) NOT NULL,
            source_evidence_id INTEGER REFERENCES source_evidence(id) ON DELETE SET NULL,
            metadata_json TEXT DEFAULT '{}' NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_findings_project ON findings(project_id);

        CREATE TABLE IF NOT EXISTS functions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
            symbol_id INTEGER NOT NULL UNIQUE REFERENCES symbols(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            parameters_json TEXT DEFAULT '[]' NOT NULL,
            return_type TEXT,
            branch_count INTEGER DEFAULT 0 NOT NULL,
            loop_count INTEGER DEFAULT 0 NOT NULL,
            cyclomatic_complexity INTEGER DEFAULT 1 NOT NULL,
            has_error_handling INTEGER DEFAULT 0 NOT NULL,
            side_effects_json TEXT DEFAULT '[]' NOT NULL,
            imports_used_json TEXT DEFAULT '[]' NOT NULL,
            callers_json TEXT DEFAULT '[]' NOT NULL,
            callees_json TEXT DEFAULT '[]' NOT NULL,
            source_evidence_id INTEGER REFERENCES source_evidence(id) ON DELETE SET NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_functions_file ON functions(file_id);
        CREATE INDEX IF NOT EXISTS idx_functions_symbol ON functions(symbol_id);

        CREATE TABLE IF NOT EXISTS classes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
            symbol_id INTEGER NOT NULL UNIQUE REFERENCES symbols(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            superclass_name TEXT,
            interfaces_json TEXT DEFAULT '[]' NOT NULL,
            properties_json TEXT DEFAULT '[]' NOT NULL,
            methods_json TEXT DEFAULT '[]' NOT NULL,
            constructors_json TEXT DEFAULT '[]' NOT NULL,
            source_evidence_id INTEGER REFERENCES source_evidence(id) ON DELETE SET NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_classes_file ON classes(file_id);
        CREATE INDEX IF NOT EXISTS idx_classes_symbol ON classes(symbol_id);

        CREATE TABLE IF NOT EXISTS call_relationships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
            caller_symbol_id INTEGER REFERENCES symbols(id) ON DELETE CASCADE,
            callee_symbol_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
            callee_name TEXT NOT NULL,
            resolution_status TEXT CHECK(resolution_status IN ('confirmed', 'static', 'inferred', 'unknown')) NOT NULL,
            is_dynamic INTEGER DEFAULT 0 NOT NULL,
            source_evidence_id INTEGER NOT NULL REFERENCES source_evidence(id) ON DELETE CASCADE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_call_caller ON call_relationships(caller_symbol_id);
        CREATE INDEX IF NOT EXISTS idx_call_callee ON call_relationships(callee_symbol_id);
        CREATE INDEX IF NOT EXISTS idx_call_file ON call_relationships(file_id);

        CREATE TABLE IF NOT EXISTS class_instantiations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
            caller_symbol_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
            class_symbol_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
            class_name TEXT NOT NULL,
            resolution_status TEXT CHECK(resolution_status IN ('confirmed', 'static', 'inferred', 'unknown')) NOT NULL,
            source_evidence_id INTEGER NOT NULL REFERENCES source_evidence(id) ON DELETE CASCADE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_instantiations_class ON class_instantiations(class_symbol_id);
        CREATE INDEX IF NOT EXISTS idx_instantiations_file ON class_instantiations(file_id);

        CREATE TABLE IF NOT EXISTS frameworks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            version TEXT,
            confidence TEXT CHECK(confidence IN ('confirmed', 'static', 'inferred', 'unknown')) NOT NULL,
            evidence_json TEXT DEFAULT '[]' NOT NULL,
            source_evidence_id INTEGER REFERENCES source_evidence(id) ON DELETE SET NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_frameworks_project ON frameworks(project_id);

        CREATE TABLE IF NOT EXISTS declared_frameworks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            version TEXT,
            dependency_type TEXT NOT NULL,
            file_path TEXT NOT NULL,
            line_number INTEGER NOT NULL,
            source_evidence_id INTEGER REFERENCES source_evidence(id) ON DELETE SET NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_declared_frameworks_project ON declared_frameworks(project_id);

        CREATE TABLE IF NOT EXISTS entry_points (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            entry_type TEXT NOT NULL,
            file_path TEXT NOT NULL,
            start_line INTEGER NOT NULL,
            end_line INTEGER NOT NULL,
            snippet TEXT,
            confidence TEXT CHECK(confidence IN ('confirmed', 'static', 'inferred', 'unknown')) NOT NULL,
            source_evidence_id INTEGER REFERENCES source_evidence(id) ON DELETE SET NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_entry_points_project ON entry_points(project_id);

        CREATE TABLE IF NOT EXISTS modules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            root_directory TEXT NOT NULL,
            layer TEXT CHECK(layer IN ('frontend', 'backend', 'data', 'shared', 'config', 'unclassified')) NOT NULL,
            file_count INTEGER DEFAULT 0 NOT NULL,
            cohesion_score REAL DEFAULT 0.0,
            source_evidence_id INTEGER REFERENCES source_evidence(id) ON DELETE SET NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            UNIQUE(project_id, root_directory)
        );

        CREATE INDEX IF NOT EXISTS idx_modules_project ON modules(project_id);

        CREATE TABLE IF NOT EXISTS api_endpoints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            framework TEXT NOT NULL,
            method TEXT NOT NULL,
            route TEXT NOT NULL,
            controller_name TEXT,
            file_path TEXT NOT NULL,
            start_line INTEGER NOT NULL,
            end_line INTEGER NOT NULL,
            confidence TEXT CHECK(confidence IN ('confirmed', 'static', 'inferred', 'unknown')) NOT NULL,
            source_evidence_id INTEGER NOT NULL REFERENCES source_evidence(id) ON DELETE CASCADE,
            UNIQUE(project_id, framework, method, route, file_path, start_line)
        );

        CREATE INDEX IF NOT EXISTS idx_api_endpoints_project ON api_endpoints(project_id, file_path, start_line);

        CREATE TABLE IF NOT EXISTS database_engines (
            id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL, file_path TEXT NOT NULL, line_number INTEGER NOT NULL, confidence TEXT NOT NULL,
            source_evidence_id INTEGER NOT NULL REFERENCES source_evidence(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS database_tables (
            id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL, file_path TEXT NOT NULL, start_line INTEGER NOT NULL, end_line INTEGER NOT NULL, confidence TEXT NOT NULL,
            source_evidence_id INTEGER NOT NULL REFERENCES source_evidence(id) ON DELETE CASCADE,
            UNIQUE(project_id, name, file_path, start_line)
        );
        CREATE TABLE IF NOT EXISTS database_fields (
            id INTEGER PRIMARY KEY AUTOINCREMENT, table_id INTEGER NOT NULL REFERENCES database_tables(id) ON DELETE CASCADE,
            name TEXT NOT NULL, declared_type TEXT NOT NULL, is_primary_key INTEGER NOT NULL, is_foreign_key INTEGER NOT NULL,
            line_number INTEGER NOT NULL, source_evidence_id INTEGER NOT NULL REFERENCES source_evidence(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS diagrams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            diagram_type TEXT CHECK(diagram_type IN ('architecture', 'dependency', 'call_graph', 'er_diagram', 'sequence')) NOT NULL,
            title TEXT NOT NULL,
            model_json TEXT NOT NULL,
            layout_engine TEXT DEFAULT 'elk' NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_diagrams_project ON diagrams(project_id);

        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            doc_type TEXT NOT NULL,
            title TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            UNIQUE(project_id, doc_type)
        );

        CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id, doc_type);

        CREATE TABLE IF NOT EXISTS document_sections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            section_key TEXT NOT NULL,
            title TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0 NOT NULL,
            content TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            state TEXT CHECK(state IN ('generated', 'user_edited', 'stale')) NOT NULL DEFAULT 'generated',
            generated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            evidence_keys TEXT DEFAULT '[]' NOT NULL,
            UNIQUE(document_id, section_key)
        );

        CREATE INDEX IF NOT EXISTS idx_doc_sections_lookup ON document_sections(document_id, sort_order);

        CREATE TABLE IF NOT EXISTS document_revisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            revision_number INTEGER NOT NULL,
            content_markdown TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            UNIQUE(document_id, revision_number)
        );

        CREATE INDEX IF NOT EXISTS idx_doc_revisions_order ON document_revisions(document_id, revision_number DESC);
        "
    )?;

    // Backward-compatibility: add error_message column to files if upgrading existing DB
    conn.execute("ALTER TABLE files ADD COLUMN error_message TEXT", []).ok();

    // Backward-compatibility / auto-heal: backfill missing source_evidence_id in import_edges
    // to preserve all real relationships with complete provenance
    let _ = conn.execute(
        "INSERT INTO source_evidence (
            project_id, file_path, start_line, end_line, start_column, end_column, snippet, confidence, evidence_type
         )
         SELECT ie.project_id, sf.relative_path, ie.line_number, ie.line_number, 0, 0,
                'import ' || ie.imported_name || ' from ''' || ie.target_module || '''',
                'static', 'import_stmt'
         FROM import_edges ie
         JOIN files sf ON ie.source_file_id = sf.id
         WHERE ie.source_evidence_id IS NULL",
        [],
    );

    let _ = conn.execute(
        "UPDATE import_edges
         SET source_evidence_id = (
             SELECT se.id FROM source_evidence se
             JOIN files sf ON se.file_path = sf.relative_path AND se.project_id = import_edges.project_id
             WHERE sf.id = import_edges.source_file_id AND se.start_line = import_edges.line_number
             ORDER BY se.id DESC LIMIT 1
         )
         WHERE source_evidence_id IS NULL",
        [],
    );

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
        assert!(tables.contains(&"exports".to_string()));
        assert!(tables.contains(&"import_edges".to_string()));
        assert!(tables.contains(&"manifest_dependencies".to_string()));
        assert!(tables.contains(&"findings".to_string()));
        assert!(tables.contains(&"fts_symbols".to_string()));
        assert!(tables.contains(&"functions".to_string()));
        assert!(tables.contains(&"classes".to_string()));
        assert!(tables.contains(&"call_relationships".to_string()));
        assert!(tables.contains(&"class_instantiations".to_string()));
        assert!(tables.contains(&"frameworks".to_string()));
        assert!(tables.contains(&"declared_frameworks".to_string()));
        assert!(tables.contains(&"entry_points".to_string()));
        assert!(tables.contains(&"modules".to_string()));
        assert!(tables.contains(&"diagrams".to_string()));
        assert!(tables.contains(&"documents".to_string()));
        assert!(tables.contains(&"document_sections".to_string()));
        assert!(tables.contains(&"document_revisions".to_string()));
    }
}

