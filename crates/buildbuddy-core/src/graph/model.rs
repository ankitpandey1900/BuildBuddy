use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ResolutionStatus {
    Internal,
    External,
    Unresolved,
}

impl ResolutionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Internal => "internal",
            Self::External => "external",
            Self::Unresolved => "unresolved",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "internal" => Some(Self::Internal),
            "external" => Some(Self::External),
            "unresolved" => Some(Self::Unresolved),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ImportEdge {
    pub source_file_id: i64,
    pub source_file_path: String,
    pub target_file_id: Option<i64>,
    pub target_file_path: Option<String>,
    pub target_module: String,
    pub imported_name: String,
    pub is_type_only: bool,
    pub line_number: usize,
    pub resolution_status: ResolutionStatus,
    pub source_evidence_id: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CircularDependencyCycle {
    pub cycle_files: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DependencyOverview {
    pub internal_edges_count: usize,
    pub external_dependencies_count: usize,
    pub unresolved_count: usize,
    pub circular_cycles_count: usize,
    pub unused_dependencies_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProjectResolutionReport {
    pub edges: Vec<ResolvedEdgeSummary>,
    pub cycles: Vec<Vec<String>>,
    pub manifest_dependencies: Vec<ManifestDependencySummary>,
    pub unused_dependencies: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ResolvedEdgeSummary {
    pub source_file: String,
    pub target_module: String,
    pub imported_name: String,
    pub resolution_status: String,
    pub target_file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManifestDependencySummary {
    pub name: String,
    pub version_spec: Option<String>,
    pub dep_type: String,
}
