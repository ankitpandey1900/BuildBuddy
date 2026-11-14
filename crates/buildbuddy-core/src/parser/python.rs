use tree_sitter::{Node, Parser};

use crate::parser::traits::{FileParseResult, LanguageAdapter, ParseError, ParseStatus, ParserLimits};
use crate::symbols::model::{ExtractedImport, ExtractedSymbol, Parameter, SymbolKind};

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
                    errors: vec![format!("Parser timed out after {} ms", limits.timeout_ms)],
                });
            }
        };

        let root_node = tree.root_node();
        let mut symbols = Vec::new();
        let mut imports = Vec::new();
        let mut errors = Vec::new();

        let has_syntax_errors = root_node.has_error();
        if has_syntax_errors {
            errors.push("Source contains syntax errors; parsed partially".to_string());
        }

        let source_bytes = source.as_bytes();
        extract_from_node(root_node, source_bytes, relative_path, None, &mut symbols, &mut imports);

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
            errors,
        })
    }
}

fn extract_from_node(
    node: Node,
    source: &[u8],
    relative_path: &str,
    parent_class: Option<&str>,
    symbols: &mut Vec<ExtractedSymbol>,
    imports: &mut Vec<ExtractedImport>,
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
            "function_definition" => {
                if let Some(sym) = extract_function(child, source, relative_path, parent_class) {
                    symbols.push(sym);
                }
            }
            "class_definition" => {
                if let Some(class_sym) = extract_class(child, source, relative_path) {
                    let class_name = class_sym.name.clone();
                    symbols.push(class_sym);

                    if let Some(body) = child.child_by_field_name("body") {
                        extract_from_node(body, source, relative_path, Some(&class_name), symbols, imports);
                    }
                }
            }
            "expression_statement" => {
                if parent_class.is_none() {
                    extract_module_variable(child, source, relative_path, symbols);
                }
            }
            _ => {
                if child.kind() == "module" || child.kind() == "block" {
                    extract_from_node(child, source, relative_path, parent_class, symbols, imports);
                }
            }
        }
    }
}

fn extract_function(
    node: Node,
    source: &[u8],
    relative_path: &str,
    parent_class: Option<&str>,
) -> Option<ExtractedSymbol> {
    let name_node = node.child_by_field_name("name")?;
    let name = node_text(name_node, source);
    let qualified_name = match parent_class {
        Some(cls) => format!("{}.{}", cls, name),
        None => name.clone(),
    };

    let is_async = node.children(&mut node.walk()).any(|c| c.kind() == "async");
    let kind = if parent_class.is_some() {
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

    let signature = format!(
        "{}{}({}){}",
        if is_async { "async def " } else { "def " },
        name,
        format_param_list(&parameters),
        return_type.as_ref().map(|r| format!(" -> {}", r)).unwrap_or_default()
    );

    let start_pos = node.start_position();
    let end_pos = node.end_position();
    let stable_id = ExtractedSymbol::compute_stable_id(relative_path, &qualified_name, kind);

    // Private if starts with underscore (but not dunder)
    let visibility = if name.starts_with("__") && name.ends_with("__") {
        Some("special".to_string())
    } else if name.starts_with('_') {
        Some("private".to_string())
    } else {
        Some("public".to_string())
    };

    let is_exported = !name.starts_with('_');

    Some(ExtractedSymbol {
        stable_id,
        name,
        qualified_name,
        kind,
        parent_name: parent_class.map(|s| s.to_string()),
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
) -> Option<ExtractedSymbol> {
    let name_node = node.child_by_field_name("name")?;
    let name = node_text(name_node, source);
    let qualified_name = name.clone();

    let docstring = extract_docstring(node.child_by_field_name("body"), source);

    let superclasses = node.child_by_field_name("superclasses").map(|n| node_text(n, source));
    let signature = match superclasses {
        Some(s) => format!("class {}{}", name, s),
        None => format!("class {}", name),
    };

    let start_pos = node.start_position();
    let end_pos = node.end_position();
    let stable_id = ExtractedSymbol::compute_stable_id(relative_path, &qualified_name, SymbolKind::Class);

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
        is_exported: !name.starts_with('_'),
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
    symbols: &mut Vec<ExtractedSymbol>,
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
                        is_exported: !name.starts_with('_'),
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
            // Check if it's the module name or an imported name
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
            "typed_parameter" | "typed_default_parameter" => {
                let name = child.child(0).map(|n| node_text(n, source)).unwrap_or_default();
                let type_annotation = child.child_by_field_name("type").map(|n| node_text(n, source));
                parameters.push(Parameter {
                    name,
                    type_annotation,
                    default_value: None,
                });
            }
            "default_parameter" => {
                let name = child.child_by_field_name("name").map(|n| node_text(n, source)).unwrap_or_default();
                let default_value = child.child_by_field_name("value").map(|n| node_text(n, source));
                parameters.push(Parameter {
                    name,
                    type_annotation: None,
                    default_value,
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
        .map(|p| match &p.type_annotation {
            Some(t) => format!("{}: {}", p.name, t),
            None => p.name.clone(),
        })
        .collect::<Vec<_>>()
        .join(", ")
}

fn node_text(node: Node, source: &[u8]) -> String {
    node.utf8_text(source).unwrap_or("").to_string()
}
