use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SymbolKind {
    Function,
    Class,
    Method,
    Interface,
    TypeAlias,
    Constant,
    Variable,
}

impl SymbolKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            SymbolKind::Function => "function",
            SymbolKind::Class => "class",
            SymbolKind::Method => "method",
            SymbolKind::Interface => "interface",
            SymbolKind::TypeAlias => "type_alias",
            SymbolKind::Constant => "constant",
            SymbolKind::Variable => "variable",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Parameter {
    pub name: String,
    pub type_annotation: Option<String>,
    pub default_value: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExtractedSymbol {
    pub stable_id: String,
    pub name: String,
    pub qualified_name: String,
    pub kind: SymbolKind,
    pub parent_name: Option<String>,
    pub start_line: usize,
    pub end_line: usize,
    pub start_column: usize,
    pub end_column: usize,
    pub parameters: Vec<Parameter>,
    pub return_type: Option<String>,
    pub is_exported: bool,
    pub is_async: bool,
    pub visibility: Option<String>,
    pub docstring: Option<String>,
    pub signature: String,
}

impl ExtractedSymbol {
    /// Computes a deterministic stable ID from (relative_path, qualified_name, kind).
    /// Survives re-scans when symbol identity is unchanged.
    pub fn compute_stable_id(relative_path: &str, qualified_name: &str, kind: SymbolKind) -> String {
        let key = format!("{}:{}:{}", relative_path, qualified_name, kind.as_str());
        blake3::hash(key.as_bytes()).to_hex().to_string()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExtractedImport {
    pub source_module: String,
    pub imported_name: String,
    pub alias: Option<String>,
    pub is_type_only: bool,
    pub line_number: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExtractedExport {
    pub exported_name: String,
    pub local_name: String,
    pub is_default: bool,
    pub line_number: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CallResolutionStatus {
    Confirmed,
    Static,
    Inferred,
    Unknown,
}

impl CallResolutionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            CallResolutionStatus::Confirmed => "confirmed",
            CallResolutionStatus::Static => "static",
            CallResolutionStatus::Inferred => "inferred",
            CallResolutionStatus::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExtractedCallSite {
    pub caller_symbol_id: Option<String>,
    pub callee_name: String,
    pub callee_symbol_id: Option<String>,
    pub start_line: usize,
    pub end_line: usize,
    pub start_column: usize,
    pub end_column: usize,
    pub snippet: String,
    pub resolution_status: CallResolutionStatus,
    pub is_dynamic: bool,
    pub receiver: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SideEffectMarker {
    pub category: String, // "fs", "network", "db"
    pub pattern: String,
    pub confidence: String, // "static"
    pub line_number: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FunctionMetrics {
    pub parameters: Vec<Parameter>,
    pub return_type: Option<String>,
    pub callers: Vec<String>,
    pub callees: Vec<String>,
    pub imports_used: Vec<String>,
    pub branch_count: usize,
    pub loop_count: usize,
    pub cyclomatic_complexity: usize,
    pub has_error_handling: bool,
    pub side_effects: Vec<SideEffectMarker>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExtractedFunction {
    pub symbol_stable_id: String,
    pub name: String,
    pub qualified_name: String,
    pub metrics: FunctionMetrics,
    pub start_line: usize,
    pub end_line: usize,
    pub start_column: usize,
    pub end_column: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClassProperty {
    pub name: String,
    pub type_annotation: Option<String>,
    pub visibility: Option<String>,
    pub is_static: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClassMethod {
    pub name: String,
    pub signature: String,
    pub visibility: Option<String>,
    pub is_static: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClassConstructor {
    pub signature: String,
    pub parameters: Vec<Parameter>,
    pub start_line: usize,
    pub end_line: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClassInstantiation {
    pub class_name: String,
    pub caller_symbol_id: Option<String>,
    pub class_symbol_id: Option<String>,
    pub start_line: usize,
    pub end_line: usize,
    pub start_column: usize,
    pub end_column: usize,
    pub snippet: String,
    pub resolution_status: CallResolutionStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExtractedClass {
    pub symbol_stable_id: String,
    pub name: String,
    pub superclass: Option<String>,
    pub interfaces: Vec<String>,
    pub properties: Vec<ClassProperty>,
    pub methods: Vec<ClassMethod>,
    pub constructors: Vec<ClassConstructor>,
    pub instantiations: Vec<ClassInstantiation>,
    pub start_line: usize,
    pub end_line: usize,
    pub start_column: usize,
    pub end_column: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stable_id_deterministic() {
        let id1 = ExtractedSymbol::compute_stable_id("src/client.ts", "Client.fetchData", SymbolKind::Method);
        let id2 = ExtractedSymbol::compute_stable_id("src/client.ts", "Client.fetchData", SymbolKind::Method);
        assert_eq!(id1, id2);
        assert!(!id1.is_empty());
    }

    #[test]
    fn test_stable_id_differs_by_path_or_kind() {
        let id1 = ExtractedSymbol::compute_stable_id("src/client.ts", "calculate", SymbolKind::Function);
        let id2 = ExtractedSymbol::compute_stable_id("src/other.ts", "calculate", SymbolKind::Function);
        let id3 = ExtractedSymbol::compute_stable_id("src/client.ts", "calculate", SymbolKind::Constant);

        assert_ne!(id1, id2);
        assert_ne!(id1, id3);
    }
}

