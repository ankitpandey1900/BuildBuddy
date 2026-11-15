use std::collections::{HashMap, HashSet};
use tree_sitter::Node;

use crate::parser::side_effects::SideEffectDetector;
use crate::symbols::model::{
    CallResolutionStatus, ClassConstructor, ClassInstantiation, ClassMethod, ClassProperty,
    ExtractedCallSite, ExtractedClass, ExtractedExport, ExtractedFunction, ExtractedImport,
    ExtractedSymbol, FunctionMetrics, Parameter, SideEffectMarker, SymbolKind,
};

fn node_text(node: Node, source: &[u8]) -> String {
    node.utf8_text(source).unwrap_or("").to_string()
}

pub struct TypeScriptAstAnalyzer<'a> {
    source: &'a [u8],
    _relative_path: &'a str,
    imports: &'a [ExtractedImport],
    _exports: &'a [ExtractedExport],
    symbols: &'a [ExtractedSymbol],
}

impl<'a> TypeScriptAstAnalyzer<'a> {
    pub fn new(
        source: &'a [u8],
        relative_path: &'a str,
        imports: &'a [ExtractedImport],
        exports: &'a [ExtractedExport],
        symbols: &'a [ExtractedSymbol],
    ) -> Self {
        Self {
            source,
            _relative_path: relative_path,
            imports,
            _exports: exports,
            symbols,
        }
    }

    pub fn analyze(
        &self,
        root_node: Node,
    ) -> (Vec<ExtractedFunction>, Vec<ExtractedClass>, Vec<ExtractedCallSite>) {
        let mut functions = Vec::new();
        let mut classes = Vec::new();
        let mut all_calls = Vec::new();
        let mut instantiations = Vec::new();

        // 1. Traverse and find all functions, classes, and calls
        self.traverse_node(
            root_node,
            None,
            None,
            None,
            &mut functions,
            &mut classes,
            &mut all_calls,
            &mut instantiations,
        );

        // 2. Associate instantiations with their classes
        for inst in instantiations {
            for cls in &mut classes {
                if cls.name == inst.class_name {
                    cls.instantiations.push(inst.clone());
                }
            }
        }

        // 3. Populate callers in FunctionMetrics
        let mut call_targets: HashMap<String, HashSet<String>> = HashMap::new();
        for call in &all_calls {
            let caller_name = if let Some(caller_id) = &call.caller_symbol_id {
                self.symbols
                    .iter()
                    .find(|s| &s.stable_id == caller_id)
                    .map(|s| s.qualified_name.clone())
                    .unwrap_or_else(|| caller_id.clone())
            } else {
                "top_level".to_string()
            };

            // Map by callee_name and by resolved symbol stable_id if any
            call_targets
                .entry(call.callee_name.clone())
                .or_default()
                .insert(caller_name.clone());

            if let Some(target_id) = &call.callee_symbol_id {
                call_targets
                    .entry(target_id.clone())
                    .or_default()
                    .insert(caller_name);
            }
        }

        for func in &mut functions {
            let mut callers = HashSet::new();
            if let Some(c) = call_targets.get(&func.name) {
                callers.extend(c.iter().cloned());
            }
            if let Some(c) = call_targets.get(&func.symbol_stable_id) {
                callers.extend(c.iter().cloned());
            }
            if let Some(c) = call_targets.get(&func.qualified_name) {
                callers.extend(c.iter().cloned());
            }
            func.metrics.callers = callers.into_iter().collect();
            func.metrics.callers.sort();
        }

        (functions, classes, all_calls)
    }

    fn traverse_node(
        &self,
        node: Node,
        current_function_symbol: Option<&ExtractedSymbol>,
        current_class_name: Option<&str>,
        current_class_superclass: Option<&str>,
        functions: &mut Vec<ExtractedFunction>,
        classes: &mut Vec<ExtractedClass>,
        all_calls: &mut Vec<ExtractedCallSite>,
        instantiations: &mut Vec<ClassInstantiation>,
    ) {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            match child.kind() {
                "class_declaration" | "class" => {
                    if let Some(cls) = self.extract_class(child) {
                        let class_name = cls.name.clone();
                        let superclass_name = cls.superclass.clone();
                        classes.push(cls);

                        // Recurse into class body
                        if let Some(body) = child.child_by_field_name("body") {
                            self.traverse_node(
                                body,
                                current_function_symbol,
                                Some(&class_name),
                                superclass_name.as_deref(),
                                functions,
                                classes,
                                all_calls,
                                instantiations,
                            );
                        }
                    }
                }
                "function_declaration" | "function" => {
                    if let Some(func_sym) = self.find_matching_symbol(child) {
                        let extracted = self.extract_function(child, &func_sym, current_class_name, all_calls);
                        functions.push(extracted);

                        // Recurse into body with new current_function_symbol
                        if let Some(body) = child.child_by_field_name("body") {
                            self.traverse_node(
                                body,
                                Some(&func_sym),
                                current_class_name,
                                current_class_superclass,
                                functions,
                                classes,
                                all_calls,
                                instantiations,
                            );
                        }
                    }
                }
                "method_definition" => {
                    if let Some(method_sym) = self.find_matching_symbol(child) {
                        let extracted = self.extract_function(child, &method_sym, current_class_name, all_calls);
                        functions.push(extracted);

                        if let Some(body) = child.child_by_field_name("body") {
                            self.traverse_node(
                                body,
                                Some(&method_sym),
                                current_class_name,
                                current_class_superclass,
                                functions,
                                classes,
                                all_calls,
                                instantiations,
                            );
                        }
                    }
                }
                "arrow_function" => {
                    if let Some(arrow_sym) = self.find_matching_symbol(child) {
                        let extracted = self.extract_function(child, &arrow_sym, current_class_name, all_calls);
                        functions.push(extracted);

                        if let Some(body) = child.child_by_field_name("body") {
                            self.traverse_node(
                                body,
                                Some(&arrow_sym),
                                current_class_name,
                                current_class_superclass,
                                functions,
                                classes,
                                all_calls,
                                instantiations,
                            );
                        }
                    } else {
                        // Anonymous arrow function
                        if let Some(body) = child.child_by_field_name("body") {
                            self.traverse_node(
                                body,
                                current_function_symbol,
                                current_class_name,
                                current_class_superclass,
                                functions,
                                classes,
                                all_calls,
                                instantiations,
                            );
                        }
                    }
                }
                "call_expression" => {
                    self.extract_call_site(
                        child,
                        current_function_symbol,
                        current_class_name,
                        current_class_superclass,
                        all_calls,
                    );
                    // Continue recursing for nested calls e.g. fn(otherFn())
                    self.traverse_node(
                        child,
                        current_function_symbol,
                        current_class_name,
                        current_class_superclass,
                        functions,
                        classes,
                        all_calls,
                        instantiations,
                    );
                }
                "new_expression" => {
                    self.extract_new_site(
                        child,
                        current_function_symbol,
                        all_calls,
                        instantiations,
                    );
                    self.traverse_node(
                        child,
                        current_function_symbol,
                        current_class_name,
                        current_class_superclass,
                        functions,
                        classes,
                        all_calls,
                        instantiations,
                    );
                }
                _ => {
                    self.traverse_node(
                        child,
                        current_function_symbol,
                        current_class_name,
                        current_class_superclass,
                        functions,
                        classes,
                        all_calls,
                        instantiations,
                    );
                }
            }
        }
    }

    fn find_matching_symbol(&self, node: Node) -> Option<ExtractedSymbol> {
        let start_line = node.start_position().row + 1;
        let start_col = node.start_position().column;

        // Try exact match on start line/col or matching name
        let name_node = node.child_by_field_name("name");
        let name_str = name_node.map(|n| node_text(n, self.source));

        for sym in self.symbols {
            if sym.start_line == start_line {
                if let Some(ref n) = name_str {
                    if &sym.name == n {
                        return Some(sym.clone());
                    }
                } else if sym.start_column == start_col {
                    return Some(sym.clone());
                }
            }
        }

        // Arrow function or variable assignment check
        if let Some(parent) = node.parent() {
            if parent.kind() == "variable_declarator" {
                if let Some(id_node) = parent.child_by_field_name("name") {
                    let var_name = node_text(id_node, self.source);
                    for sym in self.symbols {
                        if sym.name == var_name && (sym.kind == SymbolKind::Function || sym.kind == SymbolKind::Method) {
                            return Some(sym.clone());
                        }
                    }
                }
            }
        }

        None
    }

    fn extract_function(
        &self,
        node: Node,
        sym: &ExtractedSymbol,
        _current_class_name: Option<&str>,
        _all_calls: &mut Vec<ExtractedCallSite>,
    ) -> ExtractedFunction {
        let body = node.child_by_field_name("body");

        let mut branch_count = 0;
        let mut loop_count = 0;
        let mut has_error_handling = false;
        let mut side_effects = Vec::new();
        let mut imports_used_set = HashSet::new();
        let mut callees_set = HashSet::new();

        if let Some(body_node) = body {
            self.analyze_function_body(
                body_node,
                &mut branch_count,
                &mut loop_count,
                &mut has_error_handling,
                &mut side_effects,
                &mut imports_used_set,
                &mut callees_set,
            );
        }

        let cyclomatic_complexity = 1 + branch_count + loop_count;

        let mut callees: Vec<String> = callees_set.into_iter().collect();
        callees.sort();

        let mut imports_used: Vec<String> = imports_used_set.into_iter().collect();
        imports_used.sort();

        ExtractedFunction {
            symbol_stable_id: sym.stable_id.clone(),
            name: sym.name.clone(),
            qualified_name: sym.qualified_name.clone(),
            metrics: FunctionMetrics {
                parameters: sym.parameters.clone(),
                return_type: sym.return_type.clone(),
                callers: Vec::new(),
                callees,
                imports_used,
                branch_count,
                loop_count,
                cyclomatic_complexity,
                has_error_handling,
                side_effects,
            },
            start_line: sym.start_line,
            end_line: sym.end_line,
            start_column: sym.start_column,
            end_column: sym.end_column,
        }
    }

    fn analyze_function_body(
        &self,
        node: Node,
        branch_count: &mut usize,
        loop_count: &mut usize,
        has_error_handling: &mut bool,
        side_effects: &mut Vec<SideEffectMarker>,
        imports_used: &mut HashSet<String>,
        callees: &mut HashSet<String>,
    ) {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            // Do not cross into nested function / arrow_function boundaries
            match child.kind() {
                "function_declaration" | "function" | "arrow_function" => {
                    continue;
                }
                "if_statement" => {
                    *branch_count += 1;
                }
                "ternary_expression" => {
                    *branch_count += 1;
                }
                "switch_case" | "case_clause" => {
                    // Check if it's not default clause
                    if child.child_by_field_name("value").is_some() || child.children(&mut child.walk()).any(|c| c.kind() == "case") {
                        *branch_count += 1;
                    }
                }
                "catch_clause" => {
                    *branch_count += 1;
                    *has_error_handling = true;
                }
                "try_statement" => {
                    // try_statement contains catch_clause
                    if child.children(&mut child.walk()).any(|c| c.kind() == "catch_clause") {
                        *has_error_handling = true;
                    }
                }
                "binary_expression" => {
                    if let Some(op) = child.child_by_field_name("operator") {
                        let op_text = node_text(op, self.source);
                        if op_text == "&&" || op_text == "||" || op_text == "??" {
                            *branch_count += 1;
                        }
                    } else {
                        // check child tokens for operator
                        let mut op_cursor = child.walk();
                        for op_node in child.children(&mut op_cursor) {
                            let text = node_text(op_node, self.source);
                            if text == "&&" || text == "||" || text == "??" {
                                *branch_count += 1;
                                break;
                            }
                        }
                    }
                }
                "for_statement" | "for_in_statement" | "while_statement" | "do_statement" => {
                    *loop_count += 1;
                }
                "call_expression" => {
                    if let Some(fn_node) = child.child_by_field_name("function") {
                        let callee_text = node_text(fn_node, self.source);
                        callees.insert(callee_text.clone());

                        let line = child.start_position().row + 1;
                        if let Some(marker) = SideEffectDetector::check_call(&callee_text, line) {
                            side_effects.push(marker);
                        }
                    }
                }
                "identifier" => {
                    let ident = node_text(child, self.source);
                    for imp in self.imports {
                        if imp.imported_name == ident || imp.alias.as_deref() == Some(&ident) || imp.source_module == ident {
                            imports_used.insert(ident.clone());
                        }
                    }
                }
                _ => {}
            }

            // Recurse into children (unless function boundaries)
            self.analyze_function_body(
                child,
                branch_count,
                loop_count,
                has_error_handling,
                side_effects,
                imports_used,
                callees,
            );
        }
    }

    fn extract_class(&self, node: Node) -> Option<ExtractedClass> {
        let name_node = node.child_by_field_name("name")?;
        let name = node_text(name_node, self.source);

        let sym = self.symbols.iter().find(|s| s.name == name && s.kind == SymbolKind::Class)?;

        let mut superclass = None;
        let mut interfaces = Vec::new();

        if let Some(heritage) = node.children(&mut node.walk()).find(|c| c.kind() == "class_heritage") {
            let mut h_cursor = heritage.walk();
            for clause in heritage.children(&mut h_cursor) {
                if clause.kind() == "extends_clause" {
                    if let Some(target) = clause.child_by_field_name("value").or_else(|| {
                        clause.children(&mut clause.walk()).find(|c| c.kind() != "extends")
                    }) {
                        superclass = Some(node_text(target, self.source).trim().to_string());
                    }
                } else if clause.kind() == "implements_clause" {
                    let mut i_cursor = clause.walk();
                    for iface in clause.children(&mut i_cursor) {
                        if iface.kind() != "implements" && iface.kind() != "," {
                            interfaces.push(node_text(iface, self.source).trim().to_string());
                        }
                    }
                }
            }
        }

        let mut properties = Vec::new();
        let mut methods = Vec::new();
        let mut constructors = Vec::new();

        if let Some(body) = node.child_by_field_name("body") {
            let mut cursor = body.walk();
            for member in body.children(&mut cursor) {
                match member.kind() {
                    "public_field_definition" | "property_definition" | "field_definition" => {
                        if let Some(p_name_node) = member.child_by_field_name("name") {
                            let p_name = node_text(p_name_node, self.source);
                            let type_annotation = member
                                .child_by_field_name("type")
                                .map(|n| node_text(n, self.source).trim_start_matches(':').trim().to_string());

                            let visibility = member
                                .children(&mut member.walk())
                                .find(|c| c.kind() == "accessibility_modifier")
                                .map(|n| node_text(n, self.source));

                            let is_static = member
                                .children(&mut member.walk())
                                .any(|c| c.kind() == "static");

                            properties.push(ClassProperty {
                                name: p_name,
                                type_annotation,
                                visibility,
                                is_static,
                            });
                        }
                    }
                    "method_definition" => {
                        if let Some(m_name_node) = member.child_by_field_name("name") {
                            let m_name = node_text(m_name_node, self.source);
                            let is_static = member
                                .children(&mut member.walk())
                                .any(|c| c.kind() == "static");

                            let visibility = member
                                .children(&mut member.walk())
                                .find(|c| c.kind() == "accessibility_modifier")
                                .map(|n| node_text(n, self.source));

                            let params_node = member.child_by_field_name("parameters");
                            let mut parameters = Vec::new();
                            if let Some(p_node) = params_node {
                                let mut p_cursor = p_node.walk();
                                for p_child in p_node.children(&mut p_cursor) {
                                    if p_child.kind() == "required_parameter" || p_child.kind() == "optional_parameter" {
                                        if let Some(pn) = p_child.child_by_field_name("pattern").or_else(|| p_child.child_by_field_name("name")) {
                                            parameters.push(Parameter {
                                                name: node_text(pn, self.source),
                                                type_annotation: p_child.child_by_field_name("type").map(|n| node_text(n, self.source)),
                                                default_value: p_child.child_by_field_name("value").map(|n| node_text(n, self.source)),
                                            });
                                        }
                                    }
                                }
                            }

                            let _return_type = member
                                .child_by_field_name("return_type")
                                .map(|n| node_text(n, self.source).trim_start_matches(':').trim().to_string());

                            if m_name == "constructor" {
                                constructors.push(ClassConstructor {
                                    signature: format!("constructor({})", parameters.iter().map(|p| p.name.clone()).collect::<Vec<_>>().join(", ")),
                                    parameters,
                                    start_line: member.start_position().row + 1,
                                    end_line: member.end_position().row + 1,
                                });
                            } else {
                                methods.push(ClassMethod {
                                    name: m_name.clone(),
                                    signature: format!("{}({})", m_name, parameters.iter().map(|p| p.name.clone()).collect::<Vec<_>>().join(", ")),
                                    visibility,
                                    is_static,
                                });
                            }
                        }
                    }
                    _ => {}
                }
            }
        }

        Some(ExtractedClass {
            symbol_stable_id: sym.stable_id.clone(),
            name,
            superclass,
            interfaces,
            properties,
            methods,
            constructors,
            instantiations: Vec::new(),
            start_line: sym.start_line,
            end_line: sym.end_line,
            start_column: sym.start_column,
            end_column: sym.end_column,
        })
    }

    fn extract_call_site(
        &self,
        node: Node,
        current_function_symbol: Option<&ExtractedSymbol>,
        current_class_name: Option<&str>,
        current_class_superclass: Option<&str>,
        all_calls: &mut Vec<ExtractedCallSite>,
    ) {
        let fn_node = match node.child_by_field_name("function") {
            Some(n) => n,
            None => return,
        };

        let start_pos = node.start_position();
        let end_pos = node.end_position();
        let snippet = node_text(node, self.source);

        let caller_symbol_id = current_function_symbol.map(|s| s.stable_id.clone());

        match fn_node.kind() {
            "identifier" => {
                let callee_name = node_text(fn_node, self.source);

                // Check 1: Dynamic builtins (eval)
                if callee_name == "eval" {
                    all_calls.push(ExtractedCallSite {
                        caller_symbol_id,
                        callee_name,
                        callee_symbol_id: None,
                        start_line: start_pos.row + 1,
                        end_line: end_pos.row + 1,
                        start_column: start_pos.column,
                        end_column: end_pos.column,
                        snippet,
                        resolution_status: CallResolutionStatus::Inferred,
                        is_dynamic: true,
                        receiver: None,
                    });
                    return;
                }

                // Check 2: Callback/parameter call
                if let Some(func_sym) = current_function_symbol {
                    if func_sym.parameters.iter().any(|p| p.name == callee_name) {
                        all_calls.push(ExtractedCallSite {
                            caller_symbol_id,
                            callee_name,
                            callee_symbol_id: None,
                            start_line: start_pos.row + 1,
                            end_line: end_pos.row + 1,
                            start_column: start_pos.column,
                            end_column: end_pos.column,
                            snippet,
                            resolution_status: CallResolutionStatus::Inferred,
                            is_dynamic: false,
                            receiver: None,
                        });
                        return;
                    }
                }

                // Check 3: Same-scope definition in the file
                if let Some(def_sym) = self.symbols.iter().find(|s| s.name == callee_name && (s.kind == SymbolKind::Function || s.kind == SymbolKind::Class)) {
                    all_calls.push(ExtractedCallSite {
                        caller_symbol_id,
                        callee_name,
                        callee_symbol_id: Some(def_sym.stable_id.clone()),
                        start_line: start_pos.row + 1,
                        end_line: end_pos.row + 1,
                        start_column: start_pos.column,
                        end_column: end_pos.column,
                        snippet,
                        resolution_status: CallResolutionStatus::Confirmed,
                        is_dynamic: false,
                        receiver: None,
                    });
                    return;
                }

                // Check 4: Imported call
                if let Some(_imp) = self.imports.iter().find(|i| i.imported_name == callee_name || i.alias.as_deref() == Some(&callee_name)) {
                    all_calls.push(ExtractedCallSite {
                        caller_symbol_id,
                        callee_name,
                        callee_symbol_id: None,
                        start_line: start_pos.row + 1,
                        end_line: end_pos.row + 1,
                        start_column: start_pos.column,
                        end_column: end_pos.column,
                        snippet,
                        resolution_status: CallResolutionStatus::Confirmed,
                        is_dynamic: false,
                        receiver: None,
                    });
                    return;
                }

                // Check 5: Unresolved identifier
                all_calls.push(ExtractedCallSite {
                    caller_symbol_id,
                    callee_name,
                    callee_symbol_id: None,
                    start_line: start_pos.row + 1,
                    end_line: end_pos.row + 1,
                    start_column: start_pos.column,
                    end_column: end_pos.column,
                    snippet,
                    resolution_status: CallResolutionStatus::Unknown,
                    is_dynamic: false,
                    receiver: None,
                });
            }
            "member_expression" => {
                let object_node = fn_node.child_by_field_name("object");
                let property_node = fn_node.child_by_field_name("property");

                if let (Some(obj), Some(prop)) = (object_node, property_node) {
                    let obj_text = node_text(obj, self.source);
                    let prop_text = node_text(prop, self.source);
                    let callee_name = format!("{}.{}", obj_text, prop_text);

                    if obj_text == "this" {
                        // Method call on this
                        let method_sym = current_class_name.and_then(|cls_name| {
                            let qname = format!("{}.{}", cls_name, prop_text);
                            self.symbols.iter().find(|s| s.qualified_name == qname && s.kind == SymbolKind::Method)
                        });

                        let (status, sym_id) = if let Some(m) = method_sym {
                            (CallResolutionStatus::Confirmed, Some(m.stable_id.clone()))
                        } else if let Some(super_name) = current_class_superclass {
                            // Method is not defined in the same class, but class extends parent class -> static
                            let parent_sym = self.symbols.iter().find(|s| {
                                (s.qualified_name == format!("{}.{}", super_name, prop_text)
                                    || (s.parent_name.as_deref() == Some(super_name) && s.name == prop_text))
                                    && s.kind == SymbolKind::Method
                            });
                            (CallResolutionStatus::Static, parent_sym.map(|s| s.stable_id.clone()))
                        } else {
                            (CallResolutionStatus::Inferred, None)
                        };

                        all_calls.push(ExtractedCallSite {
                            caller_symbol_id,
                            callee_name,
                            callee_symbol_id: sym_id,
                            start_line: start_pos.row + 1,
                            end_line: end_pos.row + 1,
                            start_column: start_pos.column,
                            end_column: end_pos.column,
                            snippet,
                            resolution_status: status,
                            is_dynamic: false,
                            receiver: Some("this".to_string()),
                        });
                    } else {
                        // Method call on unknown receiver -> Inferred
                        all_calls.push(ExtractedCallSite {
                            caller_symbol_id,
                            callee_name,
                            callee_symbol_id: None,
                            start_line: start_pos.row + 1,
                            end_line: end_pos.row + 1,
                            start_column: start_pos.column,
                            end_column: end_pos.column,
                            snippet,
                            resolution_status: CallResolutionStatus::Inferred,
                            is_dynamic: false,
                            receiver: Some(obj_text),
                        });
                    }
                }
            }
            "subscript_expression" => {
                let obj = fn_node.child_by_field_name("object").map(|n| node_text(n, self.source)).unwrap_or_default();
                let idx = fn_node.child_by_field_name("index").map(|n| node_text(n, self.source)).unwrap_or_default();
                let callee_name = format!("{}[{}]", obj, idx);

                all_calls.push(ExtractedCallSite {
                    caller_symbol_id,
                    callee_name,
                    callee_symbol_id: None,
                    start_line: start_pos.row + 1,
                    end_line: end_pos.row + 1,
                    start_column: start_pos.column,
                    end_column: end_pos.column,
                    snippet,
                    resolution_status: CallResolutionStatus::Inferred,
                    is_dynamic: true,
                    receiver: Some(obj),
                });
            }
            _ => {
                let callee_name = node_text(fn_node, self.source);
                all_calls.push(ExtractedCallSite {
                    caller_symbol_id,
                    callee_name,
                    callee_symbol_id: None,
                    start_line: start_pos.row + 1,
                    end_line: end_pos.row + 1,
                    start_column: start_pos.column,
                    end_column: end_pos.column,
                    snippet,
                    resolution_status: CallResolutionStatus::Inferred,
                    is_dynamic: true,
                    receiver: None,
                });
            }
        }
    }

    fn extract_new_site(
        &self,
        node: Node,
        current_function_symbol: Option<&ExtractedSymbol>,
        all_calls: &mut Vec<ExtractedCallSite>,
        instantiations: &mut Vec<ClassInstantiation>,
    ) {
        let constructor_node = match node.child_by_field_name("constructor") {
            Some(n) => n,
            None => return,
        };

        let class_name = node_text(constructor_node, self.source);
        let start_pos = node.start_position();
        let end_pos = node.end_position();
        let snippet = node_text(node, self.source);
        let caller_symbol_id = current_function_symbol.map(|s| s.stable_id.clone());

        // Check if class is defined in this file or imported
        let class_sym = self.symbols.iter().find(|s| s.name == class_name && s.kind == SymbolKind::Class);
        let is_imported = self.imports.iter().any(|i| i.imported_name == class_name || i.alias.as_deref() == Some(&class_name));

        let (status, class_symbol_id) = if let Some(sym) = class_sym {
            (CallResolutionStatus::Confirmed, Some(sym.stable_id.clone()))
        } else if is_imported {
            (CallResolutionStatus::Confirmed, None)
        } else {
            (CallResolutionStatus::Unknown, None)
        };

        let inst = ClassInstantiation {
            class_name: class_name.clone(),
            caller_symbol_id: caller_symbol_id.clone(),
            class_symbol_id: class_symbol_id.clone(),
            start_line: start_pos.row + 1,
            end_line: end_pos.row + 1,
            start_column: start_pos.column,
            end_column: end_pos.column,
            snippet: snippet.clone(),
            resolution_status: status,
        };
        instantiations.push(inst);

        all_calls.push(ExtractedCallSite {
            caller_symbol_id,
            callee_name: class_name,
            callee_symbol_id: class_symbol_id,
            start_line: start_pos.row + 1,
            end_line: end_pos.row + 1,
            start_column: start_pos.column,
            end_column: end_pos.column,
            snippet,
            resolution_status: status,
            is_dynamic: false,
            receiver: None,
        });
    }
}
