use serde::{Deserialize, Serialize};

/// The kind of a diagram node.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiagramNodeKind {
    File,
    Module,
    Class,
    Component,
    External,
}

impl DiagramNodeKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            DiagramNodeKind::File => "file",
            DiagramNodeKind::Module => "module",
            DiagramNodeKind::Class => "class",
            DiagramNodeKind::Component => "component",
            DiagramNodeKind::External => "external",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "file" => DiagramNodeKind::File,
            "module" => DiagramNodeKind::Module,
            "class" => DiagramNodeKind::Class,
            "component" => DiagramNodeKind::Component,
            "external" => DiagramNodeKind::External,
            _ => DiagramNodeKind::File,
        }
    }
}

/// The type of relationship an edge represents.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RelationshipType {
    Import,
    Call,
    Inheritance,
    Instantiation,
    DeclaredDependency,
    Entry,
}

impl RelationshipType {
    pub fn as_str(&self) -> &'static str {
        match self {
            RelationshipType::Import => "import",
            RelationshipType::Call => "call",
            RelationshipType::Inheritance => "inheritance",
            RelationshipType::Instantiation => "instantiation",
            RelationshipType::DeclaredDependency => "declared_dependency",
            RelationshipType::Entry => "entry",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "import" => RelationshipType::Import,
            "call" => RelationshipType::Call,
            "inheritance" => RelationshipType::Inheritance,
            "instantiation" => RelationshipType::Instantiation,
            "declared_dependency" => RelationshipType::DeclaredDependency,
            "entry" => RelationshipType::Entry,
            _ => RelationshipType::Import,
        }
    }
}

/// Confidence label for an edge (same vocabulary as AGENTS.md).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiagramConfidence {
    Confirmed,
    Static,
    Inferred,
    Unknown,
}

impl DiagramConfidence {
    pub fn as_str(&self) -> &'static str {
        match self {
            DiagramConfidence::Confirmed => "confirmed",
            DiagramConfidence::Static => "static",
            DiagramConfidence::Inferred => "inferred",
            DiagramConfidence::Unknown => "unknown",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "confirmed" => DiagramConfidence::Confirmed,
            "static" => DiagramConfidence::Static,
            "inferred" => DiagramConfidence::Inferred,
            _ => DiagramConfidence::Unknown,
        }
    }
}

/// Source reference for traceability.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourceRef {
    pub file_path: String,
    pub start_line: usize,
    pub end_line: usize,
}

/// A node in a diagram.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DiagramNode {
    pub id: String,
    pub kind: DiagramNodeKind,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
    pub width: f64,
    pub height: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_ref: Option<SourceRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metrics: Option<NodeMetrics>,
}

/// Optional metrics attached to a node.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NodeMetrics {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub class_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub import_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub complexity: Option<usize>,
}

/// An edge in a diagram. `evidence_id` and `evidence_key` are REQUIRED.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiagramEdge {
    pub id: String,
    pub from: String,
    pub to: String,
    pub relationship: RelationshipType,
    pub confidence: DiagramConfidence,
    /// Must reference a real `source_evidence` row. Non-optional.
    pub evidence_id: i64,
    /// Stable evidence key (file_path:start_line-end_line:evidence_type).
    pub evidence_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// An aggregated edge used in module-level overview (progressive disclosure).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AggregatedEdge {
    pub id: String,
    pub from: String,
    pub to: String,
    pub relationship: RelationshipType,
    pub edge_count: usize,
    /// IDs of the underlying individual edges.
    pub underlying_edge_ids: Vec<String>,
    /// Evidence IDs from the underlying edges.
    pub evidence_ids: Vec<i64>,
    /// Evidence keys from the underlying edges.
    pub evidence_keys: Vec<String>,
}

/// A group (container) in a diagram.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiagramGroup {
    pub id: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_group: Option<String>,
    pub collapsed: bool,
}

/// An edge that was dropped because it lacked evidence.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DroppedEdge {
    pub from: String,
    pub to: String,
    pub relationship: String,
    pub reason: String,
}

/// The type of diagram.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiagramType {
    FileDependency,
    ModuleDependency,
    ArchitectureOverview,
    ClassDiagram,
}

impl DiagramType {
    pub fn as_str(&self) -> &'static str {
        match self {
            DiagramType::FileDependency => "file_dependency",
            DiagramType::ModuleDependency => "module_dependency",
            DiagramType::ArchitectureOverview => "architecture_overview",
            DiagramType::ClassDiagram => "class_diagram",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "file_dependency" => Some(DiagramType::FileDependency),
            "module_dependency" => Some(DiagramType::ModuleDependency),
            "architecture_overview" => Some(DiagramType::ArchitectureOverview),
            "class_diagram" => Some(DiagramType::ClassDiagram),
            _ => None,
        }
    }
}

/// A full diagram model ready for layout.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DiagramModel {
    pub diagram_type: DiagramType,
    pub nodes: Vec<DiagramNode>,
    pub edges: Vec<DiagramEdge>,
    pub groups: Vec<DiagramGroup>,
}

/// Report returned by a builder, including the model and any dropped edges.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DiagramReport {
    pub model: DiagramModel,
    pub dropped_edges: Vec<DroppedEdge>,
}

/// A collapsed overview returned for graphs exceeding the node threshold.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CollapsedOverview {
    pub model: DiagramModel,
    pub aggregated_edges: Vec<AggregatedEdge>,
    pub total_node_count: usize,
    pub threshold: usize,
}

/// The result of `drill_down(group_id)`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DrillDownResult {
    pub group_id: String,
    pub nodes: Vec<DiagramNode>,
    pub edges: Vec<DiagramEdge>,
}

/// Node size constants per kind (width x height).
pub const NODE_SIZE_FILE: (f64, f64) = (180.0, 40.0);
pub const NODE_SIZE_MODULE: (f64, f64) = (200.0, 50.0);
pub const NODE_SIZE_CLASS: (f64, f64) = (220.0, 60.0);
pub const NODE_SIZE_COMPONENT: (f64, f64) = (200.0, 50.0);
pub const NODE_SIZE_EXTERNAL: (f64, f64) = (160.0, 40.0);

/// Progressive disclosure threshold (nodes).
pub const PROGRESSIVE_DISCLOSURE_THRESHOLD: usize = 150;

pub fn node_size_for_kind(kind: &DiagramNodeKind) -> (f64, f64) {
    match kind {
        DiagramNodeKind::File => NODE_SIZE_FILE,
        DiagramNodeKind::Module => NODE_SIZE_MODULE,
        DiagramNodeKind::Class => NODE_SIZE_CLASS,
        DiagramNodeKind::Component => NODE_SIZE_COMPONENT,
        DiagramNodeKind::External => NODE_SIZE_EXTERNAL,
    }
}

/// A 2D point (e.g. for edge bend points / waypoints).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

/// A node positioned by the layout engine.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PositionedNode {
    pub id: String,
    pub kind: DiagramNodeKind,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_ref: Option<SourceRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metrics: Option<NodeMetrics>,
}

/// An edge positioned with bend points / route by the layout engine.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PositionedEdge {
    pub id: String,
    pub from: String,
    pub to: String,
    pub relationship: RelationshipType,
    pub confidence: DiagramConfidence,
    pub evidence_id: i64,
    pub evidence_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub points: Vec<Point>,
}

/// A group positioned by the layout engine.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PositionedGroup {
    pub id: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_group: Option<String>,
    pub collapsed: bool,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Full positioned model produced by layout.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PositionedModel {
    pub diagram_type: DiagramType,
    pub nodes: Vec<PositionedNode>,
    pub edges: Vec<PositionedEdge>,
    pub groups: Vec<PositionedGroup>,
    pub width: f64,
    pub height: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_node_sizes_consistent() {
        assert_eq!(node_size_for_kind(&DiagramNodeKind::File), NODE_SIZE_FILE);
        assert_eq!(node_size_for_kind(&DiagramNodeKind::Module), NODE_SIZE_MODULE);
        assert_eq!(node_size_for_kind(&DiagramNodeKind::Class), NODE_SIZE_CLASS);
    }

    #[test]
    fn test_diagram_type_roundtrip() {
        let types = vec![
            DiagramType::FileDependency,
            DiagramType::ModuleDependency,
            DiagramType::ArchitectureOverview,
            DiagramType::ClassDiagram,
        ];
        for t in types {
            let s = t.as_str();
            assert_eq!(DiagramType::from_str(s), Some(t));
        }
    }

    #[test]
    fn test_serialization_roundtrip() {
        let model = DiagramModel {
            diagram_type: DiagramType::FileDependency,
            nodes: vec![DiagramNode {
                id: "n1".to_string(),
                kind: DiagramNodeKind::File,
                label: "index.ts".to_string(),
                group_id: None,
                width: NODE_SIZE_FILE.0,
                height: NODE_SIZE_FILE.1,
                source_ref: Some(SourceRef {
                    file_path: "src/index.ts".to_string(),
                    start_line: 1,
                    end_line: 10,
                }),
                metrics: None,
            }],
            edges: vec![DiagramEdge {
                id: "e1".to_string(),
                from: "n1".to_string(),
                to: "n2".to_string(),
                relationship: RelationshipType::Import,
                confidence: DiagramConfidence::Static,
                evidence_id: 42,
                evidence_key: "src/index.ts:1-1:import_stmt".to_string(),
                label: Some("import { foo }".to_string()),
            }],
            groups: vec![],
        };

        let json = serde_json::to_string(&model).unwrap();
        let deserialized: DiagramModel = serde_json::from_str(&json).unwrap();
        assert_eq!(model, deserialized);
    }
}

