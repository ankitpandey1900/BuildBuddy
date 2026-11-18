use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::core::store::projects::{create_or_get_project, get_project_by_id, list_projects, update_project_settings, Project};
use crate::AppState;

#[tauri::command]
pub async fn select_and_open_project(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<Project>, String> {
    // Open native folder picker
    let folder_opt = app.dialog().file().blocking_pick_folder();

    let folder_path = match folder_opt {
        Some(path_buf) => {
            // In tauri-plugin-dialog 2.0, blocking_pick_folder returns Option<FilePath>
            // Convert to PathBuf
            path_buf.into_path().map_err(|e| format!("Invalid path: {:?}", e))?
        }
        None => return Ok(None),
    };

    open_project_internal(&state, &folder_path)
}

#[tauri::command]
pub async fn open_project_by_path(
    path: String,
    state: State<'_, AppState>,
) -> Result<Project, String> {
    let folder_path = PathBuf::from(&path);
    if !folder_path.exists() || !folder_path.is_dir() {
        return Err(format!("Directory does not exist: {}", path));
    }
    open_project_internal(&state, &folder_path)?
        .ok_or_else(|| "Failed to open project".to_string())
}

fn open_project_internal(state: &AppState, folder_path: &Path) -> Result<Option<Project>, String> {
    let canonical = folder_path
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize path: {}", e))?;

    let name = canonical
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Project".to_string());

    let raw_str = canonical.to_string_lossy().replace('\\', "/");
    let root_path_str = if let Some(stripped) = raw_str.strip_prefix("//?/") {
        stripped.to_string()
    } else if let Some(stripped) = raw_str.strip_prefix(r"\\?\") {
        stripped.to_string()
    } else {
        raw_str
    };

    let conn = state.conn().map_err(|e| e.to_string())?;
    let proj = create_or_get_project(&conn, &root_path_str, &name).map_err(|e| e.to_string())?;

    Ok(Some(proj))
}

#[tauri::command]
pub async fn get_recent_projects(
    state: State<'_, AppState>,
) -> Result<Vec<Project>, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    list_projects(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_project(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<Project, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    get_project_by_id(&conn, project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_project_settings(
    project_id: i64,
    settings_json: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    update_project_settings(&conn, project_id, &settings_json).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_project(
    project_id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    crate::core::store::projects::delete_project(&conn, project_id).map_err(|e| e.to_string())
}

