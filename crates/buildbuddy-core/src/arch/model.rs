use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Confidence {
    Confirmed,
    Static,
    Inferred,
    Unknown,
}

impl Confidence {
    pub fn as_str(&self) -> &'static str {
        match self {
            Confidence::Confirmed => "confirmed",
            Confidence::Static => "static",
            Confidence::Inferred => "inferred",
            Confidence::Unknown => "unknown",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "confirmed" => Confidence::Confirmed,
            "static" => Confidence::Static,
            "inferred" => Confidence::Inferred,
            _ => Confidence::Unknown,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EvidenceItem {
    pub file_path: String,
    pub start_line: usize,
    pub end_line: usize,
    pub snippet: String,
    pub signal_type: String, // "manifest_dependency" | "config_file" | "import_usage" | "source_pattern"
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FrameworkDetection {
    pub name: String, // React, Next.js, Express, Vue, FastAPI, Flask, Django
    pub version: Option<String>,
    pub confidence: Confidence,
    pub evidence: Vec<EvidenceItem>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EntryPoint {
    pub name: String,
    pub entry_type: String, // "package_manifest" | "framework_entry" | "main_block" | "app_factory"
    pub file_path: String,
    pub start_line: usize,
    pub end_line: usize,
    pub snippet: String,
    pub confidence: Confidence,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum LayerLabel {
    Frontend,
    Backend,
    Data,
    Shared,
    Config,
    Unclassified,
}

impl LayerLabel {
    pub fn as_str(&self) -> &'static str {
        match self {
            LayerLabel::Frontend => "frontend",
            LayerLabel::Backend => "backend",
            LayerLabel::Data => "data",
            LayerLabel::Shared => "shared",
            LayerLabel::Config => "config",
            LayerLabel::Unclassified => "unclassified",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "frontend" => LayerLabel::Frontend,
            "backend" => LayerLabel::Backend,
            "data" => LayerLabel::Data,
            "shared" => LayerLabel::Shared,
            "config" => LayerLabel::Config,
            _ => LayerLabel::Unclassified,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ModuleGroup {
    pub name: String,
    pub root_directory: String,
    pub layer: LayerLabel,
    pub file_count: usize,
    pub cohesion_score: f64,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArchitectureNode {
    pub id: String,
    pub label: String,
    pub kind: String, // "module" | "file" | "entry_point"
    pub layer: String,
    pub file_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArchitectureEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub edge_type: String, // "imports" | "calls" | "belongs_to"
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArchitectureGroup {
    pub id: String,
    pub label: String,
    pub layer: String,
    pub node_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArchitectureModel {
    pub nodes: Vec<ArchitectureNode>,
    pub edges: Vec<ArchitectureEdge>,
    pub groups: Vec<ArchitectureGroup>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProjectArchReport {
    pub frameworks: Vec<FrameworkDetection>,
    pub entry_points: Vec<EntryPoint>,
    pub modules: Vec<ModuleGroup>,
    pub architecture_model: ArchitectureModel,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct LanguageMetric {
    pub name: String,
    pub file_count: usize,
    pub line_count: usize,
    pub percentage: f64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OverviewMetrics {
    pub total_files: usize,
    pub total_modules: usize,
    pub total_symbols: usize,
    pub total_functions: usize,
    pub total_classes: usize,
    pub total_entry_points: usize,
    pub total_dependencies: usize,
    pub unsupported_files_count: usize,
    pub partial_files_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AnalysisCompletionDto {
    pub status: String,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub duration_ms: Option<u64>,
    pub files_scanned: usize,
    pub files_parsed: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OverviewDataDto {
    pub project_name: String,
    pub root_path: String,
    pub metrics: OverviewMetrics,
    pub languages: Vec<LanguageMetric>,
    pub frameworks: Vec<FrameworkDetection>,
    pub entry_points: Vec<EntryPoint>,
    pub modules: Vec<ModuleGroup>,
    pub completion: Option<AnalysisCompletionDto>,
}
