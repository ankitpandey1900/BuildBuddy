use rusqlite::{params, Connection, Result};

use crate::docs::model::{drop_secret_sentences, DocumentSection, DocumentType, GeneratedDocument};

pub struct LowLevelDesignGenerator;

impl LowLevelDesignGenerator {
    pub fn generate(conn: &Connection, project_id: i64) -> Result<GeneratedDocument> {
        let project_name: String = conn.query_row(
            "SELECT name FROM projects WHERE id = ?1",
            params![project_id],
            |r| r.get(0),
        )?;

        let mut sections = Vec::new();
        let mut sort_order = 10;

        // 1. Module Decomposition
        let (mod_content, mod_ev) = Self::generate_module_decomposition(conn, project_id)?;
        sections.push(DocumentSection::new(
            "module_decomposition",
            "Module Structure",
            sort_order,
            drop_secret_sentences(&mod_content),
            mod_ev,
        ));
        sort_order += 10;

        // 2. Classes and Interfaces
        let (cls_content, cls_ev) = Self::generate_classes(conn, project_id)?;
        sections.push(DocumentSection::new(
            "classes_and_interfaces",
            "Classes & Object Model",
            sort_order,
            drop_secret_sentences(&cls_content),
            cls_ev,
        ));
        sort_order += 10;

        // 3. Key Functions & Complexity
        let (fn_content, fn_ev) = Self::generate_key_functions(conn, project_id)?;
        sections.push(DocumentSection::new(
            "key_functions",
            "Key Functions & Complexity Metrics",
            sort_order,
            drop_secret_sentences(&fn_content),
            fn_ev,
        ));
        sort_order += 10;

        // 4. Internal Call Paths
        let (call_content, call_ev) = Self::generate_call_paths(conn, project_id)?;
        sections.push(DocumentSection::new(
            "call_paths",
            "Internal Call Dependencies",
            sort_order,
            drop_secret_sentences(&call_content),
            call_ev,
        ));

        Ok(GeneratedDocument {
            doc_type: DocumentType::LowLevelDesign,
            title: format!("Low-Level Design: {}", project_name),
            sections,
        })
    }

    fn generate_module_decomposition(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut evidence = Vec::new();
        let mut text = String::from("### Source Modules & Files\n\n");

        let files: Vec<(String, String, i64)> = {
            let mut stmt = conn.prepare(
                "SELECT relative_path, file_name, size_bytes FROM files WHERE project_id = ?1 ORDER BY relative_path ASC LIMIT 50",
            )?;
            let rows = stmt.query_map(params![project_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
            rows.collect::<Result<Vec<_>>>()?
        };

        if files.is_empty() {
            text.push_str("No indexed files found in this project.\n");
        } else {
            text.push_str("| File Path | Size (bytes) |\n");
            text.push_str("|---|---|\n");
            for (rp, _fn, size) in &files {
                let norm = rp.replace('\\', "/");
                text.push_str(&format!("| `{}` | {} |\n", norm, size));
                evidence.push(format!("{}-file", norm));
            }
            text.push('\n');
        }

        Ok((text, evidence))
    }

    fn generate_classes(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut evidence = Vec::new();
        let mut text = String::from("### Declared Classes\n\n");

        let classes: Vec<(String, Option<String>, String, i64)> = {
            let mut stmt = conn.prepare(
                "SELECT s.name, c.superclass_name, f.relative_path, COALESCE(se.start_line, 0)
                 FROM classes c
                 JOIN symbols s ON c.symbol_id = s.id
                 JOIN files f ON c.file_id = f.id
                 LEFT JOIN source_evidence se ON c.source_evidence_id = se.id
                 WHERE c.project_id = ?1
                 ORDER BY s.name ASC",
            )?;
            let rows = stmt.query_map(params![project_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?;
            rows.collect::<Result<Vec<_>>>()?
        };

        if classes.is_empty() {
            text.push_str("No object-oriented class structures identified.\n");
        } else {
            text.push_str("| Class | Superclass | Declared In |\n");
            text.push_str("|---|---|---|\n");
            for (name, superclass, rp, line) in &classes {
                let norm = rp.replace('\\', "/");
                let super_str = superclass.as_deref().unwrap_or("-");
                text.push_str(&format!("| **{}** | `{}` | `{}:{}` |\n", name, super_str, norm, line));
                evidence.push(format!("{}:{}-class", norm, line));
            }
            text.push('\n');
        }

        Ok((text, evidence))
    }

    fn generate_key_functions(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut evidence = Vec::new();
        let mut text = String::from("### Functions with High Cyclomatic Complexity\n\n");

        let functions: Vec<(String, i64, Option<String>, String, i64)> = {
            let mut stmt = conn.prepare(
                "SELECT f.name, f.cyclomatic_complexity, f.return_type, files.relative_path, COALESCE(se.start_line, 0)
                 FROM functions f
                 JOIN symbols s ON f.symbol_id = s.id
                 JOIN files ON f.file_id = files.id
                 LEFT JOIN source_evidence se ON f.source_evidence_id = se.id
                 WHERE f.project_id = ?1 AND f.cyclomatic_complexity >= 5
                 ORDER BY f.cyclomatic_complexity DESC, f.name ASC LIMIT 20",
            )?;
            let rows = stmt.query_map(params![project_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)))?;
            rows.collect::<Result<Vec<_>>>()?
        };

        if functions.is_empty() {
            text.push_str("All parsed functions have low cyclomatic complexity (< 5).\n");
        } else {
            text.push_str("| Function | Complexity | Return Type | Source File |\n");
            text.push_str("|---|---|---|---|\n");
            for (name, comp, ret_opt, rp, line) in &functions {
                let norm = rp.replace('\\', "/");
                let ret = ret_opt.as_deref().unwrap_or("void");
                text.push_str(&format!("| `{}` | {} | `{}` | `{}:{}` |\n", name, comp, ret, norm, line));
                evidence.push(format!("{}:{}-function", norm, line));
            }
            text.push('\n');
        }

        Ok((text, evidence))
    }

    fn generate_call_paths(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut evidence = Vec::new();
        let mut text = String::from("### Function Call Dependencies\n\n");

        let calls: Vec<(Option<String>, String, String, String)> = {
            let mut stmt = conn.prepare(
                "SELECT cs.name, c.callee_name, c.resolution_status, f.relative_path
                 FROM call_relationships c
                 JOIN files f ON c.file_id = f.id
                 LEFT JOIN symbols cs ON c.caller_symbol_id = cs.id
                 WHERE c.project_id = ?1
                 ORDER BY c.id ASC LIMIT 25",
            )?;
            let rows = stmt.query_map(params![project_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?;
            rows.collect::<Result<Vec<_>>>()?
        };

        if calls.is_empty() {
            text.push_str("No function call relationships recorded.\n");
        } else {
            text.push_str("| Caller | Callee | Resolution | File |\n");
            text.push_str("|---|---|---|---|\n");
            for (caller_opt, callee, res, rp) in &calls {
                let norm = rp.replace('\\', "/");
                let caller = caller_opt.as_deref().unwrap_or("<top-level>");
                text.push_str(&format!("| `{}` | `{}` | {} | `{}` |\n", caller, callee, res, norm));
                evidence.push(format!("{}-call", norm));
            }
            text.push('\n');
        }

        Ok((text, evidence))
    }
}
