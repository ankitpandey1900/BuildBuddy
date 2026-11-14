use tree_sitter::{Node, Parser};

use crate::parser::traits::{FileParseResult, LanguageAdapter, ParseError, ParseStatus, ParserLimits};
use crate::symbols::model::{ExtractedExport, ExtractedImport, ExtractedSymbol, Parameter, SymbolKind};

pub struct TypeScriptAdapter;

impl TypeScriptAdapter {
    pub fn new() -> Self {
        Self
    }

    fn is_tsx(path: &str) -> bool {
        let lower = path.to_lowercase();
        lower.ends_with(".tsx") || lower.ends_with(".jsx")
    }
}

impl LanguageAdapter for TypeScriptAdapter {
    fn name(&self) -> &'static str {
        "typescript"
    }

    fn supported_extensions(&self) -> &'static [&'static str] {
        &["ts", "tsx", "js", "jsx", "mjs", "cjs"]
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
                language: "typescript".to_string(),
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
        let lang = if Self::is_tsx(relative_path) {
            tree_sitter_typescript::language_tsx()
        } else {
            tree_sitter_typescript::language_typescript()
        };

        if let Err(e) = parser.set_language(&lang) {
            return Err(ParseError::Internal(format!("Failed to set language: {}", e)));
        }

        if limits.timeout_ms > 0 {
            parser.set_timeout_micros(limits.timeout_ms * 1000);
        }

        let tree = match parser.parse(source, None) {
            Some(t) => t,
            None => {
                return Ok(FileParseResult {
                    relative_path: relative_path.to_string(),
                    language: "typescript".to_string(),
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
        extract_from_node(root_node, source_bytes, relative_path, None, false, None, &mut symbols, &mut imports, &mut exports);
        mark_exported_symbols(root_node, source_bytes, &mut symbols);

        let status = if has_syntax_errors {
            ParseStatus::Partial
        } else {
            ParseStatus::Full
        };

        Ok(FileParseResult {
            relative_path: relative_path.to_string(),
            language: "typescript".to_string(),
            status,
            symbols,
            imports,
            exports,
            errors,
        })
    }
}

fn extract_from_node(
    node: Node,
    source: &[u8],
    relative_path: &str,
    parent_name: Option<&str>,
    is_parent_exported: bool,
    enclosing_range: Option<(tree_sitter::Point, tree_sitter::Point)>,
    symbols: &mut Vec<ExtractedSymbol>,
    imports: &mut Vec<ExtractedImport>,
    exports: &mut Vec<ExtractedExport>,
) {
    let mut cursor = node.walk();

    for child in node.children(&mut cursor) {
        match child.kind() {
            "export_statement" => {
                if child.child_by_field_name("source").is_some() {
                    extract_import(child, source, imports);
                }

                let line_number = child.start_position().row + 1;
                let is_default = child.children(&mut child.walk()).any(|c| c.kind() == "default");

                // Check for export clause: export { a, b as c }
                let mut c_cursor = child.walk();
                for c in child.children(&mut c_cursor) {
                    if c.kind() == "export_clause" {
                        let mut spec_cursor = c.walk();
                        for spec in c.children(&mut spec_cursor) {
                            if spec.kind() == "export_specifier" {
                                if let Some(n) = spec.child_by_field_name("name") {
                                    let local_name = node_text(n, source);
                                    let exported_name = spec
                                        .child_by_field_name("alias")
                                        .map(|a| node_text(a, source))
                                        .unwrap_or_else(|| local_name.clone());

                                    exports.push(ExtractedExport {
                                        exported_name,
                                        local_name,
                                        is_default: false,
                                        line_number,
                                    });
                                }
                            }
                        }
                    }
                }

                // Check for default export identifier: export default UserService;
                if let Some(val) = child.child_by_field_name("value") {
                    if val.kind() == "identifier" {
                        let local_name = node_text(val, source);
                        exports.push(ExtractedExport {
                            exported_name: "default".to_string(),
                            local_name,
                            is_default: true,
                            line_number,
                        });
                    }
                }

                // Check for declaration exports: export class/function/const/interface/type
                if let Some(decl) = child.child_by_field_name("declaration") {
                    let decl_name = decl.child_by_field_name("name").map(|n| node_text(n, source));
                    if let Some(name) = decl_name {
                        exports.push(ExtractedExport {
                            exported_name: if is_default { "default".to_string() } else { name.clone() },
                            local_name: name,
                            is_default,
                            line_number,
                        });
                    } else if decl.kind() == "lexical_declaration" || decl.kind() == "variable_declaration" {
                        let mut d_cursor = decl.walk();
                        for var_child in decl.children(&mut d_cursor) {
                            if var_child.kind() == "variable_declarator" {
                                if let Some(name_n) = var_child.child_by_field_name("name") {
                                    let name = node_text(name_n, source);
                                    exports.push(ExtractedExport {
                                        exported_name: name.clone(),
                                        local_name: name,
                                        is_default: false,
                                        line_number,
                                    });
                                }
                            }
                        }
                    }
                }

                let range = Some((child.start_position(), child.end_position()));
                extract_from_node(child, source, relative_path, parent_name, true, range, symbols, imports, exports);
            }
            "import_statement" => {
                extract_import(child, source, imports);
            }
            "function_declaration" => {
                extract_function(child, source, relative_path, parent_name, is_parent_exported, enclosing_range, symbols, imports, exports);
            }
            "class_declaration" => {
                if let Some(class_sym) = extract_class(child, source, relative_path, is_parent_exported, enclosing_range) {
                    let class_name = class_sym.name.clone();
                    symbols.push(class_sym);

                    if let Some(body) = child.child_by_field_name("body") {
                        extract_class_members(body, source, relative_path, &class_name, symbols);
                    }
                }
            }
            "interface_declaration" => {
                if let Some(sym) = extract_interface(child, source, relative_path, is_parent_exported, enclosing_range) {
                    symbols.push(sym);
                }
            }
            "type_alias_declaration" => {
                if let Some(sym) = extract_type_alias(child, source, relative_path, is_parent_exported, enclosing_range) {
                    symbols.push(sym);
                }
            }
            "lexical_declaration" | "variable_declaration" => {
                extract_variable_declarations(child, source, relative_path, parent_name, is_parent_exported, enclosing_range, symbols, imports, exports);
            }
            _ => {
                if child.kind() == "program" || child.kind() == "statement_block" {
                    extract_from_node(child, source, relative_path, parent_name, is_parent_exported, None, symbols, imports, exports);
                }
            }
        }
    }
}

fn extract_function(
    node: Node,
    source: &[u8],
    relative_path: &str,
    parent_name: Option<&str>,
    is_exported: bool,
    enclosing_range: Option<(tree_sitter::Point, tree_sitter::Point)>,
    symbols: &mut Vec<ExtractedSymbol>,
    imports: &mut Vec<ExtractedImport>,
    exports: &mut Vec<ExtractedExport>,
) {
    let name_node = match node.child_by_field_name("name") {
        Some(n) => n,
        None => return,
    };
    let name = node_text(name_node, source);
    let qualified_name = match parent_name {
        Some(p) => format!("{}.{}", p, name),
        None => name.clone(),
    };

    let is_async = node.children(&mut node.walk()).any(|c| c.kind() == "async");
    let parameters = extract_parameters(node.child_by_field_name("parameters"), source);
    let return_type = node.child_by_field_name("return_type").map(|n| {
        let t = node_text(n, source);
        t.trim_start_matches(':').trim().to_string()
    });

    let signature = format!(
        "{}{}({}): {}",
        if is_async { "async " } else { "" },
        name,
        format_param_list(&parameters),
        return_type.as_deref().unwrap_or("void")
    );

    let (start_pos, end_pos) = enclosing_range.unwrap_or_else(|| (node.start_position(), node.end_position()));
    let stable_id = ExtractedSymbol::compute_stable_id(relative_path, &qualified_name, SymbolKind::Function);

    symbols.push(ExtractedSymbol {
        stable_id,
        name,
        qualified_name: qualified_name.clone(),
        kind: SymbolKind::Function,
        parent_name: parent_name.map(|s| s.to_string()),
        start_line: start_pos.row + 1,
        end_line: end_pos.row + 1,
        start_column: start_pos.column,
        end_column: end_pos.column,
        parameters,
        return_type,
        is_exported,
        is_async,
        visibility: None,
        docstring: None,
        signature,
    });

    // Recurse into function body to extract nested functions
    if let Some(body) = node.child_by_field_name("body") {
        extract_from_node(body, source, relative_path, Some(&qualified_name), false, None, symbols, imports, exports);
    }
}

fn extract_class(
    node: Node,
    source: &[u8],
    relative_path: &str,
    is_exported: bool,
    enclosing_range: Option<(tree_sitter::Point, tree_sitter::Point)>,
) -> Option<ExtractedSymbol> {
    let name_node = node.child_by_field_name("name")?;
    let name = node_text(name_node, source);
    let qualified_name = name.clone();

    let heritage = node
        .children(&mut node.walk())
        .find(|c| c.kind() == "class_heritage")
        .map(|n| node_text(n, source));

    let signature = match heritage {
        Some(h) => format!("class {} {}", name, h),
        None => format!("class {}", name),
    };

    let (start_pos, end_pos) = enclosing_range.unwrap_or_else(|| (node.start_position(), node.end_position()));
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
        is_exported,
        is_async: false,
        visibility: None,
        docstring: None,
        signature,
    })
}

fn extract_class_members(
    body_node: Node,
    source: &[u8],
    relative_path: &str,
    class_name: &str,
    symbols: &mut Vec<ExtractedSymbol>,
) {
    let mut cursor = body_node.walk();
    for child in body_node.children(&mut cursor) {
        if child.kind() == "method_definition" {
            if let Some(name_node) = child.child_by_field_name("name") {
                let name = node_text(name_node, source);
                let qualified_name = format!("{}.{}", class_name, name);

                let is_async = child.children(&mut child.walk()).any(|c| c.kind() == "async");
                let is_static = child.children(&mut child.walk()).any(|c| c.kind() == "static");

                let visibility = child
                    .children(&mut child.walk())
                    .find(|c| c.kind() == "accessibility_modifier")
                    .map(|n| node_text(n, source));

                let parameters = extract_parameters(child.child_by_field_name("parameters"), source);
                let return_type = child.child_by_field_name("return_type").map(|n| {
                    let t = node_text(n, source);
                    t.trim_start_matches(':').trim().to_string()
                });

                // Rule: constructor signature must not contain ': void' when no return type is declared
                let signature = if name == "constructor" {
                    match &return_type {
                        Some(rt) => format!("constructor({}): {}", format_param_list(&parameters), rt),
                        None => format!("constructor({})", format_param_list(&parameters)),
                    }
                } else {
                    format!(
                        "{}{}{}({}): {}",
                        if is_static { "static " } else { "" },
                        if is_async { "async " } else { "" },
                        name,
                        format_param_list(&parameters),
                        return_type.as_deref().unwrap_or("void")
                    )
                };

                let start_pos = child.start_position();
                let end_pos = child.end_position();
                let stable_id =
                    ExtractedSymbol::compute_stable_id(relative_path, &qualified_name, SymbolKind::Method);

                symbols.push(ExtractedSymbol {
                    stable_id,
                    name,
                    qualified_name,
                    kind: SymbolKind::Method,
                    parent_name: Some(class_name.to_string()),
                    start_line: start_pos.row + 1,
                    end_line: end_pos.row + 1,
                    start_column: start_pos.column,
                    end_column: end_pos.column,
                    parameters,
                    return_type,
                    is_exported: false,
                    is_async,
                    visibility,
                    docstring: None,
                    signature,
                });
            }
        }
    }
}

fn extract_interface(
    node: Node,
    source: &[u8],
    relative_path: &str,
    is_exported: bool,
    enclosing_range: Option<(tree_sitter::Point, tree_sitter::Point)>,
) -> Option<ExtractedSymbol> {
    let name_node = node.child_by_field_name("name")?;
    let name = node_text(name_node, source);
    let qualified_name = name.clone();

    let (start_pos, end_pos) = enclosing_range.unwrap_or_else(|| (node.start_position(), node.end_position()));
    let stable_id = ExtractedSymbol::compute_stable_id(relative_path, &qualified_name, SymbolKind::Interface);

    Some(ExtractedSymbol {
        stable_id,
        name: name.clone(),
        qualified_name,
        kind: SymbolKind::Interface,
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
        signature: format!("interface {}", name),
    })
}

fn extract_type_alias(
    node: Node,
    source: &[u8],
    relative_path: &str,
    is_exported: bool,
    enclosing_range: Option<(tree_sitter::Point, tree_sitter::Point)>,
) -> Option<ExtractedSymbol> {
    let name_node = node.child_by_field_name("name")?;
    let name = node_text(name_node, source);
    let qualified_name = name.clone();

    let (start_pos, end_pos) = enclosing_range.unwrap_or_else(|| (node.start_position(), node.end_position()));
    let stable_id = ExtractedSymbol::compute_stable_id(relative_path, &qualified_name, SymbolKind::TypeAlias);

    Some(ExtractedSymbol {
        stable_id,
        name: name.clone(),
        qualified_name,
        kind: SymbolKind::TypeAlias,
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
        signature: format!("type {}", name),
    })
}

fn extract_variable_declarations(
    node: Node,
    source: &[u8],
    relative_path: &str,
    parent_name: Option<&str>,
    is_exported: bool,
    enclosing_range: Option<(tree_sitter::Point, tree_sitter::Point)>,
    symbols: &mut Vec<ExtractedSymbol>,
    imports: &mut Vec<ExtractedImport>,
    exports: &mut Vec<ExtractedExport>,
) {
    let is_const = node.children(&mut node.walk()).any(|c| c.kind() == "const");
    let (decl_start, decl_end) = enclosing_range.unwrap_or_else(|| (node.start_position(), node.end_position()));
    let mut cursor = node.walk();

    for child in node.children(&mut cursor) {
        if child.kind() == "variable_declarator" {
            if let Some(name_node) = child.child_by_field_name("name") {
                if name_node.kind() == "identifier" {
                    let name = node_text(name_node, source);
                    let qualified_name = match parent_name {
                        Some(p) => format!("{}.{}", p, name),
                        None => name.clone(),
                    };
                    let kind = if is_const { SymbolKind::Constant } else { SymbolKind::Variable };

                    // Check if assigned to an arrow function
                    let value_node = child.child_by_field_name("value");
                    if let Some(val) = value_node {
                        if val.kind() == "arrow_function" || val.kind() == "function" {
                            let is_async = val.children(&mut val.walk()).any(|c| c.kind() == "async");
                            let parameters = extract_parameters(val.child_by_field_name("parameters"), source);
                            let return_type = val.child_by_field_name("return_type").map(|n| {
                                let t = node_text(n, source);
                                t.trim_start_matches(':').trim().to_string()
                            });

                            let stable_id = ExtractedSymbol::compute_stable_id(relative_path, &qualified_name, SymbolKind::Function);

                            symbols.push(ExtractedSymbol {
                                stable_id,
                                name: name.clone(),
                                qualified_name: qualified_name.clone(),
                                kind: SymbolKind::Function,
                                parent_name: parent_name.map(|s| s.to_string()),
                                start_line: decl_start.row + 1,
                                end_line: decl_end.row + 1,
                                start_column: decl_start.column,
                                end_column: decl_end.column,
                                parameters: parameters.clone(),
                                return_type: return_type.clone(),
                                is_exported: is_exported && parent_name.is_none(),
                                is_async,
                                visibility: None,
                                docstring: None,
                                signature: format!(
                                    "const {} = {}({}): {}",
                                    name,
                                    if is_async { "async " } else { "" },
                                    format_param_list(&parameters),
                                    return_type.as_deref().unwrap_or("any")
                                ),
                            });

                            // Recurse into arrow function body for nested declarations
                            if let Some(body) = val.child_by_field_name("body") {
                                if body.kind() == "statement_block" {
                                    extract_from_node(body, source, relative_path, Some(&qualified_name), false, None, symbols, imports, exports);
                                }
                            }
                            continue;
                        }
                    }

                    let stable_id = ExtractedSymbol::compute_stable_id(relative_path, &qualified_name, kind);

                    symbols.push(ExtractedSymbol {
                        stable_id,
                        name: name.clone(),
                        qualified_name,
                        kind,
                        parent_name: parent_name.map(|s| s.to_string()),
                        start_line: decl_start.row + 1,
                        end_line: decl_end.row + 1,
                        start_column: decl_start.column,
                        end_column: decl_end.column,
                        parameters: Vec::new(),
                        return_type: None,
                        is_exported: is_exported && parent_name.is_none(),
                        is_async: false,
                        visibility: None,
                        docstring: None,
                        signature: format!("{} {}", if is_const { "const" } else { "let" }, name),
                    });
                }
            }
        }
    }
}

fn mark_exported_symbols(
    root_node: Node,
    source: &[u8],
    symbols: &mut [ExtractedSymbol],
) {
    let mut cursor = root_node.walk();
    for child in root_node.children(&mut cursor) {
        if child.kind() == "export_statement" {
            let mut c_cursor = child.walk();
            for sub in child.children(&mut c_cursor) {
                if sub.kind() == "export_clause" {
                    let mut spec_cursor = sub.walk();
                    for spec in sub.children(&mut spec_cursor) {
                        if spec.kind() == "export_specifier" {
                            if let Some(n) = spec.child_by_field_name("name") {
                                let name = node_text(n, source);
                                for sym in symbols.iter_mut() {
                                    if sym.name == name && sym.parent_name.is_none() {
                                        sym.is_exported = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if let Some(val) = child.child_by_field_name("value") {
                if val.kind() == "identifier" {
                    let default_name = node_text(val, source);
                    for sym in symbols.iter_mut() {
                        if sym.name == default_name && sym.parent_name.is_none() {
                            sym.is_exported = true;
                        }
                    }
                }
            }
        }
    }
}

fn extract_import(node: Node, source: &[u8], imports: &mut Vec<ExtractedImport>) {
    let source_node = node.child_by_field_name("source");
    let source_module = match source_node {
        Some(s) => {
            let text = node_text(s, source);
            text.trim_matches('\'').trim_matches('"').to_string()
        }
        None => return,
    };

    let line_number = node.start_position().row + 1;
    let is_type_only = node_text(node, source).starts_with("import type");

    let mut found_import = false;
    let mut cursor = node.walk();

    for child in node.children(&mut cursor) {
        if child.kind() == "import_clause" {
            let mut clause_cursor = child.walk();
            for sub in child.children(&mut clause_cursor) {
                if sub.kind() == "identifier" {
                    // default import: import React from 'react'
                    imports.push(ExtractedImport {
                        source_module: source_module.clone(),
                        imported_name: node_text(sub, source),
                        alias: None,
                        is_type_only,
                        line_number,
                    });
                    found_import = true;
                } else if sub.kind() == "named_imports" {
                    let mut named_cursor = sub.walk();
                    for spec in sub.children(&mut named_cursor) {
                        if spec.kind() == "import_specifier" {
                            let name_n = spec.child_by_field_name("name");
                            let alias_n = spec.child_by_field_name("alias");

                            if let Some(n) = name_n {
                                let imported_name = node_text(n, source);
                                let alias = alias_n.map(|a| node_text(a, source));

                                imports.push(ExtractedImport {
                                    source_module: source_module.clone(),
                                    imported_name,
                                    alias,
                                    is_type_only,
                                    line_number,
                                });
                                found_import = true;
                            }
                        }
                    }
                } else if sub.kind() == "namespace_import" {
                    let alias = sub
                        .children(&mut sub.walk())
                        .find(|c| c.kind() == "identifier")
                        .map(|n| node_text(n, source));

                    imports.push(ExtractedImport {
                        source_module: source_module.clone(),
                        imported_name: "*".to_string(),
                        alias,
                        is_type_only,
                        line_number,
                    });
                    found_import = true;
                }
            }
        }
    }

    if !found_import {
        // Side effect import: import './style.css'
        imports.push(ExtractedImport {
            source_module,
            imported_name: "".to_string(),
            alias: None,
            is_type_only,
            line_number,
        });
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
            "required_parameter" | "optional_parameter" => {
                let pattern = child.child_by_field_name("pattern");
                let type_annotation = child.child_by_field_name("type").map(|n| {
                    let t = node_text(n, source);
                    t.trim_start_matches(':').trim().to_string()
                });
                let default_value = child.child_by_field_name("value").map(|n| {
                    node_text(n, source)
                });

                if let Some(p) = pattern {
                    parameters.push(Parameter {
                        name: node_text(p, source),
                        type_annotation,
                        default_value,
                    });
                }
            }
            "identifier" => {
                parameters.push(Parameter {
                    name: node_text(child, source),
                    type_annotation: None,
                    default_value: None,
                });
            }
            _ => {}
        }
    }

    parameters
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
    fn test_ts_comprehensive_extraction() {
        let code = r#"
import { BaseService } from './base';
import type { IService } from './types';

export class UserService extends BaseService implements IService {
    constructor(client: any) {
    }

    public async getUser(id: string): Promise<string> {
        return id;
    }
}

export async function calculateMetrics(data: number[] = []): Promise<number> {
    function sum(a: number, b: number): number {
        return a + b;
    }
    return data.reduce(sum, 0);
}

export const processItem = async (item: string = 'default'): Promise<string> => {
    return item.trim();
};

const API_VERSION = 'v1';
export { API_VERSION };
export default function getStatus(): string {
    return 'ok';
}
"#;
        let adapter = TypeScriptAdapter::new();
        let result = adapter.parse("src/service.ts", code, &ParserLimits::default()).unwrap();

        assert_eq!(result.status, ParseStatus::Full);
        assert_eq!(result.imports.len(), 2);
        assert_eq!(result.imports[0].source_module, "./base");
        assert_eq!(result.imports[1].source_module, "./types");

        let class_sym = result.symbols.iter().find(|s| s.name == "UserService").unwrap();
        assert_eq!(class_sym.kind, SymbolKind::Class);
        assert!(class_sym.signature.contains("extends BaseService implements IService"));
        assert!(class_sym.is_exported);
        assert_eq!(class_sym.start_column, 0); // Full declaration range starting at 'export'

        let ctor_sym = result.symbols.iter().find(|s| s.name == "constructor").unwrap();
        assert_eq!(ctor_sym.signature, "constructor(client: any)"); // No ': void'

        let func_sym = result.symbols.iter().find(|s| s.name == "calculateMetrics").unwrap();
        assert_eq!(func_sym.kind, SymbolKind::Function);
        assert!(func_sym.is_async);
        assert_eq!(func_sym.parameters[0].default_value.as_deref(), Some("[]"));
        assert_eq!(func_sym.signature, "async calculateMetrics(data: number[] = []): Promise<number>");

        let nested_func = result.symbols.iter().find(|s| s.name == "sum").unwrap();
        assert_eq!(nested_func.kind, SymbolKind::Function);
        assert_eq!(nested_func.parent_name.as_deref(), Some("calculateMetrics"));
        assert_eq!(nested_func.qualified_name, "calculateMetrics.sum");
        assert!(!nested_func.is_exported);

        let arrow_sym = result.symbols.iter().find(|s| s.name == "processItem").unwrap();
        assert_eq!(arrow_sym.kind, SymbolKind::Function);
        assert!(arrow_sym.is_exported);
        assert!(arrow_sym.is_async);
        assert_eq!(arrow_sym.parameters[0].default_value.as_deref(), Some("'default'"));

        let status_sym = result.symbols.iter().find(|s| s.name == "getStatus").unwrap();
        assert_eq!(status_sym.kind, SymbolKind::Function);
        assert!(status_sym.is_exported);

        // Check exports
        assert!(result.exports.iter().any(|e| e.exported_name == "default" && e.local_name == "getStatus" && e.is_default));
        assert!(result.exports.iter().any(|e| e.exported_name == "API_VERSION" && !e.is_default));
    }
}
