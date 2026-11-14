use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRecord {
    pub id: i64,
    pub project_id: i64,
    pub relative_path: String,
    pub file_name: String,
    pub extension: Option<String>,
    pub language_id: Option<i64>,
    pub size_bytes: i64,
    pub line_count: i64,
    pub function_count: i64,
    pub class_count: i64,
    pub import_count: i64,
    pub content_hash: String,
    pub status: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedFileInsert {
    pub relative_path: String,
    pub file_name: String,
    pub extension: Option<String>,
    pub size_bytes: i64,
    pub line_count: i64,
    pub content_hash: String,
    pub status: String,
}

pub fn batch_insert_or_update_files(
    conn: &mut Connection,
    project_id: i64,
    analysis_run_id: i64,
    scanned_files: &[ScannedFileInsert],
) -> Result<usize> {
    let tx = conn.transaction()?;
    let mut count = 0;

    {
        let mut stmt = tx.prepare(
            "INSERT INTO files (
                project_id, relative_path, file_name, extension, 
                size_bytes, line_count, content_hash, status, last_analysis_run_id, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, CURRENT_TIMESTAMP)
            ON CONFLICT(project_id, relative_path) DO UPDATE SET
                file_name = excluded.file_name,
                extension = excluded.extension,
                size_bytes = excluded.size_bytes,
                line_count = excluded.line_count,
                content_hash = excluded.content_hash,
                status = excluded.status,
                last_analysis_run_id = excluded.last_analysis_run_id,
                updated_at = CURRENT_TIMESTAMP",
        )?;

        for file in scanned_files {
            stmt.execute(params![
                project_id,
                file.relative_path,
                file.file_name,
                file.extension,
                file.size_bytes,
                file.line_count,
                file.content_hash,
                file.status,
                analysis_run_id
            ])?;
            count += 1;
        }
    }

    tx.commit()?;
    Ok(count)
}

pub fn list_files_for_project(
    conn: &Connection,
    project_id: i64,
    search: Option<&str>,
    extension: Option<&str>,
) -> Result<Vec<FileRecord>> {
    let mut query = "SELECT id, project_id, relative_path, file_name, extension, language_id, 
                            size_bytes, line_count, function_count, class_count, import_count, 
                            content_hash, status, updated_at 
                     FROM files WHERE project_id = ?1".to_string();

    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(project_id)];

    if let Some(ext) = extension {
        if !ext.is_empty() && ext != "all" {
            query.push_str(" AND LOWER(extension) = LOWER(?");
            query.push_str(&(params_vec.len() + 1).to_string());
            query.push(')');
            params_vec.push(Box::new(ext.to_string()));
        }
    }

    if let Some(s) = search {
        if !s.is_empty() {
            query.push_str(" AND (relative_path LIKE ?");
            query.push_str(&(params_vec.len() + 1).to_string());
            query.push_str(" OR file_name LIKE ?");
            query.push_str(&(params_vec.len() + 1).to_string());
            query.push(')');
            let pattern = format!("%{}%", s);
            params_vec.push(Box::new(pattern));
        }
    }

    query.push_str(" ORDER BY relative_path ASC");

    let params_slice: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&query)?;

    let iter = stmt.query_map(params_slice.as_slice(), |row| {
        Ok(FileRecord {
            id: row.get(0)?,
            project_id: row.get(1)?,
            relative_path: row.get(2)?,
            file_name: row.get(3)?,
            extension: row.get(4)?,
            language_id: row.get(5)?,
            size_bytes: row.get(6)?,
            line_count: row.get(7)?,
            function_count: row.get(8)?,
            class_count: row.get(9)?,
            import_count: row.get(10)?,
            content_hash: row.get(11)?,
            status: row.get(12)?,
            updated_at: row.get(13)?,
        })
    })?;

    let mut files = Vec::new();
    for f in iter {
        files.push(f?);
    }
    Ok(files)
}

pub fn get_file_by_id(conn: &Connection, file_id: i64) -> Result<FileRecord> {
    conn.query_row(
        "SELECT id, project_id, relative_path, file_name, extension, language_id, 
                size_bytes, line_count, function_count, class_count, import_count, 
                content_hash, status, updated_at 
         FROM files WHERE id = ?1",
        params![file_id],
        |row| {
            Ok(FileRecord {
                id: row.get(0)?,
                project_id: row.get(1)?,
                relative_path: row.get(2)?,
                file_name: row.get(3)?,
                extension: row.get(4)?,
                language_id: row.get(5)?,
                size_bytes: row.get(6)?,
                line_count: row.get(7)?,
                function_count: row.get(8)?,
                class_count: row.get(9)?,
                import_count: row.get(10)?,
                content_hash: row.get(11)?,
                status: row.get(12)?,
                updated_at: row.get(13)?,
            })
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::connection::open_in_memory;
    use crate::store::migrations::run_migrations;
    use crate::store::projects::create_or_get_project;

    #[test]
    fn test_file_batch_insert_and_query() {
        let mut conn = open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let proj = create_or_get_project(&conn, "/test/repo", "repo").unwrap();

        conn.execute(
            "INSERT INTO analysis_runs (project_id, status) VALUES (?1, 'completed')",
            params![proj.id],
        ).unwrap();
        let run_id = conn.last_insert_rowid();

        let scanned = vec![
            ScannedFileInsert {
                relative_path: "src/main.rs".to_string(),
                file_name: "main.rs".to_string(),
                extension: Some("rs".to_string()),
                size_bytes: 1024,
                line_count: 50,
                content_hash: "hash1".to_string(),
                status: "parsed".to_string(),
            },
            ScannedFileInsert {
                relative_path: "package.json".to_string(),
                file_name: "package.json".to_string(),
                extension: Some("json".to_string()),
                size_bytes: 512,
                line_count: 25,
                content_hash: "hash2".to_string(),
                status: "parsed".to_string(),
            },
        ];

        let count = batch_insert_or_update_files(&mut conn, proj.id, run_id, &scanned).unwrap();
        assert_eq!(count, 2);

        let files = list_files_for_project(&conn, proj.id, None, None).unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].relative_path, "package.json");
        assert_eq!(files[1].relative_path, "src/main.rs");

        let rs_files = list_files_for_project(&conn, proj.id, None, Some("rs")).unwrap();
        assert_eq!(rs_files.len(), 1);
        assert_eq!(rs_files[0].file_name, "main.rs");

        let search_files = list_files_for_project(&conn, proj.id, Some("main"), None).unwrap();
        assert_eq!(search_files.len(), 1);
    }
}

