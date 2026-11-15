use std::collections::{HashMap, HashSet};
use rusqlite::{params, Connection, Result};

use crate::store::files::ScannedFileInsert;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IncrementalPlan {
    pub added: Vec<ScannedFileInsert>,
    pub modified: Vec<(i64, ScannedFileInsert)>,
    pub unchanged: Vec<(i64, String)>,
    pub deleted_file_ids: Vec<i64>,
}

impl IncrementalPlan {
    pub fn files_parsed_count(&self) -> usize {
        self.added.len() + self.modified.len()
    }

    pub fn files_skipped_unchanged_count(&self) -> usize {
        self.unchanged.len()
    }
}

pub struct IncrementalEngine;

impl IncrementalEngine {
    pub fn compute_plan(
        conn: &Connection,
        project_id: i64,
        scanned_files: &[ScannedFileInsert],
    ) -> Result<IncrementalPlan> {
        let mut stmt = conn.prepare(
            "SELECT id, relative_path, content_hash FROM files WHERE project_id = ?1",
        )?;

        let mut existing_files: HashMap<String, (i64, String)> = HashMap::new();
        let rows = stmt.query_map(params![project_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
        })?;

        for r in rows {
            let (id, path, hash) = r?;
            existing_files.insert(path, (id, hash));
        }

        let mut added = Vec::new();
        let mut modified = Vec::new();
        let mut unchanged = Vec::new();
        let mut current_paths = HashSet::new();

        for scanned in scanned_files {
            current_paths.insert(scanned.relative_path.clone());
            if let Some(&(id, ref old_hash)) = existing_files.get(&scanned.relative_path) {
                if *old_hash == scanned.content_hash {
                    unchanged.push((id, scanned.relative_path.clone()));
                } else {
                    modified.push((id, scanned.clone()));
                }
            } else {
                added.push(scanned.clone());
            }
        }

        let mut deleted_file_ids = Vec::new();
        for (path, &(id, _)) in &existing_files {
            if !current_paths.contains(path) {
                deleted_file_ids.push(id);
            }
        }

        Ok(IncrementalPlan {
            added,
            modified,
            unchanged,
            deleted_file_ids,
        })
    }

    pub fn apply_plan_deletions(
        conn: &mut Connection,
        plan: &IncrementalPlan,
    ) -> Result<()> {
        let tx = conn.transaction()?;
        {
            let mut get_file_info = tx.prepare("SELECT project_id, relative_path FROM files WHERE id = ?1")?;
            let mut del_evidence = tx.prepare("DELETE FROM source_evidence WHERE project_id = ?1 AND file_path = ?2")?;
            let mut del_file = tx.prepare("DELETE FROM files WHERE id = ?1")?;

            for &id in &plan.deleted_file_ids {
                if let Ok((project_id, rel_path)) = get_file_info.query_row(params![id], |r| {
                    Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
                }) {
                    del_evidence.execute(params![project_id, rel_path])?;
                }
                del_file.execute(params![id])?;
            }

            // For modified files, delete existing symbols, imports, exports, edges, functions, classes, calls, and evidence
            let mut del_calls_origin = tx.prepare("DELETE FROM call_relationships WHERE file_id = ?1")?;
            let mut del_calls_targeting = tx.prepare(
                "DELETE FROM call_relationships WHERE callee_symbol_id IN (SELECT id FROM symbols WHERE file_id = ?1)"
            )?;
            let mut del_instantiations = tx.prepare(
                "DELETE FROM class_instantiations WHERE file_id = ?1 OR class_symbol_id IN (SELECT id FROM symbols WHERE file_id = ?1)"
            )?;
            let mut del_functions = tx.prepare("DELETE FROM functions WHERE file_id = ?1")?;
            let mut del_classes = tx.prepare("DELETE FROM classes WHERE file_id = ?1")?;
            let mut del_symbols = tx.prepare("DELETE FROM symbols WHERE file_id = ?1")?;
            let mut del_imports = tx.prepare("DELETE FROM imports WHERE file_id = ?1")?;
            let mut del_exports = tx.prepare("DELETE FROM exports WHERE file_id = ?1")?;
            let mut del_edges = tx.prepare("DELETE FROM import_edges WHERE source_file_id = ?1")?;
            let mut update_file_pending = tx.prepare(
                "UPDATE files SET status = 'pending', content_hash = ?1, size_bytes = ?2 WHERE id = ?3"
            )?;

            for &(id, ref scanned) in &plan.modified {
                if let Ok((project_id, rel_path)) = get_file_info.query_row(params![id], |r| {
                    Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
                }) {
                    del_evidence.execute(params![project_id, rel_path])?;
                }
                del_calls_origin.execute(params![id])?;
                del_calls_targeting.execute(params![id])?;
                del_instantiations.execute(params![id])?;
                del_functions.execute(params![id])?;
                del_classes.execute(params![id])?;
                del_symbols.execute(params![id])?;
                del_imports.execute(params![id])?;
                del_exports.execute(params![id])?;
                del_edges.execute(params![id])?;
                update_file_pending.execute(params![scanned.content_hash, scanned.size_bytes, id])?;
            }
        }
        tx.commit()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::connection::open_in_memory;
    use crate::store::migrations::run_migrations;
    use crate::store::projects::create_or_get_project;

    fn make_scanned_file(rel: &str, hash: &str) -> ScannedFileInsert {
        ScannedFileInsert {
            relative_path: rel.to_string(),
            file_name: rel.split('/').last().unwrap().to_string(),
            extension: rel.split('.').last().map(|s| s.to_string()),
            size_bytes: 100,
            line_count: 10,
            content_hash: hash.to_string(),
            status: "pending".to_string(),
        }
    }

    #[test]
    fn test_incremental_plan_categorization() {
        let mut conn = open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let project_id = create_or_get_project(&conn, "Test Incr", "/tmp/incr").unwrap().id;

        // Populate existing files
        conn.execute(
            "INSERT INTO files (project_id, relative_path, file_name, size_bytes, content_hash, status)
             VALUES (?1, 'src/unchanged.ts', 'unchanged.ts', 100, 'hash_unchanged', 'parsed')",
            params![project_id],
        ).unwrap();
        let unchanged_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO files (project_id, relative_path, file_name, size_bytes, content_hash, status)
             VALUES (?1, 'src/modified.ts', 'modified.ts', 100, 'old_hash', 'parsed')",
            params![project_id],
        ).unwrap();
        let modified_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO files (project_id, relative_path, file_name, size_bytes, content_hash, status)
             VALUES (?1, 'src/to_delete.ts', 'to_delete.ts', 100, 'hash_del', 'parsed')",
            params![project_id],
        ).unwrap();
        let del_id = conn.last_insert_rowid();

        // New scan: unchanged.ts has same hash, modified.ts has new hash, added.ts is new, to_delete.ts is missing
        let scanned = vec![
            make_scanned_file("src/unchanged.ts", "hash_unchanged"),
            make_scanned_file("src/modified.ts", "new_hash"),
            make_scanned_file("src/added.ts", "hash_added"),
        ];

        let plan = IncrementalEngine::compute_plan(&conn, project_id, &scanned).unwrap();

        assert_eq!(plan.unchanged, vec![(unchanged_id, "src/unchanged.ts".to_string())]);
        assert_eq!(plan.modified.len(), 1);
        assert_eq!(plan.modified[0].0, modified_id);
        assert_eq!(plan.added.len(), 1);
        assert_eq!(plan.added[0].relative_path, "src/added.ts");
        assert_eq!(plan.deleted_file_ids, vec![del_id]);

        assert_eq!(plan.files_parsed_count(), 2); // 1 added + 1 modified
        assert_eq!(plan.files_skipped_unchanged_count(), 1);

        IncrementalEngine::apply_plan_deletions(&mut conn, &plan).unwrap();

        let remaining: Vec<String> = conn
            .prepare("SELECT relative_path FROM files WHERE project_id = ?1 ORDER BY relative_path")
            .unwrap()
            .query_map(params![project_id], |r| r.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();

        // to_delete.ts is removed, unchanged and modified remain in files
        assert_eq!(remaining, vec!["src/modified.ts".to_string(), "src/unchanged.ts".to_string()]);
    }

    #[test]
    fn test_end_to_end_incremental_workflow() {
        use std::fs;
        use std::sync::atomic::AtomicBool;
        use std::sync::Arc;
        use tempfile::tempdir;
        use crate::scanner::walker::scan_directory;
        use crate::store::files::batch_insert_or_update_files;
        use crate::parser::ParserManager;
        use crate::store::symbols::persist_file_parse_result;
        use crate::graph::{FileImportItem, ProjectGraphResolver, ResolutionStatus};
        use crate::store::graph::GraphStore;

        let mut conn = open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let project_id = create_or_get_project(&conn, "E2E Incremental", "/tmp/e2e").unwrap().id;

        // Create temp project directory with initial files
        let project_dir = tempdir().unwrap();
        let src_dir = project_dir.path().join("src");
        fs::create_dir_all(&src_dir).unwrap();

        let utils_path = src_dir.join("utils.ts");
        fs::write(&utils_path, "export function helper(): string { return 'ok'; }\n").unwrap();

        let index_path = src_dir.join("index.ts");
        fs::write(
            &index_path,
            "import { helper } from './utils';\nimport { ghost } from './unresolved_module';\nexport const res = helper();\n",
        )
        .unwrap();

        let cancel = Arc::new(AtomicBool::new(false));

        // --- 1. Initial Full Scan ---
        conn.execute(
            "INSERT INTO analysis_runs (project_id, status) VALUES (?1, 'completed')",
            params![project_id],
        )
        .unwrap();
        let run_id = conn.last_insert_rowid();

        let initial_scanned = scan_directory(project_dir.path(), &[], cancel.clone(), |_| {}).unwrap();
        let n = initial_scanned.len();
        assert_eq!(n, 2);

        let plan1 = IncrementalEngine::compute_plan(&conn, project_id, &initial_scanned).unwrap();
        assert_eq!(plan1.added.len(), 2);
        assert_eq!(plan1.modified.len(), 0);
        assert_eq!(plan1.unchanged.len(), 0);
        assert_eq!(plan1.files_parsed_count(), 2);

        batch_insert_or_update_files(&mut conn, project_id, run_id, &initial_scanned).unwrap();

        // Parse and persist initial symbols & imports
        let parser = ParserManager::new();
        let mut import_items = Vec::new();
        let mut file_tuples = Vec::new();

        let files_in_db: Vec<(i64, String)> = conn
            .prepare("SELECT id, relative_path FROM files WHERE project_id = ?1")
            .unwrap()
            .query_map(params![project_id], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();

        for (fid, rpath) in &files_in_db {
            file_tuples.push((*fid, rpath.clone()));
            let full_p = project_dir.path().join(rpath);
            let content = fs::read_to_string(&full_p).unwrap();
            let parsed = parser.parse_source(rpath, Some("ts"), &content).unwrap();
            persist_file_parse_result(&mut conn, project_id, *fid, &parsed).unwrap();

            for imp in parsed.imports {
                import_items.push(FileImportItem {
                    source_file_id: *fid,
                    source_file_path: rpath.clone(),
                    source_module: imp.source_module,
                    imported_name: imp.imported_name,
                    is_type_only: imp.is_type_only,
                    line_number: imp.line_number,
                    source_evidence_id: None,
                });
            }
        }

        let resolver = ProjectGraphResolver::new(&file_tuples, None);
        let edges = resolver.resolve_all(&import_items);
        GraphStore::insert_import_edges(&mut conn, project_id, &edges).unwrap();

        // Check initial state: 1 internal edge (./utils), 1 unresolved edge (./unresolved_module)
        let initial_edges = GraphStore::get_import_edges(&conn, project_id).unwrap();
        assert_eq!(initial_edges.len(), 2);
        assert_eq!(
            initial_edges.iter().find(|e| e.target_module == "./unresolved_module").unwrap().resolution_status,
            ResolutionStatus::Unresolved
        );

        // --- 2. Check (a): Modify ONE file, assert files_parsed == 1 and files_skipped_unchanged == N - 1 ---
        fs::write(
            &utils_path,
            "export function helper(): string { return 'updated'; }\nexport function helper2(): number { return 42; }\n",
        )
        .unwrap();

        let scanned_a = scan_directory(project_dir.path(), &[], cancel.clone(), |_| {}).unwrap();
        let plan_a = IncrementalEngine::compute_plan(&conn, project_id, &scanned_a).unwrap();

        assert_eq!(plan_a.files_parsed_count(), 1, "Exactly 1 file should be queued for parse");
        assert_eq!(
            plan_a.files_skipped_unchanged_count(),
            n - 1,
            "N-1 files should be skipped unchanged"
        );
        assert_eq!(plan_a.modified.len(), 1);
        assert_eq!(plan_a.added.len(), 0);
        assert_eq!(plan_a.deleted_file_ids.len(), 0);

        IncrementalEngine::apply_plan_deletions(&mut conn, &plan_a).unwrap();

        // --- 3. Check (b): Delete a file, assert symbols/imports/edges gone and NO orphan evidence rows ---
        let delete_target_path = src_dir.join("utils.ts");
        let deleted_fid = files_in_db.iter().find(|(_, p)| p == "src/utils.ts").unwrap().0;
        fs::remove_file(&delete_target_path).unwrap();

        let scanned_b = scan_directory(project_dir.path(), &[], cancel.clone(), |_| {}).unwrap();
        let plan_b = IncrementalEngine::compute_plan(&conn, project_id, &scanned_b).unwrap();

        assert_eq!(plan_b.deleted_file_ids.len(), 1);
        assert_eq!(plan_b.deleted_file_ids[0], deleted_fid);

        IncrementalEngine::apply_plan_deletions(&mut conn, &plan_b).unwrap();

        let file_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM files WHERE id = ?1", params![deleted_fid], |r| r.get(0))
            .unwrap();
        assert_eq!(file_count, 0, "Deleted file should be removed from files table");

        let sym_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM symbols WHERE file_id = ?1", params![deleted_fid], |r| r.get(0))
            .unwrap();
        assert_eq!(sym_count, 0, "Symbols for deleted file must be gone");

        let imp_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM imports WHERE file_id = ?1", params![deleted_fid], |r| r.get(0))
            .unwrap();
        assert_eq!(imp_count, 0, "Imports for deleted file must be gone");

        let edge_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM import_edges WHERE source_file_id = ?1 OR target_file_id = ?1",
                params![deleted_fid],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(edge_count, 0, "Import edges for deleted file must be gone");

        let call_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM call_relationships WHERE file_id = ?1", params![deleted_fid], |r| r.get(0))
            .unwrap();
        assert_eq!(call_count, 0, "Call relationships for deleted file must be gone");

        let func_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM functions WHERE file_id = ?1", params![deleted_fid], |r| r.get(0))
            .unwrap();
        assert_eq!(func_count, 0, "Functions for deleted file must be gone");

        let class_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM classes WHERE file_id = ?1", params![deleted_fid], |r| r.get(0))
            .unwrap();
        assert_eq!(class_count, 0, "Classes for deleted file must be gone");

        let orphan_evidence: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM source_evidence WHERE file_path = 'src/utils.ts'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(orphan_evidence, 0, "No orphan source_evidence rows for deleted file");

        // --- 4. Check (c): Add a file, assert only it is parsed and edges that now resolve to it are updated ---
        let new_file_path = src_dir.join("unresolved_module.ts");
        fs::write(&new_file_path, "export const ghost = 'found_now';\n").unwrap();

        let scanned_c = scan_directory(project_dir.path(), &[], cancel.clone(), |_| {}).unwrap();
        let plan_c = IncrementalEngine::compute_plan(&conn, project_id, &scanned_c).unwrap();

        assert_eq!(plan_c.added.len(), 1, "Only 1 newly added file");
        assert_eq!(plan_c.files_parsed_count(), 1, "Only newly added file should be parsed");
        assert_eq!(plan_c.added[0].relative_path, "src/unresolved_module.ts");

        batch_insert_or_update_files(&mut conn, project_id, run_id, &plan_c.added).unwrap();

        let new_file_id: i64 = conn
            .query_row(
                "SELECT id FROM files WHERE relative_path = 'src/unresolved_module.ts' AND project_id = ?1",
                params![project_id],
                |r| r.get(0),
            )
            .unwrap();

        let new_content = fs::read_to_string(&new_file_path).unwrap();
        let new_parsed = parser.parse_source("src/unresolved_module.ts", Some("ts"), &new_content).unwrap();
        persist_file_parse_result(&mut conn, project_id, new_file_id, &new_parsed).unwrap();

        // Re-resolve graph
        let mut updated_tuples = Vec::new();
        let mut updated_imports = Vec::new();

        let current_files: Vec<(i64, String)> = conn
            .prepare("SELECT id, relative_path FROM files WHERE project_id = ?1")
            .unwrap()
            .query_map(params![project_id], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();

        for (fid, rpath) in current_files {
            updated_tuples.push((fid, rpath.clone()));
            let full_p = project_dir.path().join(&rpath);
            let content = fs::read_to_string(&full_p).unwrap();
            let parsed = parser.parse_source(&rpath, Some("ts"), &content).unwrap();
            for imp in parsed.imports {
                updated_imports.push(FileImportItem {
                    source_file_id: fid,
                    source_file_path: rpath.clone(),
                    source_module: imp.source_module,
                    imported_name: imp.imported_name,
                    is_type_only: imp.is_type_only,
                    line_number: imp.line_number,
                    source_evidence_id: None,
                });
            }
        }

        let resolver2 = ProjectGraphResolver::new(&updated_tuples, None);
        let updated_edges = resolver2.resolve_all(&updated_imports);

        // The edge './unresolved_module' in src/index.ts that was previously unresolved
        // must NOW resolve to src/unresolved_module.ts as internal!
        let resolved_edge = updated_edges
            .iter()
            .find(|e| e.target_module == "./unresolved_module")
            .unwrap();
        assert_eq!(resolved_edge.resolution_status, ResolutionStatus::Internal);
        assert_eq!(resolved_edge.target_file_id, Some(new_file_id));
        assert_eq!(
            resolved_edge.target_file_path.as_deref(),
            Some("src/unresolved_module.ts")
        );
    }
}
