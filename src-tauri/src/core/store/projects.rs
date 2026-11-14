use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub root_path: String,
    pub created_at: String,
    pub updated_at: String,
    pub settings_json: String,
}

pub fn create_or_get_project(conn: &Connection, root_path: &str, name: &str) -> Result<Project> {
    // Check if project exists by root_path
    let existing = conn.query_row(
        "SELECT id, name, root_path, created_at, updated_at, settings_json 
         FROM projects WHERE root_path = ?1",
        params![root_path],
        |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                root_path: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                settings_json: row.get(5)?,
            })
        },
    );

    match existing {
        Ok(mut proj) => {
            // Update updated_at
            conn.execute(
                "UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
                params![proj.id],
            )?;
            proj.updated_at = chrono::Utc::now().to_rfc3339();
            Ok(proj)
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            conn.execute(
                "INSERT INTO projects (name, root_path, settings_json) VALUES (?1, ?2, '{}')",
                params![name, root_path],
            )?;
            let id = conn.last_insert_rowid();
            get_project_by_id(conn, id)
        }
        Err(e) => Err(e),
    }
}

pub fn list_projects(conn: &Connection) -> Result<Vec<Project>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, root_path, created_at, updated_at, settings_json 
         FROM projects ORDER BY updated_at DESC",
    )?;

    let iter = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            root_path: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            settings_json: row.get(5)?,
        })
    })?;

    let mut projects = Vec::new();
    for p in iter {
        projects.push(p?);
    }
    Ok(projects)
}

pub fn get_project_by_id(conn: &Connection, id: i64) -> Result<Project> {
    conn.query_row(
        "SELECT id, name, root_path, created_at, updated_at, settings_json 
         FROM projects WHERE id = ?1",
        params![id],
        |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                root_path: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                settings_json: row.get(5)?,
            })
        },
    )
}

pub fn update_project_settings(conn: &Connection, id: i64, settings_json: &str) -> Result<()> {
    conn.execute(
        "UPDATE projects SET settings_json = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![settings_json, id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::store::connection::open_in_memory;
    use crate::core::store::migrations::run_migrations;

    #[test]
    fn test_project_crud() {
        let conn = open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let proj = create_or_get_project(&conn, "/path/to/my-repo", "my-repo").unwrap();
        assert_eq!(proj.name, "my-repo");
        assert_eq!(proj.root_path, "/path/to/my-repo");

        // Reopening returns the same project ID
        let reopened = create_or_get_project(&conn, "/path/to/my-repo", "my-repo").unwrap();
        assert_eq!(proj.id, reopened.id);

        let list = list_projects(&conn).unwrap();
        assert_eq!(list.len(), 1);

        update_project_settings(&conn, proj.id, "{\"theme\":\"light\"}").unwrap();
        let updated = get_project_by_id(&conn, proj.id).unwrap();
        assert_eq!(updated.settings_json, "{\"theme\":\"light\"}");
    }
}

