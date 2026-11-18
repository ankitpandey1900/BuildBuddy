use buildbuddy_core::diagram::builders::{
    build_architecture_overview_diagram, build_call_graph, build_class_diagram,
    build_er_diagram, build_file_dependency_diagram, build_module_dependency_diagram,
};
use buildbuddy_core::diagram::export::save_export_file;
use buildbuddy_core::diagram::model::{
    CollapsedOverview, DiagramModel, DiagramType, DrillDownResult, DroppedEdge,
};
use buildbuddy_core::diagram::progressive::{apply_progressive_disclosure, drill_down as core_drill_down};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::State;

use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagramOptions {
    pub enable_progressive_disclosure: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagramResponse {
    pub model: DiagramModel,
    pub dropped_edges: Vec<DroppedEdge>,
    pub collapsed_overview: Option<CollapsedOverview>,
}

/// Core implementation for getting a diagram from the database.
pub fn get_diagram_impl(
    conn: &Connection,
    diagram_type: &str,
    project_id: i64,
    options: Option<DiagramOptions>,
) -> Result<DiagramResponse, String> {
    let dtype = DiagramType::from_str(diagram_type)
        .ok_or_else(|| format!("Unknown diagram type: {}", diagram_type))?;

    let report = match dtype {
        DiagramType::FileDependency => {
            build_file_dependency_diagram(conn, project_id).map_err(|e| e.to_string())?
        }
        DiagramType::ModuleDependency => {
            build_module_dependency_diagram(conn, project_id).map_err(|e| e.to_string())?
        }
        DiagramType::ArchitectureOverview => {
            build_architecture_overview_diagram(conn, project_id).map_err(|e| e.to_string())?
        }
        DiagramType::ClassDiagram => {
            build_class_diagram(conn, project_id).map_err(|e| e.to_string())?
        }
        DiagramType::CallGraph => {
            build_call_graph(conn, project_id).map_err(|e| e.to_string())?
        }
        DiagramType::ErDiagram => {
            build_er_diagram(conn, project_id).map_err(|e| e.to_string())?
        }
    };

    let check_progressive = options
        .as_ref()
        .and_then(|o| o.enable_progressive_disclosure)
        .unwrap_or(true);

    let collapsed_overview = if check_progressive {
        apply_progressive_disclosure(&report.model)
    } else {
        None
    };

    Ok(DiagramResponse {
        model: report.model,
        dropped_edges: report.dropped_edges,
        collapsed_overview,
    })
}

/// Core implementation for drilling down into a group.
/// Returns exactly that group's nodes and edges where BOTH endpoints are inside the group.
pub fn drill_down_impl(
    conn: &Connection,
    group_id: &str,
    project_id: i64,
    diagram_type: Option<&str>,
) -> Result<DrillDownResult, String> {
    let dtype_str = diagram_type.unwrap_or("file_dependency");
    let dtype = DiagramType::from_str(dtype_str)
        .ok_or_else(|| format!("Unknown diagram type: {}", dtype_str))?;

    let report = match dtype {
        DiagramType::FileDependency => {
            build_file_dependency_diagram(conn, project_id).map_err(|e| e.to_string())?
        }
        DiagramType::ModuleDependency => {
            build_module_dependency_diagram(conn, project_id).map_err(|e| e.to_string())?
        }
        DiagramType::ArchitectureOverview => {
            build_architecture_overview_diagram(conn, project_id).map_err(|e| e.to_string())?
        }
        DiagramType::ClassDiagram => {
            build_class_diagram(conn, project_id).map_err(|e| e.to_string())?
        }
        DiagramType::CallGraph => {
            build_call_graph(conn, project_id).map_err(|e| e.to_string())?
        }
        DiagramType::ErDiagram => {
            build_er_diagram(conn, project_id).map_err(|e| e.to_string())?
        }
    };

    Ok(core_drill_down(&report.model, group_id))
}

#[tauri::command]
pub async fn get_diagram(
    diagram_type: String,
    project_id: i64,
    options: Option<DiagramOptions>,
    state: State<'_, AppState>,
) -> Result<DiagramResponse, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    get_diagram_impl(&conn, &diagram_type, project_id, options)
}

#[tauri::command]
pub async fn drill_down(
    group_id: String,
    project_id: i64,
    diagram_type: Option<String>,
    state: State<'_, AppState>,
) -> Result<DrillDownResult, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    drill_down_impl(&conn, &group_id, project_id, diagram_type.as_deref())
}

#[tauri::command]
pub async fn export_diagram_file(
    target_path: String,
    project_id: i64,
    content: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;
    let root_path: String = conn
        .query_row(
            "SELECT root_path FROM projects WHERE id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Project not found: {}", e))?;

    let saved = save_export_file(
        Path::new(&target_path),
        Path::new(&root_path),
        content.as_bytes(),
    )?;

    Ok(saved.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use buildbuddy_core::store::connection::open_in_memory;
    use buildbuddy_core::store::migrations::run_migrations;
    use rusqlite::params;
    use std::collections::HashSet;

    fn setup_test_db() -> Connection {
        let conn = open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let project_id = 1i64;
        conn.execute(
            "INSERT INTO projects (id, name, root_path) VALUES (?1, 'test', 'C:/test')",
            params![project_id],
        )
        .unwrap();

        // Insert files in two different directories (modules)
        conn.execute(
            "INSERT INTO files (id, project_id, relative_path, file_name, extension, size_bytes, content_hash, status)
             VALUES (1, 1, 'src/api/client.ts', 'client.ts', 'ts', 100, 'h1', 'parsed')",
            params![],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO files (id, project_id, relative_path, file_name, extension, size_bytes, content_hash, status)
             VALUES (2, 1, 'src/api/types.ts', 'types.ts', 'ts', 50, 'h2', 'parsed')",
            params![],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO files (id, project_id, relative_path, file_name, extension, size_bytes, content_hash, status)
             VALUES (3, 1, 'src/ui/Button.tsx', 'Button.tsx', 'tsx', 80, 'h3', 'parsed')",
            params![],
        )
        .unwrap();

        // Insert source evidence
        conn.execute(
            "INSERT INTO source_evidence (id, project_id, file_path, start_line, end_line, start_column, end_column, snippet, confidence, evidence_type)
             VALUES (10, 1, 'src/api/client.ts', 1, 1, 0, 30, 'import { User } from \"./types\";', 'static', 'import_stmt')",
            params![],
        )
        .unwrap();

        conn.execute(
            "INSERT INTO source_evidence (id, project_id, file_path, start_line, end_line, start_column, end_column, snippet, confidence, evidence_type)
             VALUES (20, 1, 'src/ui/Button.tsx', 1, 1, 0, 30, 'import { client } from \"../api/client\";', 'static', 'import_stmt')",
            params![],
        )
        .unwrap();

        // Edge 1: internal within src/api (file 1 -> file 2)
        conn.execute(
            "INSERT INTO import_edges (id, project_id, source_file_id, target_file_id, target_module, imported_name, is_type_only, line_number, resolution_status, source_evidence_id)
             VALUES (1, 1, 1, 2, './types', 'User', 0, 1, 'internal', 10)",
            params![],
        )
        .unwrap();

        // Edge 2: cross-group edge (file 3 in src/ui -> file 1 in src/api)
        conn.execute(
            "INSERT INTO import_edges (id, project_id, source_file_id, target_file_id, target_module, imported_name, is_type_only, line_number, resolution_status, source_evidence_id)
             VALUES (2, 1, 3, 1, '../api/client', 'client', 0, 1, 'internal', 20)",
            params![],
        )
        .unwrap();

        conn
    }

    #[test]
    fn test_get_diagram_impl_file_dependency() {
        let conn = setup_test_db();
        let resp = get_diagram_impl(&conn, "file_dependency", 1, None).expect("get_diagram_impl succeeds");

        assert_eq!(resp.model.nodes.len(), 3);
        assert_eq!(resp.model.edges.len(), 2);
        assert!(resp.dropped_edges.is_empty());
        assert!(resp.collapsed_overview.is_none()); // Under 150 node threshold

        // Check edge evidence
        for edge in &resp.model.edges {
            assert!(edge.evidence_id > 0);
            assert!(!edge.evidence_key.is_empty());
            assert_eq!(edge.relationship.as_str(), "import");
        }
    }

    #[test]
    fn test_drill_down_impl_returns_strictly_internal_edges() {
        let conn = setup_test_db();
        // Group for src/api contains client.ts and types.ts
        let group_id = "group:dir:src/api";
        let result = drill_down_impl(&conn, group_id, 1, Some("file_dependency"))
            .expect("drill_down_impl succeeds");

        assert_eq!(result.group_id, group_id);
        assert_eq!(result.nodes.len(), 2);
        for node in &result.nodes {
            assert_eq!(node.group_id.as_deref(), Some(group_id));
        }

        // Verify strictly internal edges:
        // The cross-group edge (from src/ui/Button.tsx to src/api/client.ts) MUST NOT be present
        // Only the internal edge (from src/api/client.ts to src/api/types.ts) should be returned!
        let node_id_set: HashSet<String> = result.nodes.iter().map(|n| n.id.clone()).collect();
        assert_eq!(result.edges.len(), 1);
        for edge in &result.edges {
            assert!(
                node_id_set.contains(&edge.from),
                "Edge from '{}' must be within the group",
                edge.from
            );
            assert!(
                node_id_set.contains(&edge.to),
                "Edge to '{}' must be within the group",
                edge.to
            );
        }
    }
}
