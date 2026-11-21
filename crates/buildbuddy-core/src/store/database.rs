use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use crate::database::{DatabaseEngine, DatabaseSchema};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredDatabaseTable {
    pub name: String,
    pub file_path: String,
    pub start_line: i64,
    pub end_line: i64,
    pub confidence: String,
    pub source_evidence_id: i64,
    pub fields: Vec<StoredDatabaseField>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredDatabaseField {
    pub name: String,
    pub declared_type: String,
    pub is_primary_key: bool,
    pub is_foreign_key: bool,
    pub line: i64,
    pub source_evidence_id: i64,
}

pub struct DatabaseStore;

impl DatabaseStore {
    pub fn replace(conn: &mut Connection, project_id: i64, engines: &[DatabaseEngine], schemas: &[DatabaseSchema]) -> Result<()> {
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM database_engines WHERE project_id=?1", [project_id])?;
        tx.execute("DELETE FROM database_tables WHERE project_id=?1", [project_id])?;
        for engine in engines {
            let mut inserted = tx.execute(
                "INSERT INTO source_evidence (project_id,file_path,start_line,end_line,start_column,end_column,snippet,confidence,evidence_type)
                 VALUES (?1,?2,?3,?3,0,0,?4,?5,'source_pattern')",
                params![project_id, engine.file_path, engine.line, engine.snippet, engine.confidence],
            );
            if inserted.is_err() {
                inserted = tx.execute(
                    "INSERT INTO source_evidence (project_id,file_path,start_line,end_line,start_column,end_column,snippet,confidence,evidence_type)
                     VALUES (?1,?2,?3,?3,0,0,?4,?5,'heuristic')",
                    params![project_id, engine.file_path, engine.line, engine.snippet, engine.confidence],
                );
            }
            let evidence = match inserted {
                Ok(_) => tx.last_insert_rowid(),
                Err(_) => 0,
            };
            let ev_opt = if evidence > 0 { Some(evidence) } else { None };
            tx.execute(
                "INSERT INTO database_engines (project_id,name,file_path,line_number,confidence,source_evidence_id)
                 VALUES (?1,?2,?3,?4,?5,?6)",
                params![project_id, engine.name, engine.file_path, engine.line, engine.confidence, ev_opt],
            )?;
        }
        for schema in schemas {
            let mut inserted = tx.execute(
                "INSERT INTO source_evidence (project_id,file_path,start_line,end_line,start_column,end_column,snippet,confidence,evidence_type)
                 VALUES (?1,?2,?3,?4,0,0,?5,?6,'source_pattern')",
                params![project_id, schema.file_path, schema.start_line, schema.end_line, schema.snippet, schema.confidence],
            );
            if inserted.is_err() {
                inserted = tx.execute(
                    "INSERT INTO source_evidence (project_id,file_path,start_line,end_line,start_column,end_column,snippet,confidence,evidence_type)
                     VALUES (?1,?2,?3,?4,0,0,?5,?6,'heuristic')",
                    params![project_id, schema.file_path, schema.start_line, schema.end_line, schema.snippet, schema.confidence],
                );
            }
            let evidence = match inserted {
                Ok(_) => tx.last_insert_rowid(),
                Err(_) => 0,
            };
            let ev_opt = if evidence > 0 { Some(evidence) } else { None };
            tx.execute(
                "INSERT INTO database_tables (project_id,name,file_path,start_line,end_line,confidence,source_evidence_id)
                 VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![project_id, schema.table_name, schema.file_path, schema.start_line, schema.end_line, schema.confidence, ev_opt],
            )?;
            let table = tx.last_insert_rowid();
            for field in &schema.fields {
                let mut field_inserted = tx.execute(
                    "INSERT INTO source_evidence (project_id,file_path,start_line,end_line,start_column,end_column,snippet,confidence,evidence_type)
                     VALUES (?1,?2,?3,?3,0,0,?4,?5,'source_pattern')",
                    params![project_id, schema.file_path, field.line, field.name, schema.confidence],
                );
                if field_inserted.is_err() {
                    field_inserted = tx.execute(
                        "INSERT INTO source_evidence (project_id,file_path,start_line,end_line,start_column,end_column,snippet,confidence,evidence_type)
                         VALUES (?1,?2,?3,?3,0,0,?4,?5,'heuristic')",
                        params![project_id, schema.file_path, field.line, field.name, schema.confidence],
                    );
                }
                let field_evidence = match field_inserted {
                    Ok(_) => tx.last_insert_rowid(),
                    Err(_) => 0,
                };
                let field_ev_opt = if field_evidence > 0 { Some(field_evidence) } else { None };
                tx.execute(
                    "INSERT INTO database_fields (table_id,name,declared_type,is_primary_key,is_foreign_key,line_number,source_evidence_id)
                     VALUES (?1,?2,?3,?4,?5,?6,?7)",
                    params![table, field.name, field.declared_type, field.is_primary_key, field.is_foreign_key, field.line, field_ev_opt],
                )?;
            }
        }
        tx.commit()
    }

    pub fn get_tables(conn: &Connection, project_id: i64) -> Result<Vec<StoredDatabaseTable>> {
        let mut stmt = conn.prepare(
            "SELECT name,file_path,start_line,end_line,confidence,source_evidence_id,id
             FROM database_tables WHERE project_id=?1 ORDER BY file_path,start_line"
        )?;
        let rows = stmt.query_map([project_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, i64>(5)?,
                r.get::<_, i64>(6)?,
            ))
        })?;
        let mut out = Vec::new();
        for row in rows {
            let (name, file_path, start_line, end_line, confidence, evidence, id) = row?;
            let mut field_stmt = conn.prepare(
                "SELECT name,declared_type,is_primary_key,is_foreign_key,line_number,source_evidence_id
                 FROM database_fields WHERE table_id=?1 ORDER BY line_number"
            )?;
            let fields = field_stmt.query_map([id], |r| {
                Ok(StoredDatabaseField {
                    name: r.get(0)?,
                    declared_type: r.get(1)?,
                    is_primary_key: r.get::<_, i64>(2)? != 0,
                    is_foreign_key: r.get::<_, i64>(3)? != 0,
                    line: r.get(4)?,
                    source_evidence_id: r.get(5)?,
                })
            })?.collect::<Result<Vec<_>>>()?;
            out.push(StoredDatabaseTable {
                name,
                file_path,
                start_line,
                end_line,
                confidence,
                source_evidence_id: evidence,
                fields,
            });
        }
        Ok(out)
    }
}
