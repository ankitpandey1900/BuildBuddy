use std::fs;
use std::path::Path;
use tauri::State;

use crate::core::graph::{
    CircularDependencyCycle, CycleDetector, DependencyOverview, FileImportItem, ImportEdge,
    ProjectGraphResolver, UnusedDependencyDetector,
};
use crate::core::manifest::package_json::parse_package_json;
use crate::core::manifest::python::{parse_pyproject_toml, parse_requirements_txt};
use crate::core::store::graph::GraphStore;
use crate::core::vcs::{detect_git_status, GitRepoStatus};
use crate::AppState;

#[tauri::command]
pub async fn get_findings(
    state: State<'_, AppState>,
    project_id: i64,
) -> Result<Vec<crate::core::store::graph::StoredFinding>, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    GraphStore::get_findings(&conn, project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_dependencies_overview(
    state: State<'_, AppState>,
    project_id: i64,
) -> Result<DependencyOverview, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    GraphStore::get_dependency_overview(&conn, project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_circular_dependencies(
    state: State<'_, AppState>,
    project_id: i64,
) -> Result<Vec<CircularDependencyCycle>, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    let edges = GraphStore::get_import_edges(&conn, project_id).map_err(|e| e.to_string())?;
    Ok(CycleDetector::find_circular_dependencies(&edges))
}

#[tauri::command]
pub async fn get_import_edges(
    state: State<'_, AppState>,
    project_id: i64,
) -> Result<Vec<ImportEdge>, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    GraphStore::get_import_edges(&conn, project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_git_status(project_path: String) -> Result<GitRepoStatus, String> {
    let path = Path::new(&project_path);
    Ok(detect_git_status(path))
}

#[tauri::command]
pub async fn resolve_and_persist_project_graph(
    state: State<'_, AppState>,
    project_id: i64,
    project_path: String,
) -> Result<DependencyOverview, String> {
    let mut conn = state.conn().map_err(|e| e.to_string())?;

    // 1. Fetch all files for project
    let files = {
        let mut stmt = conn
            .prepare("SELECT id, relative_path FROM files WHERE project_id = ?1")
            .map_err(|e| e.to_string())?;

        let file_rows = stmt
            .query_map([project_id], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for f in file_rows {
            list.push(f.map_err(|e| e.to_string())?);
        }
        list
    };

    // 2. Read tsconfig if present
    let root = Path::new(&project_path);
    let tsconfig_content = fs::read_to_string(root.join("tsconfig.json")).ok();

    // 3. Fetch all raw imports
    let import_items = {
        let mut imp_stmt = conn
            .prepare(
                "SELECT i.file_id, f.relative_path, i.source_module, i.imported_name,
                        i.is_type_only, i.line_number, i.source_evidence_id
                 FROM imports i
                 JOIN files f ON i.file_id = f.id
                 WHERE i.project_id = ?1",
            )
            .map_err(|e| e.to_string())?;

        let imp_rows = imp_stmt
            .query_map([project_id], |row| {
                Ok(FileImportItem {
                    source_file_id: row.get(0)?,
                    source_file_path: row.get(1)?,
                    source_module: row.get(2)?,
                    imported_name: row.get(3)?,
                    is_type_only: row.get::<_, i64>(4)? != 0,
                    line_number: row.get::<_, i64>(5)? as usize,
                    source_evidence_id: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for imp in imp_rows {
            list.push(imp.map_err(|e| e.to_string())?);
        }
        list
    };

    // 4. Resolve imports
    let resolver = ProjectGraphResolver::new(&files, tsconfig_content.as_deref());
    let edges = resolver.resolve_all(&import_items);

    // 5. Detect cycles
    let cycles = CycleDetector::find_circular_dependencies(&edges);

    // 6. Parse manifests
    let mut manifest_deps = Vec::new();
    for (file_id, rel_path) in &files {
        let abs_path = root.join(rel_path);
        let content = fs::read_to_string(&abs_path).unwrap_or_default();

        if rel_path == "package.json" {
            if let Ok(deps) = parse_package_json(&content, rel_path) {
                let _ = GraphStore::insert_manifest_dependencies(&mut conn, project_id, *file_id, &deps);
                manifest_deps.extend(deps);
            }
        } else if rel_path == "requirements.txt" {
            if let Ok(deps) = parse_requirements_txt(&content, rel_path) {
                let _ = GraphStore::insert_manifest_dependencies(&mut conn, project_id, *file_id, &deps);
                manifest_deps.extend(deps);
            }
        } else if rel_path == "pyproject.toml" {
            if let Ok(deps) = parse_pyproject_toml(&content, rel_path) {
                let _ = GraphStore::insert_manifest_dependencies(&mut conn, project_id, *file_id, &deps);
                manifest_deps.extend(deps);
            }
        }
    }

    // 7. Find unused dependencies
    let unused = UnusedDependencyDetector::find_unused(&manifest_deps, &edges);

    // 8. Persist edges and findings
    // Delete prior edges & graph findings
    conn.execute("DELETE FROM import_edges WHERE project_id = ?1", [project_id])
        .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM findings WHERE project_id = ?1 AND category IN ('circular_dependency', 'unused_dependency')",
        [project_id],
    )
    .map_err(|e| e.to_string())?;

    GraphStore::insert_import_edges(&mut conn, project_id, &edges).map_err(|e| e.to_string())?;

    // Cross-file call resolution after import edges are stored
    let _ = crate::core::graph::CallResolver::resolve_project_calls(&conn, project_id);

    // Run architecture analysis (frameworks, entry points, modules, diagrams)
    let parser = crate::core::parser::ParserManager::new();
    let mut all_files_vec = Vec::new();
    let mut parsed_results_vec = Vec::new();
    for (_fid, rel_path) in &files {
        let abs_path = root.join(rel_path);
        let content = fs::read_to_string(&abs_path).unwrap_or_default();
        all_files_vec.push((rel_path.clone(), content.clone()));

        let ext = abs_path.extension().and_then(|s| s.to_str());
        if let Some(e) = ext {
            if matches!(e, "ts" | "tsx" | "js" | "jsx" | "py") {
                if let Ok(parsed) = parser.parse_source(rel_path, Some(e), &content) {
                    parsed_results_vec.push((rel_path.clone(), parsed, content));
                }
            }
        }
    }
    let all_files_refs: Vec<(String, &str)> = all_files_vec.iter().map(|(p, c)| (p.clone(), c.as_str())).collect();
    let parsed_refs: Vec<(String, &crate::core::parser::FileParseResult, &str)> = parsed_results_vec.iter().map(|(p, res, c)| (p.clone(), res, c.as_str())).collect();
    let arch_report = crate::core::arch::ArchitectureAnalyzer::analyze(&all_files_refs, &parsed_refs, &manifest_deps, &edges);
    let _ = crate::core::store::arch::ArchStore::persist_architecture(
        &mut conn,
        project_id,
        &arch_report.frameworks,
        &arch_report.declared_only,
        &arch_report.entry_points,
        &arch_report.modules,
        &arch_report.architecture_model,
    );

    for cycle in cycles {
        let desc = cycle.cycle_files.join(" -> ");
        let metadata = serde_json::to_string(&cycle.cycle_files).unwrap_or_default();
        let _ = GraphStore::insert_finding(
            &conn,
            project_id,
            "circular_dependency",
            "Circular Dependency Cycle",
            &desc,
            "medium",
            "confirmed",
            None,
            &metadata,
        );
    }

    for u in unused {
        let title = format!("Potentially Unused Dependency: {}", u.package_name);
        let desc = format!(
            "Package '{}' is declared in {} but never imported in scanned source files.",
            u.package_name, u.source_file
        );
        let _ = GraphStore::insert_finding(
            &conn,
            project_id,
            "unused_dependency",
            &title,
            &desc,
            if u.is_likely_tooling { "info" } else { "low" },
            "inferred",
            None,
            "{}",
        );
    }

    GraphStore::get_dependency_overview(&conn, project_id).map_err(|e| e.to_string())
}
