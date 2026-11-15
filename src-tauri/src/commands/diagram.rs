use buildbuddy_core::diagram::builders::{
    build_architecture_overview_diagram, build_class_diagram, build_file_dependency_diagram,
    build_module_dependency_diagram,
};
use buildbuddy_core::diagram::model::{
    CollapsedOverview, DiagramModel, DiagramType, DrillDownResult, DroppedEdge,
};
use buildbuddy_core::diagram::progressive::{apply_progressive_disclosure, drill_down as core_drill_down};
use serde::{Deserialize, Serialize};
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

#[tauri::command]
pub async fn get_diagram(
    diagram_type: String,
    project_id: i64,
    options: Option<DiagramOptions>,
    state: State<'_, AppState>,
) -> Result<DiagramResponse, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;

    let dtype = DiagramType::from_str(&diagram_type)
        .ok_or_else(|| format!("Unknown diagram type: {}", diagram_type))?;

    let report = match dtype {
        DiagramType::FileDependency => {
            build_file_dependency_diagram(&conn, project_id).map_err(|e| e.to_string())?
        }
        DiagramType::ModuleDependency => {
            build_module_dependency_diagram(&conn, project_id).map_err(|e| e.to_string())?
        }
        DiagramType::ArchitectureOverview => {
            build_architecture_overview_diagram(&conn, project_id).map_err(|e| e.to_string())?
        }
        DiagramType::ClassDiagram => {
            build_class_diagram(&conn, project_id).map_err(|e| e.to_string())?
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

#[tauri::command]
pub async fn drill_down(
    group_id: String,
    project_id: i64,
    diagram_type: Option<String>,
    state: State<'_, AppState>,
) -> Result<DrillDownResult, String> {
    let conn = state.conn().map_err(|e| e.to_string())?;

    let dtype_str = diagram_type.as_deref().unwrap_or("file_dependency");
    let dtype = DiagramType::from_str(dtype_str)
        .ok_or_else(|| format!("Unknown diagram type: {}", dtype_str))?;

    let report = match dtype {
        DiagramType::FileDependency => {
            build_file_dependency_diagram(&conn, project_id).map_err(|e| e.to_string())?
        }
        DiagramType::ModuleDependency => {
            build_module_dependency_diagram(&conn, project_id).map_err(|e| e.to_string())?
        }
        DiagramType::ArchitectureOverview => {
            build_architecture_overview_diagram(&conn, project_id).map_err(|e| e.to_string())?
        }
        DiagramType::ClassDiagram => {
            build_class_diagram(&conn, project_id).map_err(|e| e.to_string())?
        }
    };

    Ok(core_drill_down(&report.model, &group_id))
}
