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

pub struct PythonAstAnalyzer<'a> {
    source: &'a [u8],
    _relative_path: &'a str,
    imports: &'a [ExtractedImport],
    _exports: &'a [ExtractedExport],
    symbols: &'a [ExtractedSymbol],
}

impl<'a> PythonAstAnalyzer<'a> {
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

        self.traverse_node(
            root_node,
            None,
            None,
            &mut functions,
            &mut classes,
            &mut all_calls,
            &mut instantiations,
        );

        // Associate instantiations with their classes
        for inst in instantiations {
            for cls in &mut classes {
                if cls.name == inst.class_name {
                    cls.instantiations.push(inst.clone());
                }
            }
        }

        // Populate callers in FunctionMetrics
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
        functions: &mut Vec<ExtractedFunction>,
        classes: &mut Vec<ExtractedClass>,
        all_calls: &mut Vec<ExtractedCallSite>,
        instantiations: &mut Vec<ClassInstantiation>,
    ) {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            match child.kind() {
                "class_definition" => {
                    if let Some(cls) = self.extract_class(child) {
                        let class_name = cls.name.clone();
                        classes.push(cls);

                        if let Some(body) = child.child_by_field_name("body") {
                            self.traverse_node(
                                body,
                                current_function_symbol,
                                Some(&class_name),
                                functions,
                                classes,
                                all_calls,
                                instantiations,
                            );
                        }
                    }
                }
                "function_definition" => {
                    if let Some(func_sym) = self.find_matching_symbol(child) {
                        let extracted = self.extract_function(child, &func_sym, current_class_name, all_calls);
                        functions.push(extracted);

                        if let Some(body) = child.child_by_field_name("body") {
                            self.traverse_node(
                                body,
                                Some(&func_sym),
                                current_class_name,
                                functions,
                                classes,
                                all_calls,
                                instantiations,
                            );
                        }
                    }
                }
                "call" => {
                    self.extract_call_site(
                        child,
                        current_function_symbol,
                        current_class_name,
                        all_calls,
                        instantiations,
                    );
                    self.traverse_node(
                        child,
                        current_function_symbol,
                        current_class_name,
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
        let name_node = node.child_by_field_name("name");
        let name_str = name_node.map(|n| node_text(n, self.source));

        for sym in self.symbols {
            if sym.start_line == start_line {
                if let Some(ref n) = name_str {
                    if &sym.name == n {
                        return Some(sym.clone());
                    }
                } else {
                    return Some(sym.clone());
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
            match child.kind() {
                "function_definition" | "lambda" => {
                    continue;
                }
                "if_statement" => {
                    *branch_count += 1;
                }
                "elif_clause" => {
                    *branch_count += 1;
                }
                "conditional_expression" => {
                    *branch_count += 1;
                }
                "except_clause" => {
                    *branch_count += 1;
                    *has_error_handling = true;
                }
                "try_statement" => {
                    if child.children(&mut child.walk()).any(|c| c.kind() == "except_clause") {
                        *has_error_handling = true;
                    }
                }
                "boolean_operator" => {
                    let mut op_cursor = child.walk();
                    for op_child in child.children(&mut op_cursor) {
                        let text = node_text(op_child, self.source);
                        if text == "and" || text == "or" {
                            *branch_count += 1;
                        }
                    }
                }
                "for_statement" | "while_statement" => {
                    *loop_count += 1;
                }
                "call" => {
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
        if let Some(args) = node.child_by_field_name("superclasses").or_else(|| {
            node.children(&mut node.walk()).find(|c| c.kind() == "argument_list")
        }) {
            let mut a_cursor = args.walk();
            let mut bases = Vec::new();
            for base in args.children(&mut a_cursor) {
                if base.kind() == "identifier" || base.kind() == "attribute" {
                    bases.push(node_text(base, self.source));
                }
            }
            if !bases.is_empty() {
                superclass = Some(bases.join(", "));
            }
        }

        let mut properties = Vec::new();
        let mut methods = Vec::new();
        let mut constructors = Vec::new();

        if let Some(body) = node.child_by_field_name("body") {
            let mut cursor = body.walk();
            for child in body.children(&mut cursor) {
                match child.kind() {
                    "function_definition" => {
                        if let Some(m_name_node) = child.child_by_field_name("name") {
                            let m_name = node_text(m_name_node, self.source);
                            let is_static = child.children(&mut child.walk()).any(|c| {
                                c.kind() == "decorator" && node_text(c, self.source).contains("staticmethod")
                            });

                            let visibility = if m_name.starts_with("__") && m_name.ends_with("__") {
                                Some("special".to_string())
                            } else if m_name.starts_with('_') {
                                Some("private".to_string())
                            } else {
                                Some("public".to_string())
                            };

                            let params_node = child.child_by_field_name("parameters");
                            let mut parameters = Vec::new();
                            if let Some(p_node) = params_node {
                                let mut p_cursor = p_node.walk();
                                for p_child in p_node.children(&mut p_cursor) {
                                    if p_child.kind() == "identifier" {
                                        parameters.push(Parameter {
                                            name: node_text(p_child, self.source),
                                            type_annotation: None,
                                            default_value: None,
                                        });
                                    } else if p_child.kind() == "typed_parameter" || p_child.kind() == "default_parameter" || p_child.kind() == "typed_default_parameter" {
                                        if let Some(pn) = p_child.child_by_field_name("name") {
                                            parameters.push(Parameter {
                                                name: node_text(pn, self.source),
                                                type_annotation: p_child.child_by_field_name("type").map(|n| node_text(n, self.source)),
                                                default_value: p_child.child_by_field_name("value").map(|n| node_text(n, self.source)),
                                            });
                                        }
                                    }
                                }
                            }

                            if m_name == "__init__" {
                                constructors.push(ClassConstructor {
                                    signature: format!("__init__({})", parameters.iter().map(|p| p.name.clone()).collect::<Vec<_>>().join(", ")),
                                    parameters,
                                    start_line: child.start_position().row + 1,
                                    end_line: child.end_position().row + 1,
                                });

                                // Also extract instance properties self.prop = ... inside __init__
                                if let Some(init_body) = child.child_by_field_name("body") {
                                    self.extract_instance_properties(init_body, &mut properties);
                                }
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
                    "expression_statement" => {
                        // Class-level property assignment: prop = ...
                        let mut sub = child.walk();
                        for s in child.children(&mut sub) {
                            if s.kind() == "assignment" {
                                if let Some(left) = s.child_by_field_name("left") {
                                    if left.kind() == "identifier" {
                                        let p_name = node_text(left, self.source);
                                        let visibility = if p_name.starts_with('_') {
                                            Some("private".to_string())
                                        } else {
                                            Some("public".to_string())
                                        };
                                        let type_annotation = s.child_by_field_name("type").map(|t| node_text(t, self.source));
                                        properties.push(ClassProperty {
                                            name: p_name,
                                            type_annotation,
                                            visibility,
                                            is_static: true,
                                        });
                                    }
                                }
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
            interfaces: Vec::new(),
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

    fn extract_instance_properties(&self, body_node: Node, properties: &mut Vec<ClassProperty>) {
        let mut cursor = body_node.walk();
        for child in body_node.children(&mut cursor) {
            if child.kind() == "expression_statement" {
                let mut inner = child.walk();
                for sub in child.children(&mut inner) {
                    if sub.kind() == "assignment" {
                        if let Some(left) = sub.child_by_field_name("left") {
                            if left.kind() == "attribute" {
                                if let (Some(obj), Some(attr)) = (left.child_by_field_name("object"), left.child_by_field_name("attribute")) {
                                    if node_text(obj, self.source) == "self" {
                                        let prop_name = node_text(attr, self.source);
                                        if !properties.iter().any(|p| p.name == prop_name) {
                                            let visibility = if prop_name.starts_with('_') {
                                                Some("private".to_string())
                                            } else {
                                                Some("public".to_string())
                                            };
                                            let type_annotation = sub.child_by_field_name("type").map(|n| node_text(n, self.source));
                                            properties.push(ClassProperty {
                                                name: prop_name,
                                                type_annotation,
                                                visibility,
                                                is_static: false,
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    fn extract_call_site(
        &self,
        node: Node,
        current_function_symbol: Option<&ExtractedSymbol>,
        current_class_name: Option<&str>,
        all_calls: &mut Vec<ExtractedCallSite>,
        instantiations: &mut Vec<ClassInstantiation>,
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

                // Check 1: Dynamic builtin getattr(...)()
                if callee_name == "getattr" {
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

                // Check 3: Class instantiation in Python: ClassName(...)
                if let Some(class_sym) = self.symbols.iter().find(|s| s.name == callee_name && s.kind == SymbolKind::Class) {
                    let inst = ClassInstantiation {
                        class_name: callee_name.clone(),
                        caller_symbol_id: caller_symbol_id.clone(),
                        class_symbol_id: Some(class_sym.stable_id.clone()),
                        start_line: start_pos.row + 1,
                        end_line: end_pos.row + 1,
                        start_column: start_pos.column,
                        end_column: end_pos.column,
                        snippet: snippet.clone(),
                        resolution_status: CallResolutionStatus::Confirmed,
                    };
                    instantiations.push(inst);

                    all_calls.push(ExtractedCallSite {
                        caller_symbol_id,
                        callee_name,
                        callee_symbol_id: Some(class_sym.stable_id.clone()),
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

                // Check 4: Same-scope function definition in the file
                if let Some(def_sym) = self.symbols.iter().find(|s| s.name == callee_name && s.kind == SymbolKind::Function) {
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

                // Check 5: Imported call
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

                // Check 6: Unresolved identifier
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
            "attribute" => {
                let object_node = fn_node.child_by_field_name("object");
                let attr_node = fn_node.child_by_field_name("attribute");

                if let (Some(obj), Some(attr)) = (object_node, attr_node) {
                    let obj_text = node_text(obj, self.source);
                    let attr_text = node_text(attr, self.source);
                    let callee_name = format!("{}.{}", obj_text, attr_text);

                    if obj_text == "self" {
                        // Method call on self
                        let method_sym = current_class_name.and_then(|cls_name| {
                            let qname = format!("{}.{}", cls_name, attr_text);
                            self.symbols.iter().find(|s| s.qualified_name == qname && s.kind == SymbolKind::Method)
                        });

                        let (status, sym_id) = if let Some(m) = method_sym {
                            (CallResolutionStatus::Confirmed, Some(m.stable_id.clone()))
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
                            receiver: Some("self".to_string()),
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
            "subscript" => {
                let obj = fn_node.child_by_field_name("value").map(|n| node_text(n, self.source)).unwrap_or_default();
                let idx = fn_node.child_by_field_name("subscript").map(|n| node_text(n, self.source)).unwrap_or_default();
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
}
