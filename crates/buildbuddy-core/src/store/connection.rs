use rusqlite::{Connection, Result};
use std::path::{Path, PathBuf};

pub fn open_database(db_path: &Path) -> Result<Connection> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let conn = Connection::open(db_path)?;
    configure_database(&conn)?;
    Ok(conn)
}

pub fn open_in_memory() -> Result<Connection> {
    let conn = Connection::open_in_memory()?;
    configure_database(&conn)?;
    Ok(conn)
}

pub fn configure_database(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA busy_timeout = 5000;
         PRAGMA temp_store = MEMORY;"
    )?;
    Ok(())
}

pub fn get_default_db_path() -> PathBuf {
    if let Ok(app_data) = std::env::var("APPDATA") {
        PathBuf::from(app_data).join("BuildBuddy").join("buildbuddy.db")
    } else if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home)
            .join(".local")
            .join("share")
            .join("BuildBuddy")
            .join("buildbuddy.db")
    } else {
        PathBuf::from("buildbuddy.db")
    }
}

