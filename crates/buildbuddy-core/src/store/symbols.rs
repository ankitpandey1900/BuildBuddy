use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

use crate::parser::traits::FileParseResult;
use crate::store::calls::{
    get_class_by_symbol_id, get_function_by_symbol_id, get_incoming_calls_for_symbol,
    get_instantiations_for_symbol, get_outgoing_calls_for_symbol, CallDetailItem,
    InstantiationDetailItem, StoredClass, StoredFunction,
};
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
        let export_confidence = if result.language == "python" { "static" } else { "confirmed" };
        let mut export_evidence_stmt = tx.prepare(
            "INSERT INTO source_evidence (
                project_id, file_path, start_line, end_line, start_column, end_column,
                snippet, confidence, evidence_type
            ) VALUES (?1, ?2, ?3, ?4, 0, 0, ?5, ?6, 'export_stmt')",
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
                export_confidence,
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

    // 5. Persist functions, classes, call_relationships, and class_instantiations
    crate::store::calls::persist_file_calls_and_metrics_tx(&tx, project_id, file_id, result)?;

    // 6. Update file counts and status
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SymbolRecord {
    pub id: i64,
    pub project_id: i64,
    pub file_id: i64,
    pub file_path: String,
    pub stable_id: String,
    pub name: String,
    pub qualified_name: String,
    pub kind: String,
    pub parent_name: Option<String>,
    pub signature: Option<String>,
    pub return_type: Option<String>,
    pub visibility: Option<String>,
    pub is_exported: bool,
    pub is_async: bool,
    pub docstring: Option<String>,
    pub start_line: usize,
    pub end_line: usize,
    pub start_column: usize,
    pub end_column: usize,
    pub confidence: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SymbolDetail {
    pub symbol: SymbolRecord,
    pub snippet: Option<String>,
    pub function_metrics: Option<StoredFunction>,
    pub class_details: Option<StoredClass>,
    pub incoming_calls: Vec<CallDetailItem>,
    pub outgoing_calls: Vec<CallDetailItem>,
    pub instantiations: Vec<InstantiationDetailItem>,
}

pub fn list_symbols(
    conn: &Connection,
    project_id: i64,
    file_id: Option<i64>,
    kind: Option<&str>,
    search: Option<&str>,
    limit: usize,
    offset: usize,
) -> Result<Vec<SymbolRecord>> {
    let mut sql = String::from(
        "SELECT s.id, s.project_id, s.file_id, f.relative_path, s.stable_id, s.name, s.qualified_name,
                s.kind, s.parent_name, s.signature, s.return_type, s.visibility,
                s.is_exported, s.is_async, s.docstring,
                COALESCE(e.start_line, 0), COALESCE(e.end_line, 0),
                COALESCE(e.start_column, 0), COALESCE(e.end_column, 0),
                COALESCE(e.confidence, 'confirmed')
         FROM symbols s
         JOIN files f ON s.file_id = f.id
         LEFT JOIN source_evidence e ON s.source_evidence_id = e.id
         WHERE s.project_id = ?1",
    );

    let mut param_values: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(project_id)];
    let mut idx = 2;

    if let Some(fid) = file_id {
        sql.push_str(&format!(" AND s.file_id = ?{}", idx));
        param_values.push(Box::new(fid));
        idx += 1;
    }

    if let Some(k) = kind {
        sql.push_str(&format!(" AND s.kind = ?{}", idx));
        param_values.push(Box::new(k.to_string()));
        idx += 1;
    }

    if let Some(s) = search {
        if !s.is_empty() {
            sql.push_str(&format!(" AND (s.name LIKE ?{} OR s.qualified_name LIKE ?{})", idx, idx));
            let pattern = format!("%{}%", s);
            param_values.push(Box::new(pattern));
            idx += 1;
        }
    }

    sql.push_str(&format!(
        " ORDER BY f.relative_path ASC, COALESCE(e.start_line, 0) ASC, COALESCE(e.start_column, 0) ASC LIMIT ?{} OFFSET ?{}",
        idx,
        idx + 1
    ));
    param_values.push(Box::new(limit as i64));
    param_values.push(Box::new(offset as i64));

    let mut stmt = conn.prepare(&sql)?;
    let params_refs: Vec<&dyn rusqlite::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();

    let rows = stmt.query_map(params_refs.as_slice(), |row| {
        Ok(SymbolRecord {
            id: row.get(0)?,
            project_id: row.get(1)?,
            file_id: row.get(2)?,
            file_path: row.get(3)?,
            stable_id: row.get(4)?,
            name: row.get(5)?,
            qualified_name: row.get(6)?,
            kind: row.get(7)?,
            parent_name: row.get(8)?,
            signature: row.get(9)?,
            return_type: row.get(10)?,
            visibility: row.get(11)?,
            is_exported: row.get::<_, i64>(12)? == 1,
            is_async: row.get::<_, i64>(13)? == 1,
            docstring: row.get(14)?,
            start_line: row.get::<_, i64>(15)? as usize,
            end_line: row.get::<_, i64>(16)? as usize,
            start_column: row.get::<_, i64>(17)? as usize,
            end_column: row.get::<_, i64>(18)? as usize,
            confidence: row.get(19)?,
        })
    })?;

    let mut symbols = Vec::new();
    for r in rows {
        symbols.push(r?);
    }
    Ok(symbols)
}

pub fn get_symbol_detail(conn: &Connection, symbol_id: i64) -> Result<Option<SymbolDetail>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.project_id, s.file_id, f.relative_path, s.stable_id, s.name, s.qualified_name,
                s.kind, s.parent_name, s.signature, s.return_type, s.visibility,
                s.is_exported, s.is_async, s.docstring,
                COALESCE(e.start_line, 0), COALESCE(e.end_line, 0),
                COALESCE(e.start_column, 0), COALESCE(e.end_column, 0),
                COALESCE(e.confidence, 'confirmed'),
                e.snippet
         FROM symbols s
         JOIN files f ON s.file_id = f.id
         LEFT JOIN source_evidence e ON s.source_evidence_id = e.id
         WHERE s.id = ?1",
    )?;

    let mut rows = stmt.query(params![symbol_id])?;
    if let Some(row) = rows.next()? {
        let symbol = SymbolRecord {
            id: row.get(0)?,
            project_id: row.get(1)?,
            file_id: row.get(2)?,
            file_path: row.get(3)?,
            stable_id: row.get(4)?,
            name: row.get(5)?,
            qualified_name: row.get(6)?,
            kind: row.get(7)?,
            parent_name: row.get(8)?,
            signature: row.get(9)?,
            return_type: row.get(10)?,
            visibility: row.get(11)?,
            is_exported: row.get::<_, i64>(12)? == 1,
            is_async: row.get::<_, i64>(13)? == 1,
            docstring: row.get(14)?,
            start_line: row.get::<_, i64>(15)? as usize,
            end_line: row.get::<_, i64>(16)? as usize,
            start_column: row.get::<_, i64>(17)? as usize,
            end_column: row.get::<_, i64>(18)? as usize,
            confidence: row.get(19)?,
        };
        let snippet: Option<String> = row.get(20)?;

        let function_metrics = get_function_by_symbol_id(conn, symbol_id)?;
        let class_details = get_class_by_symbol_id(conn, symbol_id)?;
        let incoming_calls = get_incoming_calls_for_symbol(conn, symbol_id)?;
        let outgoing_calls = get_outgoing_calls_for_symbol(conn, symbol_id)?;
        let instantiations = get_instantiations_for_symbol(conn, symbol_id)?;

        Ok(Some(SymbolDetail {
            symbol,
            snippet,
            function_metrics,
            class_details,
            incoming_calls,
            outgoing_calls,
            instantiations,
        }))
    } else {
        Ok(None)
    }
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
            functions: Vec::new(),
            classes: Vec::new(),
            calls: Vec::new(),
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
            functions: Vec::new(),
            classes: Vec::new(),
            calls: Vec::new(),
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

    #[test]
    fn test_list_symbols_filtering_and_pagination() {
        let mut conn = open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let proj = create_or_get_project(&conn, "/test/path", "test").unwrap();

        conn.execute(
            "INSERT INTO files (project_id, relative_path, file_name, extension, size_bytes, content_hash, status)
             VALUES (?1, 'src/a.ts', 'a.ts', 'ts', 500, 'hash1', 'pending')",
            params![proj.id],
        ).unwrap();
        let file_a_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO files (project_id, relative_path, file_name, extension, size_bytes, content_hash, status)
             VALUES (?1, 'src/b.ts', 'b.ts', 'ts', 500, 'hash2', 'pending')",
            params![proj.id],
        ).unwrap();
        let file_b_id = conn.last_insert_rowid();

        let sym1 = ExtractedSymbol {
            stable_id: "sym-fn-alpha".to_string(),
            name: "alphaFn".to_string(),
            qualified_name: "alphaFn".to_string(),
            kind: SymbolKind::Function,
            parent_name: None,
            start_line: 1,
            end_line: 5,
            start_column: 0,
            end_column: 1,
            parameters: Vec::new(),
            return_type: Some("void".to_string()),
            is_exported: true,
            is_async: false,
            visibility: Some("public".to_string()),
            docstring: None,
            signature: "function alphaFn(): void".to_string(),
        };

        let sym2 = ExtractedSymbol {
            stable_id: "sym-cls-beta".to_string(),
            name: "BetaClass".to_string(),
            qualified_name: "BetaClass".to_string(),
            kind: SymbolKind::Class,
            parent_name: None,
            start_line: 10,
            end_line: 30,
            start_column: 0,
            end_column: 1,
            parameters: Vec::new(),
            return_type: None,
            is_exported: true,
            is_async: false,
            visibility: Some("public".to_string()),
            docstring: None,
            signature: "class BetaClass".to_string(),
        };

        let res_a = FileParseResult {
            relative_path: "src/a.ts".to_string(),
            language: "typescript".to_string(),
            status: ParseStatus::Full,
            symbols: vec![sym1],
            imports: Vec::new(),
            exports: Vec::new(),
            functions: Vec::new(),
            classes: Vec::new(),
            calls: Vec::new(),
            errors: Vec::new(),
        };
        persist_file_parse_result(&mut conn, proj.id, file_a_id, &res_a).unwrap();

        let res_b = FileParseResult {
            relative_path: "src/b.ts".to_string(),
            language: "typescript".to_string(),
            status: ParseStatus::Full,
            symbols: vec![sym2],
            imports: Vec::new(),
            exports: Vec::new(),
            functions: Vec::new(),
            classes: Vec::new(),
            calls: Vec::new(),
            errors: Vec::new(),
        };
        persist_file_parse_result(&mut conn, proj.id, file_b_id, &res_b).unwrap();

        // 1. All symbols
        let all = list_symbols(&conn, proj.id, None, None, None, 10, 0).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].name, "alphaFn");
        assert_eq!(all[0].file_path, "src/a.ts");
        assert_eq!(all[1].name, "BetaClass");
        assert_eq!(all[1].file_path, "src/b.ts");

        // 2. Filter by file_id
        let file_b_symbols = list_symbols(&conn, proj.id, Some(file_b_id), None, None, 10, 0).unwrap();
        assert_eq!(file_b_symbols.len(), 1);
        assert_eq!(file_b_symbols[0].name, "BetaClass");

        // 3. Filter by kind
        let fn_symbols = list_symbols(&conn, proj.id, None, Some("function"), None, 10, 0).unwrap();
        assert_eq!(fn_symbols.len(), 1);
        assert_eq!(fn_symbols[0].name, "alphaFn");

        let cls_symbols = list_symbols(&conn, proj.id, None, Some("class"), None, 10, 0).unwrap();
        assert_eq!(cls_symbols.len(), 1);
        assert_eq!(cls_symbols[0].name, "BetaClass");

        // 4. Filter by search
        let searched = list_symbols(&conn, proj.id, None, None, Some("alpha"), 10, 0).unwrap();
        assert_eq!(searched.len(), 1);
        assert_eq!(searched[0].name, "alphaFn");

        // 5. Pagination
        let page_1 = list_symbols(&conn, proj.id, None, None, None, 1, 0).unwrap();
        assert_eq!(page_1.len(), 1);
        assert_eq!(page_1[0].name, "alphaFn");

        let page_2 = list_symbols(&conn, proj.id, None, None, None, 1, 1).unwrap();
        assert_eq!(page_2.len(), 1);
        assert_eq!(page_2[0].name, "BetaClass");
    }

    #[test]
    fn test_get_symbol_detail_complete() {
        use crate::symbols::model::{CallResolutionStatus, ExtractedCallSite, ExtractedFunction, FunctionMetrics, Parameter};

        let mut conn = open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let proj = create_or_get_project(&conn, "/test/path", "test").unwrap();

        conn.execute(
            "INSERT INTO files (project_id, relative_path, file_name, extension, size_bytes, content_hash, status)
             VALUES (?1, 'src/service.ts', 'service.ts', 'ts', 500, 'hash', 'pending')",
            params![proj.id],
        ).unwrap();
        let file_id = conn.last_insert_rowid();

        let sym_fn = ExtractedSymbol {
            stable_id: "sym-worker-fn".to_string(),
            name: "processOrder".to_string(),
            qualified_name: "processOrder".to_string(),
            kind: SymbolKind::Function,
            parent_name: None,
            start_line: 10,
            end_line: 25,
            start_column: 0,
            end_column: 1,
            parameters: vec![Parameter {
                name: "orderId".to_string(),
                type_annotation: Some("string".to_string()),
                default_value: None,
            }],
            return_type: Some("boolean".to_string()),
            is_exported: true,
            is_async: true,
            visibility: Some("public".to_string()),
            docstring: Some("Processes customer order".to_string()),
            signature: "async function processOrder(orderId: string): Promise<boolean>".to_string(),
        };

        let func_metrics = ExtractedFunction {
            symbol_stable_id: "sym-worker-fn".to_string(),
            name: "processOrder".to_string(),
            qualified_name: "processOrder".to_string(),
            start_line: 10,
            end_line: 25,
            start_column: 0,
            end_column: 1,
            metrics: FunctionMetrics {
                parameters: vec![Parameter {
                    name: "orderId".to_string(),
                    type_annotation: Some("string".to_string()),
                    default_value: None,
                }],
                return_type: Some("boolean".to_string()),
                branch_count: 2,
                loop_count: 1,
                cyclomatic_complexity: 4,
                has_error_handling: true,
                side_effects: Vec::new(),
                imports_used: vec!["dbClient".to_string()],
                callers: Vec::new(),
                callees: vec!["validate".to_string()],
            },
        };

        let call_site = ExtractedCallSite {
            caller_symbol_id: Some("sym-worker-fn".to_string()),
            callee_symbol_id: None,
            callee_name: "validate".to_string(),
            resolution_status: CallResolutionStatus::Static,
            is_dynamic: false,
            start_line: 15,
            end_line: 15,
            start_column: 4,
            end_column: 14,
            snippet: "validate(orderId)".to_string(),
            receiver: None,
        };

        let parse_result = FileParseResult {
            relative_path: "src/service.ts".to_string(),
            language: "typescript".to_string(),
            status: ParseStatus::Full,
            symbols: vec![sym_fn],
            imports: Vec::new(),
            exports: Vec::new(),
            functions: vec![func_metrics],
            classes: Vec::new(),
            calls: vec![call_site],
            errors: Vec::new(),
        };

        persist_file_parse_result(&mut conn, proj.id, file_id, &parse_result).unwrap();

        // Get the symbol ID
        let symbol_id: i64 = conn.query_row(
            "SELECT id FROM symbols WHERE stable_id = 'sym-worker-fn'",
            [],
            |r| r.get(0),
        ).unwrap();

        let detail = get_symbol_detail(&conn, symbol_id).unwrap().expect("Symbol detail must exist");
        assert_eq!(detail.symbol.name, "processOrder");
        assert_eq!(detail.symbol.signature, Some("async function processOrder(orderId: string): Promise<boolean>".to_string()));
        assert_eq!(detail.snippet, Some("async function processOrder(orderId: string): Promise<boolean>".to_string()));

        let fm = detail.function_metrics.expect("Function metrics must exist");
        assert_eq!(fm.cyclomatic_complexity, 4);
        assert_eq!(fm.branch_count, 2);
        assert_eq!(fm.loop_count, 1);
        assert!(fm.has_error_handling);
        assert_eq!(fm.parameters.len(), 1);
        assert_eq!(fm.parameters[0].name, "orderId");

        assert_eq!(detail.outgoing_calls.len(), 1);
        assert_eq!(detail.outgoing_calls[0].callee_name, "validate");
        assert_eq!(detail.outgoing_calls[0].resolution_status, "static");

        // Non-existent symbol returns None
        let missing = get_symbol_detail(&conn, 999999).unwrap();
        assert!(missing.is_none());
    }
}

