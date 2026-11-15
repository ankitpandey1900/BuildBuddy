use std::collections::HashMap;
use rusqlite::{params, Connection, Result, Transaction};
use serde::{Deserialize, Serialize};

use crate::parser::traits::FileParseResult;
use crate::symbols::model::{
    CallResolutionStatus, ClassConstructor, ClassMethod, ClassProperty, Parameter,
    SideEffectMarker,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StoredFunction {
    pub id: i64,
    pub symbol_id: i64,
    pub file_id: i64,
    pub name: String,
    pub parameters: Vec<Parameter>,
    pub return_type: Option<String>,
    pub branch_count: usize,
    pub loop_count: usize,
    pub cyclomatic_complexity: usize,
    pub has_error_handling: bool,
    pub side_effects: Vec<SideEffectMarker>,
    pub imports_used: Vec<String>,
    pub callers: Vec<String>,
    pub callees: Vec<String>,
    pub source_evidence_id: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StoredClass {
    pub id: i64,
    pub symbol_id: i64,
    pub file_id: i64,
    pub name: String,
    pub superclass_name: Option<String>,
    pub interfaces: Vec<String>,
    pub properties: Vec<ClassProperty>,
    pub methods: Vec<ClassMethod>,
    pub constructors: Vec<ClassConstructor>,
    pub source_evidence_id: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StoredCallRelationship {
    pub id: i64,
    pub file_id: i64,
    pub caller_symbol_id: Option<i64>,
    pub callee_symbol_id: Option<i64>,
    pub callee_name: String,
    pub resolution_status: CallResolutionStatus,
    pub is_dynamic: bool,
    pub source_evidence_id: i64,
    pub start_line: usize,
    pub end_line: usize,
    pub start_column: usize,
    pub end_column: usize,
    pub snippet: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StoredInstantiation {
    pub id: i64,
    pub file_id: i64,
    pub caller_symbol_id: Option<i64>,
    pub class_symbol_id: Option<i64>,
    pub class_name: String,
    pub resolution_status: CallResolutionStatus,
    pub source_evidence_id: i64,
    pub start_line: usize,
    pub end_line: usize,
    pub start_column: usize,
    pub end_column: usize,
}

pub fn persist_file_calls_and_metrics_tx(
    tx: &Transaction,
    project_id: i64,
    file_id: i64,
    result: &FileParseResult,
) -> Result<()> {
    // 1. Delete previous calls, instantiations, functions, and classes for this file
    tx.execute(
        "DELETE FROM call_relationships WHERE project_id = ?1 AND file_id = ?2",
        params![project_id, file_id],
    )?;
    tx.execute(
        "DELETE FROM class_instantiations WHERE project_id = ?1 AND file_id = ?2",
        params![project_id, file_id],
    )?;
    tx.execute(
        "DELETE FROM functions WHERE project_id = ?1 AND file_id = ?2",
        params![project_id, file_id],
    )?;
    tx.execute(
        "DELETE FROM classes WHERE project_id = ?1 AND file_id = ?2",
        params![project_id, file_id],
    )?;

    // 2. Build map of stable_id -> (symbol_id, source_evidence_id) for this file
    let mut symbol_map: HashMap<String, (i64, Option<i64>)> = HashMap::new();
    {
        let mut stmt = tx.prepare(
            "SELECT id, stable_id, source_evidence_id FROM symbols WHERE project_id = ?1 AND file_id = ?2",
        )?;
        let rows = stmt.query_map(params![project_id, file_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, Option<i64>>(2)?))
        })?;
        for r in rows {
            let (sym_id, stable_id, ev_id) = r?;
            symbol_map.insert(stable_id, (sym_id, ev_id));
        }
    }

    // Also build a project-wide map of stable_id -> symbol_id for resolving call targets
    let mut project_symbol_map: HashMap<String, i64> = HashMap::new();
    {
        let mut stmt = tx.prepare("SELECT id, stable_id FROM symbols WHERE project_id = ?1")?;
        let rows = stmt.query_map(params![project_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?;
        for r in rows {
            let (sym_id, stable_id) = r?;
            project_symbol_map.insert(stable_id, sym_id);
        }
    }

    // 3. Insert functions
    {
        let mut func_stmt = tx.prepare(
            "INSERT INTO functions (
                project_id, file_id, symbol_id, name, parameters_json, return_type,
                branch_count, loop_count, cyclomatic_complexity, has_error_handling,
                side_effects_json, imports_used_json, callers_json, callees_json, source_evidence_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        )?;

        for func in &result.functions {
            if let Some(&(sym_id, ev_id)) = symbol_map.get(&func.symbol_stable_id) {
                let params_json = serde_json::to_string(&func.metrics.parameters).unwrap_or_else(|_| "[]".to_string());
                let side_effects_json = serde_json::to_string(&func.metrics.side_effects).unwrap_or_else(|_| "[]".to_string());
                let imports_used_json = serde_json::to_string(&func.metrics.imports_used).unwrap_or_else(|_| "[]".to_string());
                let callers_json = serde_json::to_string(&func.metrics.callers).unwrap_or_else(|_| "[]".to_string());
                let callees_json = serde_json::to_string(&func.metrics.callees).unwrap_or_else(|_| "[]".to_string());

                func_stmt.execute(params![
                    project_id,
                    file_id,
                    sym_id,
                    func.name,
                    params_json,
                    func.metrics.return_type,
                    func.metrics.branch_count as i64,
                    func.metrics.loop_count as i64,
                    func.metrics.cyclomatic_complexity as i64,
                    if func.metrics.has_error_handling { 1 } else { 0 },
                    side_effects_json,
                    imports_used_json,
                    callers_json,
                    callees_json,
                    ev_id,
                ])?;
            }
        }
    }

    // 4. Insert classes
    {
        let mut class_stmt = tx.prepare(
            "INSERT INTO classes (
                project_id, file_id, symbol_id, name, superclass_name, interfaces_json,
                properties_json, methods_json, constructors_json, source_evidence_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        )?;

        for cls in &result.classes {
            if let Some(&(sym_id, ev_id)) = symbol_map.get(&cls.symbol_stable_id) {
                let ifaces_json = serde_json::to_string(&cls.interfaces).unwrap_or_else(|_| "[]".to_string());
                let props_json = serde_json::to_string(&cls.properties).unwrap_or_else(|_| "[]".to_string());
                let methods_json = serde_json::to_string(&cls.methods).unwrap_or_else(|_| "[]".to_string());
                let ctors_json = serde_json::to_string(&cls.constructors).unwrap_or_else(|_| "[]".to_string());

                class_stmt.execute(params![
                    project_id,
                    file_id,
                    sym_id,
                    cls.name,
                    cls.superclass,
                    ifaces_json,
                    props_json,
                    methods_json,
                    ctors_json,
                    ev_id,
                ])?;
            }
        }
    }

    // 5. Insert call_relationships with source_evidence provenance
    {
        let mut evidence_stmt = tx.prepare(
            "INSERT INTO source_evidence (
                project_id, file_path, start_line, end_line, start_column, end_column,
                snippet, confidence, evidence_type
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'call_site')",
        )?;

        let mut call_stmt = tx.prepare(
            "INSERT INTO call_relationships (
                project_id, file_id, caller_symbol_id, callee_symbol_id, callee_name,
                resolution_status, is_dynamic, source_evidence_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )?;

        for call in &result.calls {
            evidence_stmt.execute(params![
                project_id,
                result.relative_path,
                call.start_line as i64,
                call.end_line as i64,
                call.start_column as i64,
                call.end_column as i64,
                call.snippet,
                call.resolution_status.as_str(),
            ])?;
            let evidence_id = tx.last_insert_rowid();

            let caller_sym_id = call.caller_symbol_id.as_ref().and_then(|id| {
                symbol_map.get(id).map(|(sid, _)| *sid).or_else(|| project_symbol_map.get(id).copied())
            });

            let callee_sym_id = call.callee_symbol_id.as_ref().and_then(|id| {
                symbol_map.get(id).map(|(sid, _)| *sid).or_else(|| project_symbol_map.get(id).copied())
            });

            call_stmt.execute(params![
                project_id,
                file_id,
                caller_sym_id,
                callee_sym_id,
                call.callee_name,
                call.resolution_status.as_str(),
                if call.is_dynamic { 1 } else { 0 },
                evidence_id,
            ])?;
        }
    }

    // 6. Insert class instantiations with source_evidence provenance
    {
        let mut evidence_stmt = tx.prepare(
            "INSERT INTO source_evidence (
                project_id, file_path, start_line, end_line, start_column, end_column,
                snippet, confidence, evidence_type
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'call_site')",
        )?;

        let mut inst_stmt = tx.prepare(
            "INSERT INTO class_instantiations (
                project_id, file_id, caller_symbol_id, class_symbol_id, class_name,
                resolution_status, source_evidence_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )?;

        for cls in &result.classes {
            for inst in &cls.instantiations {
                evidence_stmt.execute(params![
                    project_id,
                    result.relative_path,
                    inst.start_line as i64,
                    inst.end_line as i64,
                    inst.start_column as i64,
                    inst.end_column as i64,
                    inst.snippet,
                    inst.resolution_status.as_str(),
                ])?;
                let evidence_id = tx.last_insert_rowid();

                let caller_sym_id = inst.caller_symbol_id.as_ref().and_then(|id| {
                    symbol_map.get(id).map(|(sid, _)| *sid).or_else(|| project_symbol_map.get(id).copied())
                });

                let class_sym_id = inst.class_symbol_id.as_ref().and_then(|id| {
                    symbol_map.get(id).map(|(sid, _)| *sid).or_else(|| project_symbol_map.get(id).copied())
                });

                inst_stmt.execute(params![
                    project_id,
                    file_id,
                    caller_sym_id,
                    class_sym_id,
                    inst.class_name,
                    inst.resolution_status.as_str(),
                    evidence_id,
                ])?;
            }
        }
    }

    Ok(())
}

pub fn persist_file_calls_and_metrics(
    conn: &mut Connection,
    project_id: i64,
    file_id: i64,
    result: &FileParseResult,
) -> Result<()> {
    let tx = conn.transaction()?;
    persist_file_calls_and_metrics_tx(&tx, project_id, file_id, result)?;
    tx.commit()?;
    Ok(())
}

pub fn get_calls_for_file(conn: &Connection, file_id: i64) -> Result<Vec<StoredCallRelationship>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.file_id, c.caller_symbol_id, c.callee_symbol_id, c.callee_name,
                c.resolution_status, c.is_dynamic, c.source_evidence_id,
                e.start_line, e.end_line, e.start_column, e.end_column, e.snippet
         FROM call_relationships c
         JOIN source_evidence e ON c.source_evidence_id = e.id
         WHERE c.file_id = ?1
         ORDER BY e.start_line ASC, e.start_column ASC",
    )?;

    let rows = stmt.query_map(params![file_id], |row| {
        let status_str: String = row.get(5)?;
        let resolution_status = match status_str.as_str() {
            "confirmed" => CallResolutionStatus::Confirmed,
            "static" => CallResolutionStatus::Static,
            "inferred" => CallResolutionStatus::Inferred,
            _ => CallResolutionStatus::Unknown,
        };

        Ok(StoredCallRelationship {
            id: row.get(0)?,
            file_id: row.get(1)?,
            caller_symbol_id: row.get(2)?,
            callee_symbol_id: row.get(3)?,
            callee_name: row.get(4)?,
            resolution_status,
            is_dynamic: row.get::<_, i64>(6)? == 1,
            source_evidence_id: row.get(7)?,
            start_line: row.get::<_, i64>(8)? as usize,
            end_line: row.get::<_, i64>(9)? as usize,
            start_column: row.get::<_, i64>(10)? as usize,
            end_column: row.get::<_, i64>(11)? as usize,
            snippet: row.get(12)?,
        })
    })?;

    let mut calls = Vec::new();
    for r in rows {
        calls.push(r?);
    }
    Ok(calls)
}

pub fn get_functions_for_file(conn: &Connection, file_id: i64) -> Result<Vec<StoredFunction>> {
    let mut stmt = conn.prepare(
        "SELECT id, symbol_id, file_id, name, parameters_json, return_type,
                branch_count, loop_count, cyclomatic_complexity, has_error_handling,
                side_effects_json, imports_used_json, callers_json, callees_json, source_evidence_id
         FROM functions
         WHERE file_id = ?1
         ORDER BY id ASC",
    )?;

    let rows = stmt.query_map(params![file_id], |row| {
        let params_json: String = row.get(4)?;
        let parameters: Vec<Parameter> = serde_json::from_str(&params_json).unwrap_or_default();

        let side_effects_json: String = row.get(10)?;
        let side_effects: Vec<SideEffectMarker> = serde_json::from_str(&side_effects_json).unwrap_or_default();

        let imports_json: String = row.get(11)?;
        let imports_used: Vec<String> = serde_json::from_str(&imports_json).unwrap_or_default();

        let callers_json: String = row.get(12)?;
        let callers: Vec<String> = serde_json::from_str(&callers_json).unwrap_or_default();

        let callees_json: String = row.get(13)?;
        let callees: Vec<String> = serde_json::from_str(&callees_json).unwrap_or_default();

        Ok(StoredFunction {
            id: row.get(0)?,
            symbol_id: row.get(1)?,
            file_id: row.get(2)?,
            name: row.get(3)?,
            parameters,
            return_type: row.get(5)?,
            branch_count: row.get::<_, i64>(6)? as usize,
            loop_count: row.get::<_, i64>(7)? as usize,
            cyclomatic_complexity: row.get::<_, i64>(8)? as usize,
            has_error_handling: row.get::<_, i64>(9)? == 1,
            side_effects,
            imports_used,
            callers,
            callees,
            source_evidence_id: row.get(14)?,
        })
    })?;

    let mut funcs = Vec::new();
    for r in rows {
        funcs.push(r?);
    }
    Ok(funcs)
}

pub fn get_classes_for_file(conn: &Connection, file_id: i64) -> Result<Vec<StoredClass>> {
    let mut stmt = conn.prepare(
        "SELECT id, symbol_id, file_id, name, superclass_name, interfaces_json,
                properties_json, methods_json, constructors_json, source_evidence_id
         FROM classes
         WHERE file_id = ?1
         ORDER BY id ASC",
    )?;

    let rows = stmt.query_map(params![file_id], |row| {
        let ifaces_json: String = row.get(5)?;
        let interfaces: Vec<String> = serde_json::from_str(&ifaces_json).unwrap_or_default();

        let props_json: String = row.get(6)?;
        let properties: Vec<ClassProperty> = serde_json::from_str(&props_json).unwrap_or_default();

        let methods_json: String = row.get(7)?;
        let methods: Vec<ClassMethod> = serde_json::from_str(&methods_json).unwrap_or_default();

        let ctors_json: String = row.get(8)?;
        let constructors: Vec<ClassConstructor> = serde_json::from_str(&ctors_json).unwrap_or_default();

        Ok(StoredClass {
            id: row.get(0)?,
            symbol_id: row.get(1)?,
            file_id: row.get(2)?,
            name: row.get(3)?,
            superclass_name: row.get(4)?,
            interfaces,
            properties,
            methods,
            constructors,
            source_evidence_id: row.get(9)?,
        })
    })?;

    let mut classes = Vec::new();
    for r in rows {
        classes.push(r?);
    }
    Ok(classes)
}

pub fn get_instantiations_for_class(
    conn: &Connection,
    class_symbol_id: i64,
) -> Result<Vec<StoredInstantiation>> {
    let mut stmt = conn.prepare(
        "SELECT i.id, i.file_id, i.caller_symbol_id, i.class_symbol_id, i.class_name,
                i.resolution_status, i.source_evidence_id,
                e.start_line, e.end_line, e.start_column, e.end_column
         FROM class_instantiations i
         JOIN source_evidence e ON i.source_evidence_id = e.id
         WHERE i.class_symbol_id = ?1
         ORDER BY e.start_line ASC",
    )?;

    let rows = stmt.query_map(params![class_symbol_id], |row| {
        let status_str: String = row.get(5)?;
        let resolution_status = match status_str.as_str() {
            "confirmed" => CallResolutionStatus::Confirmed,
            "static" => CallResolutionStatus::Static,
            "inferred" => CallResolutionStatus::Inferred,
            _ => CallResolutionStatus::Unknown,
        };

        Ok(StoredInstantiation {
            id: row.get(0)?,
            file_id: row.get(1)?,
            caller_symbol_id: row.get(2)?,
            class_symbol_id: row.get(3)?,
            class_name: row.get(4)?,
            resolution_status,
            source_evidence_id: row.get(6)?,
            start_line: row.get::<_, i64>(7)? as usize,
            end_line: row.get::<_, i64>(8)? as usize,
            start_column: row.get::<_, i64>(9)? as usize,
            end_column: row.get::<_, i64>(10)? as usize,
        })
    })?;

    let mut insts = Vec::new();
    for r in rows {
        insts.push(r?);
    }
    Ok(insts)
}

/// Incremental cleanup: when a file changes, delete its calls, functions, classes,
/// and edges in other files that target symbols in this file.
pub fn delete_calls_for_file_incremental(
    conn: &mut Connection,
    project_id: i64,
    file_id: i64,
) -> Result<()> {
    let tx = conn.transaction()?;

    // 1. Delete call relationships originating in this file
    tx.execute(
        "DELETE FROM call_relationships WHERE project_id = ?1 AND file_id = ?2",
        params![project_id, file_id],
    )?;

    // 2. Delete call relationships in other files that target symbols in this file
    tx.execute(
        "DELETE FROM call_relationships 
         WHERE project_id = ?1 
           AND callee_symbol_id IN (SELECT id FROM symbols WHERE file_id = ?2)",
        params![project_id, file_id],
    )?;

    // 3. Delete class instantiations originating in this file or targeting classes in this file
    tx.execute(
        "DELETE FROM class_instantiations WHERE project_id = ?1 AND file_id = ?2",
        params![project_id, file_id],
    )?;
    tx.execute(
        "DELETE FROM class_instantiations 
         WHERE project_id = ?1 
           AND class_symbol_id IN (SELECT id FROM symbols WHERE file_id = ?2)",
        params![project_id, file_id],
    )?;

    // 4. Delete functions and classes for this file
    tx.execute(
        "DELETE FROM functions WHERE project_id = ?1 AND file_id = ?2",
        params![project_id, file_id],
    )?;
    tx.execute(
        "DELETE FROM classes WHERE project_id = ?1 AND file_id = ?2",
        params![project_id, file_id],
    )?;

    tx.commit()?;
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CallDetailItem {
    pub id: i64,
    pub caller_symbol_id: Option<i64>,
    pub caller_name: Option<String>,
    pub caller_file_path: Option<String>,
    pub callee_symbol_id: Option<i64>,
    pub callee_name: String,
    pub callee_file_path: Option<String>,
    pub resolution_status: String,
    pub is_dynamic: bool,
    pub start_line: usize,
    pub end_line: usize,
    pub start_column: usize,
    pub end_column: usize,
    pub snippet: Option<String>,
    pub confidence: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InstantiationDetailItem {
    pub id: i64,
    pub caller_symbol_id: Option<i64>,
    pub caller_name: Option<String>,
    pub caller_file_path: Option<String>,
    pub class_symbol_id: Option<i64>,
    pub class_name: String,
    pub resolution_status: String,
    pub start_line: usize,
    pub end_line: usize,
    pub start_column: usize,
    pub end_column: usize,
    pub snippet: Option<String>,
    pub confidence: String,
}

pub fn get_function_by_symbol_id(conn: &Connection, symbol_id: i64) -> Result<Option<StoredFunction>> {
    let mut stmt = conn.prepare(
        "SELECT id, symbol_id, file_id, name, parameters_json, return_type,
                branch_count, loop_count, cyclomatic_complexity, has_error_handling,
                side_effects_json, imports_used_json, callers_json, callees_json, source_evidence_id
         FROM functions
         WHERE symbol_id = ?1",
    )?;

    let mut rows = stmt.query(params![symbol_id])?;
    if let Some(row) = rows.next()? {
        let params_json: String = row.get(4)?;
        let parameters: Vec<Parameter> = serde_json::from_str(&params_json).unwrap_or_default();

        let side_effects_json: String = row.get(10)?;
        let side_effects: Vec<SideEffectMarker> = serde_json::from_str(&side_effects_json).unwrap_or_default();

        let imports_json: String = row.get(11)?;
        let imports_used: Vec<String> = serde_json::from_str(&imports_json).unwrap_or_default();

        let callers_json: String = row.get(12)?;
        let callers: Vec<String> = serde_json::from_str(&callers_json).unwrap_or_default();

        let callees_json: String = row.get(13)?;
        let callees: Vec<String> = serde_json::from_str(&callees_json).unwrap_or_default();

        Ok(Some(StoredFunction {
            id: row.get(0)?,
            symbol_id: row.get(1)?,
            file_id: row.get(2)?,
            name: row.get(3)?,
            parameters,
            return_type: row.get(5)?,
            branch_count: row.get::<_, i64>(6)? as usize,
            loop_count: row.get::<_, i64>(7)? as usize,
            cyclomatic_complexity: row.get::<_, i64>(8)? as usize,
            has_error_handling: row.get::<_, i64>(9)? == 1,
            side_effects,
            imports_used,
            callers,
            callees,
            source_evidence_id: row.get(14)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn get_class_by_symbol_id(conn: &Connection, symbol_id: i64) -> Result<Option<StoredClass>> {
    let mut stmt = conn.prepare(
        "SELECT id, symbol_id, file_id, name, superclass_name, interfaces_json,
                properties_json, methods_json, constructors_json, source_evidence_id
         FROM classes
         WHERE symbol_id = ?1",
    )?;

    let mut rows = stmt.query(params![symbol_id])?;
    if let Some(row) = rows.next()? {
        let ifaces_json: String = row.get(5)?;
        let interfaces: Vec<String> = serde_json::from_str(&ifaces_json).unwrap_or_default();

        let props_json: String = row.get(6)?;
        let properties: Vec<ClassProperty> = serde_json::from_str(&props_json).unwrap_or_default();

        let methods_json: String = row.get(7)?;
        let methods: Vec<ClassMethod> = serde_json::from_str(&methods_json).unwrap_or_default();

        let ctors_json: String = row.get(8)?;
        let constructors: Vec<ClassConstructor> = serde_json::from_str(&ctors_json).unwrap_or_default();

        Ok(Some(StoredClass {
            id: row.get(0)?,
            symbol_id: row.get(1)?,
            file_id: row.get(2)?,
            name: row.get(3)?,
            superclass_name: row.get(4)?,
            interfaces,
            properties,
            methods,
            constructors,
            source_evidence_id: row.get(9)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn get_incoming_calls_for_symbol(conn: &Connection, symbol_id: i64) -> Result<Vec<CallDetailItem>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.caller_symbol_id, s_caller.name, f_caller.relative_path,
                c.callee_symbol_id, c.callee_name, f_callee.relative_path,
                c.resolution_status, c.is_dynamic,
                e.start_line, e.end_line, e.start_column, e.end_column, e.snippet, e.confidence
         FROM call_relationships c
         JOIN source_evidence e ON c.source_evidence_id = e.id
         LEFT JOIN symbols s_caller ON c.caller_symbol_id = s_caller.id
         LEFT JOIN files f_caller ON s_caller.file_id = f_caller.id
         LEFT JOIN symbols s_callee ON c.callee_symbol_id = s_callee.id
         LEFT JOIN files f_callee ON s_callee.file_id = f_callee.id
         WHERE c.callee_symbol_id = ?1
         ORDER BY e.start_line ASC, e.start_column ASC",
    )?;

    let rows = stmt.query_map(params![symbol_id], |row| {
        Ok(CallDetailItem {
            id: row.get(0)?,
            caller_symbol_id: row.get(1)?,
            caller_name: row.get(2)?,
            caller_file_path: row.get(3)?,
            callee_symbol_id: row.get(4)?,
            callee_name: row.get(5)?,
            callee_file_path: row.get(6)?,
            resolution_status: row.get(7)?,
            is_dynamic: row.get::<_, i64>(8)? == 1,
            start_line: row.get::<_, i64>(9)? as usize,
            end_line: row.get::<_, i64>(10)? as usize,
            start_column: row.get::<_, i64>(11)? as usize,
            end_column: row.get::<_, i64>(12)? as usize,
            snippet: row.get(13)?,
            confidence: row.get(14)?,
        })
    })?;

    let mut calls = Vec::new();
    for r in rows {
        calls.push(r?);
    }
    Ok(calls)
}

pub fn get_outgoing_calls_for_symbol(conn: &Connection, symbol_id: i64) -> Result<Vec<CallDetailItem>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.caller_symbol_id, s_caller.name, f_caller.relative_path,
                c.callee_symbol_id, c.callee_name, f_callee.relative_path,
                c.resolution_status, c.is_dynamic,
                e.start_line, e.end_line, e.start_column, e.end_column, e.snippet, e.confidence
         FROM call_relationships c
         JOIN source_evidence e ON c.source_evidence_id = e.id
         LEFT JOIN symbols s_caller ON c.caller_symbol_id = s_caller.id
         LEFT JOIN files f_caller ON s_caller.file_id = f_caller.id
         LEFT JOIN symbols s_callee ON c.callee_symbol_id = s_callee.id
         LEFT JOIN files f_callee ON s_callee.file_id = f_callee.id
         WHERE c.caller_symbol_id = ?1
         ORDER BY e.start_line ASC, e.start_column ASC",
    )?;

    let rows = stmt.query_map(params![symbol_id], |row| {
        Ok(CallDetailItem {
            id: row.get(0)?,
            caller_symbol_id: row.get(1)?,
            caller_name: row.get(2)?,
            caller_file_path: row.get(3)?,
            callee_symbol_id: row.get(4)?,
            callee_name: row.get(5)?,
            callee_file_path: row.get(6)?,
            resolution_status: row.get(7)?,
            is_dynamic: row.get::<_, i64>(8)? == 1,
            start_line: row.get::<_, i64>(9)? as usize,
            end_line: row.get::<_, i64>(10)? as usize,
            start_column: row.get::<_, i64>(11)? as usize,
            end_column: row.get::<_, i64>(12)? as usize,
            snippet: row.get(13)?,
            confidence: row.get(14)?,
        })
    })?;

    let mut calls = Vec::new();
    for r in rows {
        calls.push(r?);
    }
    Ok(calls)
}

pub fn get_instantiations_for_symbol(conn: &Connection, symbol_id: i64) -> Result<Vec<InstantiationDetailItem>> {
    let mut stmt = conn.prepare(
        "SELECT i.id, i.caller_symbol_id, s_caller.name, f_caller.relative_path,
                i.class_symbol_id, i.class_name,
                i.resolution_status,
                e.start_line, e.end_line, e.start_column, e.end_column, e.snippet, e.confidence
         FROM class_instantiations i
         JOIN source_evidence e ON i.source_evidence_id = e.id
         LEFT JOIN symbols s_caller ON i.caller_symbol_id = s_caller.id
         LEFT JOIN files f_caller ON s_caller.file_id = f_caller.id
         WHERE i.class_symbol_id = ?1 OR i.caller_symbol_id = ?1
         ORDER BY e.start_line ASC, e.start_column ASC",
    )?;

    let rows = stmt.query_map(params![symbol_id], |row| {
        Ok(InstantiationDetailItem {
            id: row.get(0)?,
            caller_symbol_id: row.get(1)?,
            caller_name: row.get(2)?,
            caller_file_path: row.get(3)?,
            class_symbol_id: row.get(4)?,
            class_name: row.get(5)?,
            resolution_status: row.get(6)?,
            start_line: row.get::<_, i64>(7)? as usize,
            end_line: row.get::<_, i64>(8)? as usize,
            start_column: row.get::<_, i64>(9)? as usize,
            end_column: row.get::<_, i64>(10)? as usize,
            snippet: row.get(11)?,
            confidence: row.get(12)?,
        })
    })?;

    let mut insts = Vec::new();
    for r in rows {
        insts.push(r?);
    }
    Ok(insts)
}
