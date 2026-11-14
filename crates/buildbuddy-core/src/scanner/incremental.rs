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
            let mut del_stmt = tx.prepare("DELETE FROM files WHERE id = ?1")?;
            for &id in &plan.deleted_file_ids {
                del_stmt.execute(params![id])?;
            }

            // For modified files, delete existing symbols, imports, exports, and edges
            let mut del_symbols = tx.prepare("DELETE FROM symbols WHERE file_id = ?1")?;
            let mut del_imports = tx.prepare("DELETE FROM imports WHERE file_id = ?1")?;
            let mut del_exports = tx.prepare("DELETE FROM exports WHERE file_id = ?1")?;
            let mut del_edges = tx.prepare("DELETE FROM import_edges WHERE source_file_id = ?1")?;

            for &(id, _) in &plan.modified {
                del_symbols.execute(params![id])?;
                del_imports.execute(params![id])?;
                del_exports.execute(params![id])?;
                del_edges.execute(params![id])?;
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
}
