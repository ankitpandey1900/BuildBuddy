use tauri::State;
use crate::{AppState, core::store::database::{DatabaseStore, StoredDatabaseTable}};
#[tauri::command]
pub async fn get_database_tables(state: State<'_, AppState>, project_id: i64) -> Result<Vec<StoredDatabaseTable>, String> { DatabaseStore::get_tables(&state.conn().map_err(|e| e.to_string())?, project_id).map_err(|e| e.to_string()) }
