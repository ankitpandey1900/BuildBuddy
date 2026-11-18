use tauri::State;

use crate::core::store::api::{ApiStore, StoredApiEndpoint};
use crate::AppState;

#[tauri::command]
pub async fn get_api_endpoints(
    state: State<'_, AppState>,
    project_id: i64,
) -> Result<Vec<StoredApiEndpoint>, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    ApiStore::get_endpoints(&conn, project_id).map_err(|e| e.to_string())
}
