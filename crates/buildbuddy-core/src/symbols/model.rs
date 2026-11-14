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

