use rusqlite::{params, Connection, Result};

use crate::docs::model::{drop_secret_sentences, DocumentSection, DocumentType, GeneratedDocument};

pub struct DatabaseDocGenerator;

impl DatabaseDocGenerator {
    pub fn generate(conn: &Connection, project_id: i64) -> Result<GeneratedDocument> {
        let project_name: String = conn.query_row(
            "SELECT name FROM projects WHERE id = ?1",
            params![project_id],
            |r| r.get(0),
        )?;

        let mut sections = Vec::new();
        let mut sort_order = 10;

        // 1. Engines
        let (engine_content, engine_ev) = Self::generate_engines(conn, project_id)?;
        sections.push(DocumentSection::new(
            "engines",
            "Database Engines",
            sort_order,
            drop_secret_sentences(&engine_content),
            engine_ev,
        ));
        sort_order += 10;

        // 2. Tables & Fields
        let (schema_content, schema_ev) = Self::generate_tables(conn, project_id)?;
        sections.push(DocumentSection::new(
            "schema_tables",
            "Tables & Fields",
            sort_order,
            drop_secret_sentences(&schema_content),
            schema_ev,
        ));

        Ok(GeneratedDocument {
            doc_type: DocumentType::DatabaseDocumentation,
            title: format!("Database Documentation: {}", project_name),
            sections,
        })
    }

    fn generate_engines(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut evidence = Vec::new();
        let mut text = String::from("### Declared Database Engines\n\n");

        let engines: Vec<(String, String, i64, String)> = {
            let mut stmt = conn.prepare(
                "SELECT name, file_path, line_number, confidence FROM database_engines WHERE project_id = ?1 ORDER BY name ASC",
            )?;
            let rows = stmt.query_map(params![project_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?;
            rows.collect::<Result<Vec<_>>>()?
        };

        if engines.is_empty() {
            text.push_str("No explicit database engines detected from dependency manifests or imports.\n");
        } else {
            text.push_str("| Engine | Declaration | Confidence |\n");
            text.push_str("|---|---|---|\n");
            for (name, fp, line, conf) in &engines {
                let norm = fp.replace('\\', "/");
                text.push_str(&format!("| **{}** | `{}:{}` | {} |\n", name, norm, line, conf));
                evidence.push(format!("{}:{}-engine", norm, line));
            }
            text.push('\n');
        }

        Ok((text, evidence))
    }

    fn generate_tables(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut evidence = Vec::new();
        let mut text = String::from("### Relational Schemas\n\n");

        let tables: Vec<(i64, String, String, i64, i64)> = {
            let mut stmt = conn.prepare(
                "SELECT id, name, file_path, start_line, end_line FROM database_tables WHERE project_id = ?1 ORDER BY name ASC",
            )?;
            let rows = stmt.query_map(params![project_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)))?;
            rows.collect::<Result<Vec<_>>>()?
        };

        if tables.is_empty() {
            text.push_str("No explicit SQL CREATE TABLE declarations were found in the analyzed files.\n");
        } else {
            for (table_id, name, fp, sl, _el) in &tables {
                let norm = fp.replace('\\', "/");
                text.push_str(&format!("#### Table: `{}`\n\n", name));
                text.push_str(&format!("Declared in `{}:{}`\n\n", norm, sl));
                evidence.push(format!("{}:{}-table", norm, sl));

                let fields: Vec<(String, String, bool, bool, i64)> = {
                    let mut stmt = conn.prepare(
                        "SELECT name, declared_type, is_primary_key, is_foreign_key, line_number FROM database_fields WHERE table_id = ?1 ORDER BY line_number ASC",
                    )?;
                    let rows = stmt.query_map(params![table_id], |r| {
                        Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2)? != 0, r.get::<_, i64>(3)? != 0, r.get(4)?))
                    })?;
                    rows.collect::<Result<Vec<_>>>()?
                };

                if fields.is_empty() {
                    text.push_str("*No fields parsed for this table.*\n\n");
                } else {
                    text.push_str("| Column | Type | Primary Key | Foreign Key | Line |\n");
                    text.push_str("|---|---|---|---|---|\n");
                    for (fname, ftype, is_pk, is_fk, fline) in &fields {
                        let pk_str = if *is_pk { "Yes" } else { "-" };
                        let fk_str = if *is_fk { "Yes" } else { "-" };
                        text.push_str(&format!("| `{}` | `{}` | {} | {} | {} |\n", fname, ftype, pk_str, fk_str, fline));
                    }
                    text.push('\n');
                }
            }
        }

        Ok((text, evidence))
    }
}
