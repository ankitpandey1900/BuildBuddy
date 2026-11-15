use std::fs;
use std::path::Path;
use tauri::State;

use crate::core::arch::model::{ArchitectureModel, OverviewDataDto, ProjectArchReport};
use crate::core::arch::ArchitectureAnalyzer;
use crate::core::graph::{FileImportItem, ProjectGraphResolver};
use crate::core::manifest::package_json::parse_package_json;
use crate::core::manifest::python::{parse_pyproject_toml, parse_requirements_txt};
use crate::core::parser::ParserManager;
use crate::core::store::arch::ArchStore;
use crate::AppState;

#[tauri::command]
pub async fn get_overview_data(
    state: State<'_, AppState>,
    project_id: i64,
) -> Result<OverviewDataDto, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;

    // Check if we need to auto-populate architecture findings
    let framework_count: i64 = conn
        .query_row(
            "SELECT count(*) FROM frameworks WHERE project_id = ?1",
            rusqlite::params![project_id],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let module_count: i64 = conn
        .query_row(
            "SELECT count(*) FROM modules WHERE project_id = ?1",
            rusqlite::params![project_id],
            |r| r.get(0),
        )
        .unwrap_or(0);

    if framework_count == 0 && module_count == 0 {
        let root_path: Result<String, _> = conn.query_row(
            "SELECT root_path FROM projects WHERE id = ?1",
            rusqlite::params![project_id],
            |r| r.get(0),
        );
        if let Ok(path) = root_path {
            drop(conn);
            let _ = analyze_architecture(state.clone(), project_id, path).await;
            let c2 = state.conn().map_err(|e| e.to_string())?;
            return ArchStore::get_overview_data(&c2, project_id).map_err(|e| e.to_string());
        }
    }

    ArchStore::get_overview_data(&conn, project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_architecture_model(
    state: State<'_, AppState>,
    project_id: i64,
) -> Result<Option<ArchitectureModel>, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    ArchStore::get_architecture_model(&conn, project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn analyze_architecture(
    state: State<'_, AppState>,
    project_id: i64,
    project_path: String,
) -> Result<ProjectArchReport, String> {
    let mut conn = state.conn().map_err(|e| e.to_string())?;

    let root = Path::new(&project_path);
    let files = {
        let mut stmt = conn
            .prepare("SELECT id, relative_path FROM files WHERE project_id = ?1")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([project_id], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?;

        let mut list: Vec<(i64, String)> = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| e.to_string())?);
        }
        list
    };

    let parser = ParserManager::new();
    let mut all_files = Vec::new();
    let mut parsed_results = Vec::new();
    let mut manifest_deps = Vec::new();
    let mut raw_imports = Vec::new();

    for (file_id, rel_path) in &files {
        let abs_path = root.join(rel_path);
        let content = fs::read_to_string(&abs_path).unwrap_or_default();

        all_files.push((rel_path.clone(), content.clone()));

        if rel_path == "package.json" {
            if let Ok(deps) = parse_package_json(&content, rel_path) {
                manifest_deps.extend(deps);
            }
        } else if rel_path == "requirements.txt" {
            if let Ok(deps) = parse_requirements_txt(&content, rel_path) {
                manifest_deps.extend(deps);
            }
        } else if rel_path == "pyproject.toml" {
            if let Ok(deps) = parse_pyproject_toml(&content, rel_path) {
                manifest_deps.extend(deps);
            }
        }

        let ext = abs_path.extension().and_then(|s| s.to_str());
        if let Some(e) = ext {
            if matches!(e, "ts" | "tsx" | "js" | "jsx" | "py") {
                if let Ok(parsed) = parser.parse_source(rel_path, Some(e), &content) {
                    for imp in &parsed.imports {
                        raw_imports.push(FileImportItem {
                            source_file_id: *file_id,
                            source_file_path: rel_path.clone(),
                            source_module: imp.source_module.clone(),
                            imported_name: imp.imported_name.clone(),
                            is_type_only: imp.is_type_only,
                            line_number: imp.line_number,
                            source_evidence_id: None,
                        });
                    }
                    parsed_results.push((rel_path.clone(), parsed, content));
                }
            }
        }
    }

    let tsconfig_content = fs::read_to_string(root.join("tsconfig.json")).ok();
    let resolver = ProjectGraphResolver::new(&files, tsconfig_content.as_deref());
    let edges = resolver.resolve_all(&raw_imports);

    let all_files_refs: Vec<(String, &str)> = all_files
        .iter()
        .map(|(p, c)| (p.clone(), c.as_str()))
        .collect();

    let parsed_refs: Vec<(String, &crate::core::parser::FileParseResult, &str)> = parsed_results
        .iter()
        .map(|(p, res, c)| (p.clone(), res, c.as_str()))
        .collect();

    let report = ArchitectureAnalyzer::analyze(&all_files_refs, &parsed_refs, &manifest_deps, &edges);

    ArchStore::persist_architecture(
        &mut conn,
        project_id,
        &report.frameworks,
        &report.declared_only,
        &report.entry_points,
        &report.modules,
        &report.architecture_model,
    )
    .map_err(|e| e.to_string())?;

    Ok(report)
}

