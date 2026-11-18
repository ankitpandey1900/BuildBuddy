use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

use crate::api::ApiEndpoint;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StoredApiEndpoint {
    pub id: i64,
    pub framework: String,
    pub method: String,
    pub route: String,
    pub controller_name: Option<String>,
    pub file_path: String,
    pub start_line: i64,
    pub end_line: i64,
    pub snippet: String,
    pub confidence: String,
    pub source_evidence_id: i64,
}

pub struct ApiStore;

impl ApiStore {
    pub fn replace_endpoints(conn: &mut Connection, project_id: i64, endpoints: &[ApiEndpoint]) -> Result<()> {
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM api_endpoints WHERE project_id = ?1", [project_id])?;
        for endpoint in endpoints {
            tx.execute(
                "INSERT INTO source_evidence (project_id, file_path, start_line, end_line, start_column, end_column, snippet, confidence, evidence_type)
                 VALUES (?1, ?2, ?3, ?4, 0, 0, ?5, ?6, 'source_pattern')",
                params![project_id, endpoint.file_path, endpoint.start_line, endpoint.end_line, endpoint.snippet, endpoint.confidence],
            )?;
            let evidence_id = tx.last_insert_rowid();
            tx.execute(
                "INSERT INTO api_endpoints (project_id, framework, method, route, controller_name, file_path, start_line, end_line, confidence, source_evidence_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![project_id, endpoint.framework, endpoint.method, endpoint.route, endpoint.controller_name, endpoint.file_path, endpoint.start_line, endpoint.end_line, endpoint.confidence, evidence_id],
            )?;
        }
        tx.commit()
    }

    pub fn get_endpoints(conn: &Connection, project_id: i64) -> Result<Vec<StoredApiEndpoint>> {
        let mut stmt = conn.prepare(
            "SELECT e.id, e.framework, e.method, e.route, e.controller_name, e.file_path, e.start_line, e.end_line,
                    se.snippet, e.confidence, e.source_evidence_id
             FROM api_endpoints e JOIN source_evidence se ON se.id = e.source_evidence_id
             WHERE e.project_id = ?1 ORDER BY e.file_path, e.start_line, e.method, e.route",
        )?;
        let endpoints = stmt.query_map([project_id], |row| Ok(StoredApiEndpoint {
            id: row.get(0)?, framework: row.get(1)?, method: row.get(2)?, route: row.get(3)?, controller_name: row.get(4)?,
            file_path: row.get(5)?, start_line: row.get(6)?, end_line: row.get(7)?, snippet: row.get(8)?, confidence: row.get(9)?, source_evidence_id: row.get(10)?,
        }))?.collect();
        endpoints
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::{connection::open_in_memory, migrations::run_migrations};

    #[test]
    fn persists_only_endpoints_with_evidence() {
        let mut conn = open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn.execute("INSERT INTO projects (id, name, root_path) VALUES (1, 'fixture', '/fixture')", []).unwrap();
        ApiStore::replace_endpoints(&mut conn, 1, &[ApiEndpoint {
            framework: "Express".into(), method: "GET".into(), route: "/health".into(), controller_name: None,
            file_path: "src/server.ts".into(), start_line: 8, end_line: 8, snippet: "app.get('/health', handler)".into(), confidence: "static".into(),
        }]).unwrap();
        let endpoints = ApiStore::get_endpoints(&conn, 1).unwrap();
        assert_eq!(endpoints.len(), 1);
        assert!(endpoints[0].source_evidence_id > 0);
    }
}
