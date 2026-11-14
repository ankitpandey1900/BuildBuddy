use tree_sitter::{Node, Parser};

use crate::parser::traits::{FileParseResult, LanguageAdapter, ParseError, ParseStatus, ParserLimits};
use crate::symbols::model::{ExtractedExport, ExtractedImport, ExtractedSymbol, Parameter, SymbolKind};

pub struct PythonAdapter;

impl PythonAdapter {
    pub fn new() -> Self {
        Self
    }
}

impl LanguageAdapter for PythonAdapter {
    fn name(&self) -> &'static str {
        "python"
    }

    fn supported_extensions(&self) -> &'static [&'static str] {
        &["py", "pyw", "pyi"]
    }

    fn parse(
        &self,
        relative_path: &str,
        source: &str,
        limits: &ParserLimits,
    ) -> Result<FileParseResult, ParseError> {
        if source.len() > limits.max_file_size_bytes {
            return Ok(FileParseResult {
                relative_path: relative_path.to_string(),
                language: "python".to_string(),
                status: ParseStatus::SkippedTooLarge,
                symbols: Vec::new(),
                imports: Vec::new(),
                exports: Vec::new(),
                errors: vec![format!(
                    "File size {} bytes exceeds limit of {} bytes",
                    source.len(),
                    limits.max_file_size_bytes
                )],
            });
        }

        let mut parser = Parser::new();
        let lang = tree_sitter_python::language();

        if let Err(e) = parser.set_language(&lang) {
            return Err(ParseError::Internal(format!("Failed to set Python language: {}", e)));
        }

        if limits.timeout_ms > 0 {
            parser.set_timeout_micros(limits.timeout_ms * 1000);
        }

        let tree = match parser.parse(source, None) {
            Some(t) => t,
            None => {
                return Ok(FileParseResult {
                    relative_path: relative_path.to_string(),
                    language: "python".to_string(),
                    status: ParseStatus::Timeout,
                    symbols: Vec::new(),
                    imports: Vec::new(),
                    exports: Vec::new(),
                    errors: vec![format!("Parser timed out after {} ms", limits.timeout_ms)],
                });
            }
        };

        let root_node = tree.root_node();
        let mut symbols = Vec::new();
        let mut imports = Vec::new();
        let mut exports = Vec::new();
        let mut errors = Vec::new();

        let has_syntax_errors = root_node.has_error();
        if has_syntax_errors {
            errors.push("Source contains syntax errors; parsed partially".to_string());
        }

        let source_bytes = source.as_bytes();
        let all_exports = find_all_export_names(root_node, source_bytes);
        extract_from_node(root_node, source_bytes, relative_path, None, false, all_exports.as_ref(), &mut symbols, &mut imports, &mut exports);

        let status = if has_syntax_errors {
            ParseStatus::Partial
        } else {
            ParseStatus::Full
        };

        Ok(FileParseResult {
            relative_path: relative_path.to_string(),
            language: "python".to_string(),
            status,
            symbols,
            imports,
            exports,
            errors,
        })
    }
}

fn find_all_export_names(node: Node, source: &[u8]) -> Option<std::collections::HashSet<String>> {
    let mut cursor = node.walk();
    let mut set = std::collections::HashSet::new();
    let mut found = false;

    for child in node.children(&mut cursor) {
        if child.kind() == "expression_statement" {
            let mut inner = child.walk();
            for sub in child.children(&mut inner) {
                if sub.kind() == "assignment" || sub.kind() == "augmented_assignment" {
                    if let Some(left) = sub.child_by_field_name("left") {
                        if node_text(left, source) == "__all__" {
                            if let Some(right) = sub.child_by_field_name("right") {
                                found = true;
                                collect_strings_from_node(right, source, &mut set);
                            }
                        }
                    }
                }
            }
        }
    }

    if found {
        Some(set)
    } else {
        None
    }
}

fn collect_strings_from_node(node: Node, source: &[u8], set: &mut std::collections::HashSet<String>) {
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.kind() == "string" {
            let text = node_text(child, source);
            let unquoted = text.trim_matches(|c| c == '\'' || c == '"');
            if !unquoted.is_empty() {
                set.insert(unquoted.to_string());
            }
        } else {
            collect_strings_from_node(child, source, set);
        }
    }
}

fn extract_from_node(
    node: Node,
    source: &[u8],
    relative_path: &str,
    parent_scope: Option<&str>,
    is_inside_class: bool,
    all_exports: Option<&std::collections::HashSet<String>>,
    symbols: &mut Vec<ExtractedSymbol>,
    imports: &mut Vec<ExtractedImport>,
    exports: &mut Vec<ExtractedExport>,
) {
    let mut cursor = node.walk();

    for child in node.children(&mut cursor) {
        match child.kind() {
            "import_statement" => {
                extract_import_statement(child, source, imports);
            }
            "import_from_statement" => {
                extract_import_from_statement(child, source, imports);
            }
            "decorated_definition" => {
                extract_decorated_definition(child, source, relative_path, parent_scope, is_inside_class, all_exports, symbols, imports, exports);
            }
            "function_definition" => {
                if let Some(sym) = extract_function(child, source, relative_path, parent_scope, is_inside_class, None, None, all_exports) {
                    let func_qname = sym.qualified_name.clone();
                    if sym.is_exported && sym.parent_name.is_none() {
                        exports.push(ExtractedExport {
                            exported_name: sym.name.clone(),
                            local_name: sym.name.clone(),
                            is_default: false,
                            line_number: sym.start_line,
                        });
                    }
                    symbols.push(sym);

                    if let Some(body) = child.child_by_field_name("body") {
                        extract_from_node(body, source, relative_path, Some(&func_qname), false, all_exports, symbols, imports, exports);
                    }
                }
            }
            "class_definition" => {
                if let Some(class_sym) = extract_class(child, source, relative_path, None, None, all_exports) {
                    let class_name = class_sym.name.clone();
                    if class_sym.is_exported {
                        exports.push(ExtractedExport {
                            exported_name: class_sym.name.clone(),
                            local_name: class_sym.name.clone(),
                            is_default: false,
                            line_number: class_sym.start_line,
                        });
                    }
                    symbols.push(class_sym);

                    if let Some(body) = child.child_by_field_name("body") {
                        extract_from_node(body, source, relative_path, Some(&class_name), true, all_exports, symbols, imports, exports);
                    }
                }
            }
            "expression_statement" => {
                if parent_scope.is_none() {
                    extract_module_variable(child, source, relative_path, all_exports, symbols, exports);
                }
            }
            _ => {
                if child.kind() == "module" || child.kind() == "block" {
                    extract_from_node(child, source, relative_path, parent_scope, is_inside_class, all_exports, symbols, imports, exports);
                }
            }
        }
    }
}

fn extract_decorated_definition(
    node: Node,
    source: &[u8],
    relative_path: &str,
    parent_scope: Option<&str>,
    is_inside_class: bool,
    all_exports: Option<&std::collections::HashSet<String>>,
    symbols: &mut Vec<ExtractedSymbol>,
    imports: &mut Vec<ExtractedImport>,
    exports: &mut Vec<ExtractedExport>,
) {
    let mut decorators = Vec::new();
    let mut definition_node = None;
    let mut cursor = node.walk();

    for child in node.children(&mut cursor) {
        if child.kind() == "decorator" {
            decorators.push(node_text(child, source));
        } else if child.kind() == "function_definition" || child.kind() == "class_definition" {
            definition_node = Some(child);
        }
    }

    if definition_node.is_none() {
        definition_node = node.child_by_field_name("definition");
    }

    let def = match definition_node {
        Some(d) => d,
        None => return,
    };

    let decorator_prefix = if decorators.is_empty() {
        None
    } else {
        Some(decorators.join("\n"))
    };

    // Full declaration range starts at the first decorator and ends at the definition end
    let full_range = Some((node.start_position(), node.end_position()));

    if def.kind() == "function_definition" {
        if let Some(sym) = extract_function(def, source, relative_path, parent_scope, is_inside_class, decorator_prefix.as_deref(), full_range, all_exports) {
            let func_qname = sym.qualified_name.clone();
            if sym.is_exported && sym.parent_name.is_none() {
                exports.push(ExtractedExport {
                    exported_name: sym.name.clone(),
                    local_name: sym.name.clone(),
                    is_default: false,
                    line_number: sym.start_line,
                });
            }
            symbols.push(sym);

            if let Some(body) = def.child_by_field_name("body") {
                extract_from_node(body, source, relative_path, Some(&func_qname), false, all_exports, symbols, imports, exports);
            }
        }
    } else if def.kind() == "class_definition" {
        if let Some(class_sym) = extract_class(def, source, relative_path, decorator_prefix.as_deref(), full_range, all_exports) {
            let class_name = class_sym.name.clone();
            if class_sym.is_exported {
                exports.push(ExtractedExport {
                    exported_name: class_sym.name.clone(),
                    local_name: class_sym.name.clone(),
                    is_default: false,
                    line_number: class_sym.start_line,
                });
            }
            symbols.push(class_sym);

            if let Some(body) = def.child_by_field_name("body") {
                extract_from_node(body, source, relative_path, Some(&class_name), true, all_exports, symbols, imports, exports);
            }
        }
    }
}

fn extract_function(
    node: Node,
    source: &[u8],
    relative_path: &str,
    parent_scope: Option<&str>,
    is_inside_class: bool,
    decorator_prefix: Option<&str>,
    full_range: Option<(tree_sitter::Point, tree_sitter::Point)>,
    all_exports: Option<&std::collections::HashSet<String>>,
) -> Option<ExtractedSymbol> {
    let name_node = node.child_by_field_name("name")?;
    let name = node_text(name_node, source);
    let qualified_name = match parent_scope {
        Some(scope) => format!("{}.{}", scope, name),
        None => name.clone(),
    };

    let is_async = node.children(&mut node.walk()).any(|c| c.kind() == "async");
    let kind = if is_inside_class {
        SymbolKind::Method
    } else {
        SymbolKind::Function
    };

    let parameters = extract_parameters(node.child_by_field_name("parameters"), source);
    let return_type = node.child_by_field_name("return_type").map(|n| {
        let t = node_text(n, source);
        t.trim_start_matches("->").trim().to_string()
    });

    let docstring = extract_docstring(node.child_by_field_name("body"), source);

    let raw_sig = format!(
        "{}{}({}){}",
        if is_async { "async def " } else { "def " },
        name,
        format_param_list(&parameters),
        return_type.as_ref().map(|r| format!(" -> {}", r)).unwrap_or_default()
    );

    let signature = match decorator_prefix {
        Some(d) => format!("{}\n{}", d, raw_sig),
        None => raw_sig,
    };

    let (start_pos, end_pos) = full_range.unwrap_or_else(|| (node.start_position(), node.end_position()));
    let stable_id = ExtractedSymbol::compute_stable_id(relative_path, &qualified_name, kind);

    let visibility = if name.starts_with("__") && name.ends_with("__") {
        Some("special".to_string())
    } else if name.starts_with('_') {
        Some("private".to_string())
    } else {
        Some("public".to_string())
    };

    let is_exported = if parent_scope.is_some() {
        false
    } else if let Some(set) = all_exports {
        set.contains(&name)
    } else {
        !name.starts_with('_')
    };

    Some(ExtractedSymbol {
        stable_id,
        name,
        qualified_name,
        kind,
        parent_name: parent_scope.map(|s| s.to_string()),
        start_line: start_pos.row + 1,
        end_line: end_pos.row + 1,
        start_column: start_pos.column,
        end_column: end_pos.column,
        parameters,
        return_type,
        is_exported,
        is_async,
        visibility,
        docstring,
        signature,
    })
}

fn extract_class(
    node: Node,
    source: &[u8],
    relative_path: &str,
    decorator_prefix: Option<&str>,
    full_range: Option<(tree_sitter::Point, tree_sitter::Point)>,
    all_exports: Option<&std::collections::HashSet<String>>,
) -> Option<ExtractedSymbol> {
    let name_node = node.child_by_field_name("name")?;
    let name = node_text(name_node, source);
    let qualified_name = name.clone();

    let docstring = extract_docstring(node.child_by_field_name("body"), source);

    let superclasses = node.child_by_field_name("superclasses").map(|n| node_text(n, source));
    let raw_sig = match superclasses {
        Some(s) => format!("class {}{}", name, s),
        None => format!("class {}", name),
    };

    let signature = match decorator_prefix {
        Some(d) => format!("{}\n{}", d, raw_sig),
        None => raw_sig,
    };

    let (start_pos, end_pos) = full_range.unwrap_or_else(|| (node.start_position(), node.end_position()));
    let stable_id = ExtractedSymbol::compute_stable_id(relative_path, &qualified_name, SymbolKind::Class);

    let is_exported = if let Some(set) = all_exports {
        set.contains(&name)
    } else {
        !name.starts_with('_')
    };

    Some(ExtractedSymbol {
        stable_id,
        name: name.clone(),
        qualified_name,
        kind: SymbolKind::Class,
        parent_name: None,
        start_line: start_pos.row + 1,
        end_line: end_pos.row + 1,
        start_column: start_pos.column,
        end_column: end_pos.column,
        parameters: Vec::new(),
        return_type: None,
        is_exported,
        is_async: false,
        visibility: Some("public".to_string()),
        docstring,
        signature,
    })
}

fn extract_module_variable(
    node: Node,
    source: &[u8],
    relative_path: &str,
    all_exports: Option<&std::collections::HashSet<String>>,
    symbols: &mut Vec<ExtractedSymbol>,
    exports: &mut Vec<ExtractedExport>,
) {
    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.kind() == "assignment" {
            if let Some(left) = child.child_by_field_name("left") {
                if left.kind() == "identifier" {
                    let name = node_text(left, source);
                    let is_upper = name.chars().all(|c| c.is_uppercase() || c == '_');
                    let kind = if is_upper { SymbolKind::Constant } else { SymbolKind::Variable };

                    let start_pos = child.start_position();
                    let end_pos = child.end_position();
                    let stable_id = ExtractedSymbol::compute_stable_id(relative_path, &name, kind);

                    let is_exported = if let Some(set) = all_exports {
                        set.contains(&name)
                    } else {
                        !name.starts_with('_')
                    };
                    if is_exported {
                        exports.push(ExtractedExport {
                            exported_name: name.clone(),
                            local_name: name.clone(),
                            is_default: false,
                            line_number: start_pos.row + 1,
                        });
                    }

                    symbols.push(ExtractedSymbol {
                        stable_id,
                        name: name.clone(),
                        qualified_name: name.clone(),
                        kind,
                        parent_name: None,
                        start_line: start_pos.row + 1,
                        end_line: end_pos.row + 1,
                        start_column: start_pos.column,
                        end_column: end_pos.column,
                        parameters: Vec::new(),
                        return_type: None,
                        is_exported,
                        is_async: false,
                        visibility: None,
                        docstring: None,
                        signature: format!("{} = ...", name),
                    });
                }
            }
        }
    }
}

fn extract_import_statement(node: Node, source: &[u8], imports: &mut Vec<ExtractedImport>) {
    let line_number = node.start_position().row + 1;
    let mut cursor = node.walk();

    for child in node.children(&mut cursor) {
        if child.kind() == "dotted_name" {
            imports.push(ExtractedImport {
                source_module: node_text(child, source),
                imported_name: "".to_string(),
                alias: None,
                is_type_only: false,
                line_number,
            });
        } else if child.kind() == "aliased_import" {
            let name_n = child.child_by_field_name("name");
            let alias_n = child.child_by_field_name("alias");

            if let Some(n) = name_n {
                imports.push(ExtractedImport {
                    source_module: node_text(n, source),
                    imported_name: "".to_string(),
                    alias: alias_n.map(|a| node_text(a, source)),
                    is_type_only: false,
                    line_number,
                });
            }
        }
    }
}

fn extract_import_from_statement(node: Node, source: &[u8], imports: &mut Vec<ExtractedImport>) {
    let line_number = node.start_position().row + 1;
    let module_node = node.child_by_field_name("module_name");
    let source_module = match module_node {
        Some(m) => node_text(m, source),
        None => return,
    };

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        if child.kind() == "dotted_name" {
            if Some(child) != module_node {
                imports.push(ExtractedImport {
                    source_module: source_module.clone(),
                    imported_name: node_text(child, source),
                    alias: None,
                    is_type_only: false,
                    line_number,
                });
            }
        } else if child.kind() == "aliased_import" {
            let name_n = child.child_by_field_name("name");
            let alias_n = child.child_by_field_name("alias");

            if let Some(n) = name_n {
                imports.push(ExtractedImport {
                    source_module: source_module.clone(),
                    imported_name: node_text(n, source),
                    alias: alias_n.map(|a| node_text(a, source)),
                    is_type_only: false,
                    line_number,
                });
            }
        } else if child.kind() == "wildcard_import" {
            imports.push(ExtractedImport {
                source_module: source_module.clone(),
                imported_name: "*".to_string(),
                alias: None,
                is_type_only: false,
                line_number,
            });
        }
    }
}

fn extract_parameters(params_node: Option<Node>, source: &[u8]) -> Vec<Parameter> {
    let mut parameters = Vec::new();
    let node = match params_node {
        Some(n) => n,
        None => return parameters,
    };

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        match child.kind() {
            "identifier" => {
                parameters.push(Parameter {
                    name: node_text(child, source),
                    type_annotation: None,
                    default_value: None,
                });
            }
            "typed_default_parameter" => {
                let name = child
                    .child_by_field_name("name")
                    .or_else(|| child.child(0))
                    .map(|n| node_text(n, source))
                    .unwrap_or_default();
                let type_annotation = child.child_by_field_name("type").map(|n| node_text(n, source));
                let default_value = child.child_by_field_name("value").map(|n| node_text(n, source));
                parameters.push(Parameter {
                    name,
                    type_annotation,
                    default_value,
                });
            }
            "default_parameter" => {
                let name = child
                    .child_by_field_name("name")
                    .or_else(|| child.child(0))
                    .map(|n| node_text(n, source))
                    .unwrap_or_default();
                let default_value = child.child_by_field_name("value").map(|n| node_text(n, source));
                parameters.push(Parameter {
                    name,
                    type_annotation: None,
                    default_value,
                });
            }
            "typed_parameter" => {
                let name = child
                    .child_by_field_name("name")
                    .or_else(|| child.child(0))
                    .map(|n| node_text(n, source))
                    .unwrap_or_default();
                let type_annotation = child.child_by_field_name("type").map(|n| node_text(n, source));
                parameters.push(Parameter {
                    name,
                    type_annotation,
                    default_value: None,
                });
            }
            _ => {}
        }
    }

    parameters
}

fn extract_docstring(body_node: Option<Node>, source: &[u8]) -> Option<String> {
    let body = body_node?;
    let mut cursor = body.walk();
    for child in body.children(&mut cursor) {
        if child.kind() == "expression_statement" {
            if let Some(first) = child.child(0) {
                if first.kind() == "string" {
                    let raw = node_text(first, source);
                    let trimmed = raw.trim_matches('"').trim_matches('\'').trim().to_string();
                    return Some(trimmed);
                }
            }
        }
        break;
    }
    None
}

fn format_param_list(parameters: &[Parameter]) -> String {
    parameters
        .iter()
        .map(|p| {
            let mut s = p.name.clone();
            if let Some(t) = &p.type_annotation {
                s.push_str(&format!(": {}", t));
            }
            if let Some(d) = &p.default_value {
                s.push_str(&format!(" = {}", d));
            }
            s
        })
        .collect::<Vec<_>>()
        .join(", ")
}

fn node_text(node: Node, source: &[u8]) -> String {
    node.utf8_text(source).unwrap_or("").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_python_comprehensive_extraction() {
        let code = r#"
from .utils import format_row
from ..core.base import BaseConnection

@retry(max_attempts=3, backoff=1.5)
def execute_query(sql: str) -> bool:
    """Executes a query with retry logic."""
    return True

class DatabaseConnection(BaseConnection):
    """Manages raw connection to database."""

    def __init__(self, dsn: str):
        self.dsn = dsn

    @property
    def is_connected(self) -> bool:
        return True

    @staticmethod
    def create_default():
        pass

async def fetch_records(query: str, limit: int = 100) -> List[dict]:
    """Fetches records asynchronously."""
    def sanitize(param: str) -> str:
        return param.strip()
    return []
"#;
        let adapter = PythonAdapter::new();
        let result = adapter.parse("src/db.py", code, &ParserLimits::default()).unwrap();

        assert_eq!(result.status, ParseStatus::Full);
        assert_eq!(result.imports.len(), 2);
        assert_eq!(result.imports[0].source_module, ".utils");
        assert_eq!(result.imports[1].source_module, "..core.base");

        // Decorated function with arguments
        let exec_sym = result.symbols.iter().find(|s| s.name == "execute_query").unwrap();
        assert_eq!(exec_sym.kind, SymbolKind::Function);
        assert!(exec_sym.signature.contains("@retry(max_attempts=3, backoff=1.5)"));
        assert_eq!(exec_sym.start_column, 0); // Spans full decorator

        let class_sym = result.symbols.iter().find(|s| s.name == "DatabaseConnection").unwrap();
        assert_eq!(class_sym.kind, SymbolKind::Class);
        assert_eq!(class_sym.signature, "class DatabaseConnection(BaseConnection)");

        let prop_method = result.symbols.iter().find(|s| s.name == "is_connected").unwrap();
        assert!(prop_method.signature.contains("@property"));
        assert_eq!(prop_method.start_column, 4); // Spans '@property'

        let fetch_sym = result.symbols.iter().find(|s| s.name == "fetch_records").unwrap();
        assert_eq!(fetch_sym.parameters[1].default_value.as_deref(), Some("100"));
        assert_eq!(fetch_sym.signature, "async def fetch_records(query: str, limit: int = 100) -> List[dict]");

        // Exports
        assert!(result.exports.iter().any(|e| e.exported_name == "execute_query"));
        assert!(result.exports.iter().any(|e| e.exported_name == "DatabaseConnection"));
        assert!(result.exports.iter().any(|e| e.exported_name == "fetch_records"));
    }
}
