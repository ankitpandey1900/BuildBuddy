pub mod commands;
pub mod core;

use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use rusqlite::Connection;

pub struct AppState {
    pub db_path: PathBuf,
    pub scan_cancel_flag: Arc<AtomicBool>,
    pub parse_cancel_flag: Arc<AtomicBool>,
}

impl AppState {
    pub fn new(db_path: PathBuf) -> Self {
        Self {
            db_path,
            scan_cancel_flag: Arc::new(AtomicBool::new(false)),
            parse_cancel_flag: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn conn(&self) -> rusqlite::Result<Connection> {
        core::store::connection::open_database(&self.db_path)
    }
}

pub fn run() {
    let db_path = core::store::connection::get_default_db_path();

    // Ensure database directory exists and run migrations
    if let Ok(conn) = core::store::connection::open_database(&db_path) {
        if let Err(e) = core::store::migrations::run_migrations(&conn) {
            eprintln!("Failed to run database migrations: {}", e);
        }
    } else {
        eprintln!("Warning: Failed to initialize SQLite database at {:?}", db_path);
    }

    let state = AppState::new(db_path);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::project::select_and_open_project,
            commands::project::open_project_by_path,
            commands::project::get_recent_projects,
            commands::project::get_project,
            commands::project::set_project_settings,
            commands::project::remove_project,
            commands::scanner::start_scan,
            commands::scanner::cancel_scan,
            commands::parser::start_parse,
            commands::parser::cancel_parse,
            commands::explorer::get_files,
            commands::explorer::get_file_details,
            commands::explorer::read_file_content,
            commands::explorer::get_file_symbols,
            commands::explorer::get_file_imports,
            commands::explorer::search_symbols,
            commands::explorer::list_symbols,
            commands::explorer::get_symbol_detail,
            commands::explorer::get_class_detail,
            commands::graph::get_dependencies_overview,
            commands::graph::get_findings,
            commands::graph::get_circular_dependencies,
            commands::graph::get_import_edges,
            commands::graph::get_package_inventory,
            commands::graph::get_file_intelligence,
            commands::graph::get_git_status,
            commands::graph::resolve_and_persist_project_graph,
            commands::arch::get_overview_data,
            commands::arch::get_architecture_model,
            commands::arch::analyze_architecture,
            commands::api::get_api_endpoints,
            commands::database::get_database_tables,
            commands::diagram::get_diagram,
            commands::diagram::drill_down,
            commands::diagram::export_diagram_file,
            commands::docs::get_document,
            commands::docs::generate_document,
            commands::docs::save_document_section,
            commands::docs::list_document_revisions,
            commands::docs::export_document,
        ])
        .run(tauri::generate_context!())
        .expect("error while running BuildBuddy application");
}


