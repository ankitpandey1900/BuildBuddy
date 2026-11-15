use rusqlite::{params, Connection, Result};

pub struct CallResolver;

impl CallResolver {
    /// Resolves cross-file call targets for all unresolved confirmed calls in a project.
    /// Links caller functions and callee symbols via `import_edges`.
    pub fn resolve_project_calls(conn: &Connection, project_id: i64) -> Result<usize> {
        let mut updated = 0;

        // 1. Resolve cross-file calls via import_edges
        let mut get_unresolved = conn.prepare(
            "SELECT c.id, c.file_id, c.callee_name
             FROM call_relationships c
             WHERE c.project_id = ?1
               AND c.resolution_status = 'confirmed'
               AND c.callee_symbol_id IS NULL",
        )?;

        let unresolved_calls: Vec<(i64, i64, String)> = get_unresolved
            .query_map(params![project_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })?
            .filter_map(|r| r.ok())
            .collect();

        let mut find_target = conn.prepare(
            "SELECT s.id
             FROM import_edges ie
             JOIN symbols s ON s.file_id = ie.target_file_id AND s.name = ?1
             WHERE ie.project_id = ?2
               AND ie.source_file_id = ?3
               AND ie.imported_name = ?1
             LIMIT 1",
        )?;

        let mut update_call = conn.prepare(
            "UPDATE call_relationships SET callee_symbol_id = ?1 WHERE id = ?2",
        )?;

        for (call_id, file_id, callee_name) in unresolved_calls {
            let target_sym_id: Option<i64> = find_target
                .query_row(params![callee_name, project_id, file_id], |row| row.get(0))
                .ok();

            if let Some(target_id) = target_sym_id {
                update_call.execute(params![target_id, call_id])?;
                updated += 1;
            }
        }

        // 2. Resolve cross-file class instantiations
        let mut get_unresolved_inst = conn.prepare(
            "SELECT i.id, i.file_id, i.class_name
             FROM class_instantiations i
             WHERE i.project_id = ?1
               AND i.resolution_status = 'confirmed'
               AND i.class_symbol_id IS NULL",
        )?;

        let unresolved_insts: Vec<(i64, i64, String)> = get_unresolved_inst
            .query_map(params![project_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })?
            .filter_map(|r| r.ok())
            .collect();

        let mut update_inst = conn.prepare(
            "UPDATE class_instantiations SET class_symbol_id = ?1 WHERE id = ?2",
        )?;

        for (inst_id, file_id, class_name) in unresolved_insts {
            let target_sym_id: Option<i64> = find_target
                .query_row(params![class_name, project_id, file_id], |row| row.get(0))
                .ok();

            if let Some(target_id) = target_sym_id {
                update_inst.execute(params![target_id, inst_id])?;
                updated += 1;
            }
        }

        // 3. Update callers_json for all functions across the project
        let mut get_functions = conn.prepare(
            "SELECT f.id, f.file_id, f.symbol_id, f.name
             FROM functions f
             WHERE f.project_id = ?1",
        )?;

        let functions_list: Vec<(i64, i64, Option<i64>, String)> = get_functions
            .query_map(params![project_id], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                ))
            })?
            .filter_map(|r| r.ok())
            .collect();

        let mut find_callers = conn.prepare(
            "SELECT DISTINCT caller_sym.name
             FROM call_relationships c
             JOIN symbols caller_sym ON caller_sym.id = c.caller_symbol_id
             WHERE c.project_id = ?1
               AND (
                 (?2 IS NOT NULL AND c.callee_symbol_id = ?2)
                 OR
                 (c.file_id = ?3 AND c.callee_name = ?4)
               )",
        )?;

        let mut update_func_callers = conn.prepare(
            "UPDATE functions SET callers_json = ?1 WHERE id = ?2",
        )?;

        for (func_id, file_id, sym_id, name) in functions_list {
            let callers: Vec<String> = find_callers
                .query_map(params![project_id, sym_id, file_id, name], |row| {
                    row.get::<_, Option<String>>(0)
                })?
                .filter_map(|r| r.ok().flatten())
                .filter(|s| !s.is_empty())
                .collect();

            let mut sorted_callers = callers;
            sorted_callers.sort();
            sorted_callers.dedup();

            let json_str = serde_json::to_string(&sorted_callers).unwrap_or_else(|_| "[]".to_string());
            update_func_callers.execute(params![json_str, func_id])?;
        }

        Ok(updated)
    }

    /// Re-resolves calls targeting a specific modified/re-parsed file.
    pub fn re_resolve_calls_for_file(
        conn: &Connection,
        project_id: i64,
        target_file_id: i64,
    ) -> Result<usize> {
        let mut updated = 0;

        // Find incoming import_edges targeting this file
        let mut stmt = conn.prepare(
            "SELECT DISTINCT source_file_id FROM import_edges WHERE project_id = ?1 AND target_file_id = ?2",
        )?;

        let source_files: Vec<i64> = stmt
            .query_map(params![project_id, target_file_id], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        let mut find_target = conn.prepare(
            "SELECT s.id
             FROM symbols s
             WHERE s.file_id = ?1 AND s.name = ?2
             LIMIT 1",
        )?;

        let mut update_call = conn.prepare(
            "UPDATE call_relationships SET callee_symbol_id = ?1 WHERE id = ?2",
        )?;

        for src_file_id in source_files {
            let mut get_calls = conn.prepare(
                "SELECT c.id, c.callee_name
                 FROM call_relationships c
                 WHERE c.project_id = ?1
                   AND c.file_id = ?2
                   AND c.resolution_status = 'confirmed'",
            )?;

            let calls: Vec<(i64, String)> = get_calls
                .query_map(params![project_id, src_file_id], |row| {
                    Ok((row.get(0)?, row.get(1)?))
                })?
                .filter_map(|r| r.ok())
                .collect();

            for (call_id, callee_name) in calls {
                if let Ok(sym_id) = find_target.query_row(params![target_file_id, callee_name], |row| row.get::<_, i64>(0)) {
                    update_call.execute(params![sym_id, call_id])?;
                    updated += 1;
                }
            }
        }

        Ok(updated)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::connection::open_in_memory;
    use crate::store::migrations::run_migrations;
    use crate::store::projects::create_or_get_project;

    #[test]
    fn test_cross_file_call_resolution() {
        let conn = open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let proj = create_or_get_project(&conn, "/test/path", "test").unwrap();

        // Insert two files: utils.ts and main.ts
        conn.execute(
            "INSERT INTO files (project_id, relative_path, file_name, extension, size_bytes, content_hash, status)
             VALUES (?1, 'src/utils.ts', 'utils.ts', 'ts', 100, 'h1', 'parsed')",
            params![proj.id],
        ).unwrap();
        let utils_file_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO files (project_id, relative_path, file_name, extension, size_bytes, content_hash, status)
             VALUES (?1, 'src/main.ts', 'main.ts', 'ts', 100, 'h2', 'parsed')",
            params![proj.id],
        ).unwrap();
        let main_file_id = conn.last_insert_rowid();

        // Insert symbol helper in utils.ts
        conn.execute(
            "INSERT INTO source_evidence (project_id, file_path, start_line, end_line, start_column, end_column, snippet, confidence, evidence_type)
             VALUES (?1, 'src/utils.ts', 1, 3, 0, 1, 'function helper()', 'confirmed', 'ast_node')",
            params![proj.id],
        ).unwrap();
        let ev_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO symbols (project_id, file_id, stable_id, name, qualified_name, kind, signature, source_evidence_id)
             VALUES (?1, ?2, 'utils:helper:function', 'helper', 'helper', 'function', 'function helper()', ?3)",
            params![proj.id, utils_file_id, ev_id],
        ).unwrap();
        let helper_sym_id = conn.last_insert_rowid();

        // Insert import_edge from main.ts to utils.ts importing helper
        conn.execute(
            "INSERT INTO import_edges (project_id, source_file_id, target_file_id, target_module, imported_name, line_number, resolution_status)
             VALUES (?1, ?2, ?3, './utils', 'helper', 1, 'internal')",
            params![proj.id, main_file_id, utils_file_id],
        ).unwrap();

        // Insert call in main.ts to helper (confirmed, but callee_symbol_id IS NULL)
        conn.execute(
            "INSERT INTO source_evidence (project_id, file_path, start_line, end_line, start_column, end_column, snippet, confidence, evidence_type)
             VALUES (?1, 'src/main.ts', 5, 5, 0, 8, 'helper()', 'confirmed', 'call_site')",
            params![proj.id],
        ).unwrap();
        let call_ev_id = conn.last_insert_rowid();

        // Insert caller symbol run() in main.ts
        conn.execute(
            "INSERT INTO symbols (project_id, file_id, stable_id, name, qualified_name, kind, signature, source_evidence_id)
             VALUES (?1, ?2, 'main:run:function', 'run', 'run', 'function', 'function run()', ?3)",
            params![proj.id, main_file_id, call_ev_id],
        ).unwrap();
        let run_sym_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO call_relationships (project_id, file_id, caller_symbol_id, callee_name, resolution_status, source_evidence_id)
             VALUES (?1, ?2, ?3, 'helper', 'confirmed', ?4)",
            params![proj.id, main_file_id, run_sym_id, call_ev_id],
        ).unwrap();
        let call_id = conn.last_insert_rowid();

        // Insert function row for helper in utils.ts
        conn.execute(
            "INSERT INTO functions (project_id, file_id, symbol_id, name)
             VALUES (?1, ?2, ?3, 'helper')",
            params![proj.id, utils_file_id, helper_sym_id],
        ).unwrap();
        let helper_func_id = conn.last_insert_rowid();

        // Run resolver
        let resolved_count = CallResolver::resolve_project_calls(&conn, proj.id).unwrap();
        assert_eq!(resolved_count, 1);

        // Assert callee_symbol_id is now helper_sym_id
        let resolved_callee: Option<i64> = conn
            .query_row(
                "SELECT callee_symbol_id FROM call_relationships WHERE id = ?1",
                params![call_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(resolved_callee, Some(helper_sym_id));

        // Assert helper's callers_json was updated
        let callers_json: String = conn
            .query_row(
                "SELECT callers_json FROM functions WHERE id = ?1",
                params![helper_func_id],
                |r| r.get(0),
            )
            .unwrap();
        let callers: Vec<String> = serde_json::from_str(&callers_json).unwrap();
        assert_eq!(callers, vec!["run".to_string()]);
    }
}
