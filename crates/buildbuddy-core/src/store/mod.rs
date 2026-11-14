pub mod connection;
pub mod files;
pub mod migrations;
pub mod projects;
pub mod symbols;

pub use connection::{open_database, open_in_memory};
pub use files::{batch_insert_or_update_files, get_file_by_id, list_files_for_project, FileRecord, ScannedFileInsert};
pub use migrations::run_migrations;
pub use projects::{create_or_get_project, get_project_by_id, list_projects, Project};
pub use symbols::{get_imports_for_file, get_symbols_for_file, persist_file_parse_result, search_symbols_fts};
