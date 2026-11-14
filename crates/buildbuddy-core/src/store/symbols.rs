use rusqlite::{params, Connection, Result};

use crate::parser::traits::FileParseResult;
use crate::symbols::model::{ExtractedImport, ExtractedSymbol, SymbolKind};

pub fn persist_file_parse_result(
    conn: &mut Connection,
    project_id: i64,
    file_id: i64,
    result: &FileParseResult,
) -> Result<()> {
    let tx = conn.transaction()?;

    // 1. Clear previous symbols, imports, and source_evidence for this file
    tx.execute(
        "DELETE FROM symbols WHERE project_id = ?1 AND file_id = ?2",
        params![project_id, file_id],
    )?;
    tx.execute(
        "DELETE FROM imports WHERE project_id = ?1 AND file_id = ?2",
        params![project_id, file_id],
    )?;
    tx.execute(
        "DELETE FROM source_evidence WHERE project_id = ?1 AND file_path = ?2",
        params![project_id, result.relative_path],
    )?;

    // 2. Insert symbols and their source_evidence rows
    let mut func_count = 0;
    let mut class_count = 0;

    {
        let mut evidence_stmt = tx.prepare(
            "INSERT INTO source_evidence (
                project_id, file_path, start_line, end_line, start_column, end_column,
                snippet, confidence, evidence_type
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'confirmed', 'ast_node')",
        )?;

        let mut symbol_stmt = tx.prepare(
            "INSERT INTO symbols (
                project_id, file_id, stable_id, name, qualified_name, kind, parent_name,
                signature, return_type, visibility, is_exported, is_async, docstring,
                source_evidence_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        )?;

        for sym in &result.symbols {
            match sym.kind {
                SymbolKind::Function | SymbolKind::Method => func_count += 1,
                SymbolKind::Class => class_count += 1,
                _ => {}
            }

            // Insert provenance evidence
            evidence_stmt.execute(params![
                project_id,
                result.relative_path,
                sym.start_line as i64,
                sym.end_line as i64,
                sym.start_column as i64,
                sym.end_column as i64,
                sym.signature,
            ])?;
            let evidence_id = tx.last_insert_rowid();

            // Insert symbol
            symbol_stmt.execute(params![
                project_id,
                file_id,
                sym.stable_id,
                sym.name,
                sym.qualified_name,
                sym.kind.as_str(),
                sym.parent_name,
                sym.signature,
                sym.return_type,
                sym.visibility,
                if sym.is_exported { 1 } else { 0 },
                if sym.is_async { 1 } else { 0 },
                sym.docstring,
                evidence_id,
            ])?;
        }
    }

    // 3. Insert imports with source_evidence provenance
    {
        let mut import_evidence_stmt = tx.prepare(
            "INSERT INTO source_evidence (
                project_id, file_path, start_line, end_line, start_column, end_column,
                snippet, confidence, evidence_type
            ) VALUES (?1, ?2, ?3, ?4, 0, 0, ?5, 'confirmed', 'import_stmt')",
        )?;

        let mut import_stmt = tx.prepare(
            "INSERT INTO imports (
                project_id, file_id, source_module, imported_name, alias, is_type_only, line_number,
                source_evidence_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )?;

        for imp in &result.imports {
            let snippet = if let Some(alias) = &imp.alias {
                format!("import {} as {} from '{}'", imp.imported_name, alias, imp.source_module)
            } else if imp.imported_name.is_empty() {
                format!("import '{}'", imp.source_module)
            } else {
                format!("import {} from '{}'", imp.imported_name, imp.source_module)
            };

            import_evidence_stmt.execute(params![
                project_id,
                result.relative_path,
                imp.line_number as i64,
                imp.line_number as i64,
                snippet,
            ])?;
            let evidence_id = tx.last_insert_rowid();

            import_stmt.execute(params![
                project_id,
                file_id,
                imp.source_module,
                imp.imported_name,
                imp.alias,
                if imp.is_type_only { 1 } else { 0 },
                imp.line_number as i64,
                evidence_id,
            ])?;
        }
    }

    // 4. Insert exports with source_evidence provenance
    {
        let mut export_evidence_stmt = tx.prepare(
            "INSERT INTO source_evidence (
                project_id, file_path, start_line, end_line, start_column, end_column,
                snippet, confidence, evidence_type
            ) VALUES (?1, ?2, ?3, ?4, 0, 0, ?5, 'confirmed', 'export_stmt')",
        )?;

        let mut export_stmt = tx.prepare(
            "INSERT INTO exports (
                project_id, file_id, exported_name, local_name, is_default, line_number,
                source_evidence_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )?;

        for exp in &result.exports {
            let snippet = if exp.is_default {
                format!("export default {}", exp.local_name)
            } else if exp.exported_name == exp.local_name {
                format!("export {{ {} }}", exp.local_name)
            } else {
                format!("export {{ {} as {} }}", exp.local_name, exp.exported_name)
            };

            export_evidence_stmt.execute(params![
                project_id,
                result.relative_path,
                exp.line_number as i64,
                exp.line_number as i64,
                snippet,
            ])?;
            let evidence_id = tx.last_insert_rowid();

            export_stmt.execute(params![
                project_id,
                file_id,
                exp.exported_name,
                exp.local_name,
                if exp.is_default { 1 } else { 0 },
                exp.line_number as i64,
                evidence_id,
            ])?;
        }
    }

    // 5. Update file counts and status
    tx.execute(
        "UPDATE files SET
            function_count = ?1,
            class_count = ?2,
            import_count = ?3,
            status = ?4,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?5",
        params![
            func_count,
            class_count,
            result.imports.len() as i64,
            result.status.as_str(),
            file_id,
        ],
    )?;

    tx.commit()?;
    Ok(())
}

pub fn get_symbols_for_file(conn: &Connection, file_id: i64) -> Result<Vec<ExtractedSymbol>> {
    let mut stmt = conn.prepare(
        "SELECT s.stable_id, s.name, s.qualified_name, s.kind, s.parent_name,
                e.start_line, e.end_line, e.start_column, e.end_column,
                s.signature, s.return_type, s.visibility, s.is_exported, s.is_async, s.docstring
         FROM symbols s
         JOIN source_evidence e ON s.source_evidence_id = e.id
         WHERE s.file_id = ?1
         ORDER BY e.start_line ASC, e.start_column ASC",
    )?;

    let rows = stmt.query_map(params![file_id], |row| {
        let kind_str: String = row.get(3)?;
        let kind = match kind_str.as_str() {
            "function" => SymbolKind::Function,
            "class" => SymbolKind::Class,
            "method" => SymbolKind::Method,
            "interface" => SymbolKind::Interface,
            "type_alias" => SymbolKind::TypeAlias,
            "constant" => SymbolKind::Constant,
            _ => SymbolKind::Variable,
        };

        Ok(ExtractedSymbol {
            stable_id: row.get(0)?,
            name: row.get(1)?,
            qualified_name: row.get(2)?,
            kind,
            parent_name: row.get(4)?,
            start_line: row.get::<_, i64>(5)? as usize,
            end_line: row.get::<_, i64>(6)? as usize,
            start_column: row.get::<_, i64>(7)? as usize,
            end_column: row.get::<_, i64>(8)? as usize,
            parameters: Vec::new(),
            return_type: row.get(10)?,
            is_exported: row.get::<_, i64>(12)? == 1,
            is_async: row.get::<_, i64>(13)? == 1,
            visibility: row.get(11)?,
            docstring: row.get(14)?,
            signature: row.get(9)?,
        })
    })?;

    let mut symbols = Vec::new();
    for r in rows {
        symbols.push(r?);
    }
    Ok(symbols)
}

pub fn get_imports_for_file(conn: &Connection, file_id: i64) -> Result<Vec<ExtractedImport>> {
    let mut stmt = conn.prepare(
        "SELECT source_module, imported_name, alias, is_type_only, line_number
         FROM imports
         WHERE file_id = ?1
         ORDER BY line_number ASC",
    )?;

    let rows = stmt.query_map(params![file_id], |row| {
        Ok(ExtractedImport {
            source_module: row.get(0)?,
            imported_name: row.get(1)?,
            alias: row.get(2)?,
            is_type_only: row.get::<_, i64>(3)? == 1,
            line_number: row.get::<_, i64>(4)? as usize,
        })
    })?;

    let mut imports = Vec::new();
    for r in rows {
        imports.push(r?);
    }
    Ok(imports)
}

pub fn search_symbols_fts(
    conn: &Connection,
    project_id: i64,
    query: &str,
    limit: usize,
) -> Result<Vec<(String, String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT s.name, s.qualified_name, s.kind
         FROM fts_symbols f
         JOIN symbols s ON f.rowid = s.id
         WHERE s.project_id = ?1 AND fts_symbols MATCH ?2
         LIMIT ?3",
    )?;

    let rows = stmt.query_map(params![project_id, query, limit as i64], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    })?;

    let mut results = Vec::new();
    for r in rows {
        results.push(r?);
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::traits::ParseStatus;
    use crate::store::connection::open_in_memory;
    use crate::store::migrations::run_migrations;
    use crate::store::projects::create_or_get_project;

    #[test]
    fn test_persist_and_fts_query() {
        let mut conn = open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let proj = create_or_get_project(&conn, "/test/path", "test").unwrap();

        conn.execute(
            "INSERT INTO files (project_id, relative_path, file_name, extension, size_bytes, content_hash, status)
             VALUES (?1, 'src/api.ts', 'api.ts', 'ts', 500, 'hash', 'pending')",
            params![proj.id],
        ).unwrap();
        let file_id = conn.last_insert_rowid();

        let sym = ExtractedSymbol {
            stable_id: "test-stable-id-123".to_string(),
            name: "fetchUserData".to_string(),
            qualified_name: "fetchUserData".to_string(),
            kind: SymbolKind::Function,
            parent_name: None,
            start_line: 10,
            end_line: 25,
            start_column: 0,
            end_column: 1,
            parameters: Vec::new(),
            return_type: Some("Promise<User>".to_string()),
            is_exported: true,
            is_async: true,
            visibility: Some("public".to_string()),
            docstring: Some("Fetches user data from remote endpoint".to_string()),
            signature: "async fetchUserData(): Promise<User>".to_string(),
        };

        let imp = ExtractedImport {
            source_module: "axios".to_string(),
            imported_name: "default".to_string(),
            alias: None,
            is_type_only: false,
            line_number: 1,
        };

        let result = FileParseResult {
            relative_path: "src/api.ts".to_string(),
            language: "typescript".to_string(),
            status: ParseStatus::Full,
            symbols: vec![sym],
            imports: vec![imp],
            exports: Vec::new(),
            errors: Vec::new(),
        };

        persist_file_parse_result(&mut conn, proj.id, file_id, &result).unwrap();

        let symbols = get_symbols_for_file(&conn, file_id).unwrap();
        assert_eq!(symbols.len(), 1);
        assert_eq!(symbols[0].name, "fetchUserData");
        assert_eq!(symbols[0].stable_id, "test-stable-id-123");

        let imports = get_imports_for_file(&conn, file_id).unwrap();
        assert_eq!(imports.len(), 1);
        assert_eq!(imports[0].source_module, "axios");

        // FTS search query
        let fts_matches = search_symbols_fts(&conn, proj.id, "fetchUserData", 10).unwrap();
        assert_eq!(fts_matches.len(), 1);
        assert_eq!(fts_matches[0].0, "fetchUserData");
    }

    #[test]
    fn test_no_symbol_or_import_without_provenance_evidence() {
        let mut conn = open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let proj = create_or_get_project(&conn, "/test/path", "test").unwrap();

        conn.execute(
            "INSERT INTO files (project_id, relative_path, file_name, extension, size_bytes, content_hash, status)
             VALUES (?1, 'src/api.ts', 'api.ts', 'ts', 500, 'hash', 'pending')",
            params![proj.id],
        ).unwrap();
        let file_id = conn.last_insert_rowid();

        let sym = ExtractedSymbol {
            stable_id: "sym-1".to_string(),
            name: "testFn".to_string(),
            qualified_name: "testFn".to_string(),
            kind: SymbolKind::Function,
            parent_name: None,
            start_line: 1,
            end_line: 5,
            start_column: 0,
            end_column: 1,
            parameters: Vec::new(),
            return_type: None,
            is_exported: false,
            is_async: false,
            visibility: None,
            docstring: None,
            signature: "function testFn()".to_string(),
        };

        let imp = ExtractedImport {
            source_module: "./utils".to_string(),
            imported_name: "helper".to_string(),
            alias: None,
            is_type_only: false,
            line_number: 1,
        };

        let exp = crate::symbols::ExtractedExport {
            exported_name: "testFn".to_string(),
            local_name: "testFn".to_string(),
            is_default: false,
            line_number: 1,
        };

        let result = FileParseResult {
            relative_path: "src/api.ts".to_string(),
            language: "typescript".to_string(),
            status: ParseStatus::Full,
            symbols: vec![sym],
            imports: vec![imp],
            exports: vec![exp],
            errors: Vec::new(),
        };

        persist_file_parse_result(&mut conn, proj.id, file_id, &result).unwrap();

        // Assert strictly zero orphaned symbols without source_evidence
        let orphaned_symbols: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM symbols WHERE source_evidence_id IS NULL",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(orphaned_symbols, 0, "Found symbols without source_evidence");

        // Assert strictly zero orphaned imports without source_evidence
        let orphaned_imports: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM imports WHERE source_evidence_id IS NULL",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(orphaned_imports, 0, "Found imports without source_evidence");

        // Assert strictly zero orphaned exports without source_evidence
        let orphaned_exports: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM exports WHERE source_evidence_id IS NULL",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(orphaned_exports, 0, "Found exports without source_evidence");

        // Assert evidence details match
        let evidence_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM source_evidence", [], |r| r.get(0))
            .unwrap();
        assert_eq!(evidence_count, 3, "Expected 1 symbol + 1 import + 1 export evidence");
    }
}

