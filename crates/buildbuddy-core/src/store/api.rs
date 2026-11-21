use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

use crate::api::{ApiEndpoint, ClientApiCall};

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
    #[serde(default)]
    pub caller_files: Vec<String>,
    #[serde(default)]
    pub affected_models: Vec<String>,
    #[serde(default)]
    pub downstream_packages: Vec<String>,
    #[serde(default)]
    pub blast_radius: String,
}

pub struct ApiStore;

impl ApiStore {
    pub fn replace_endpoints(
        conn: &mut Connection,
        project_id: i64,
        endpoints: &[ApiEndpoint],
        client_calls: &[ClientApiCall],
    ) -> Result<()> {
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM api_endpoints WHERE project_id = ?1", [project_id])?;
        tx.execute(
            "CREATE TABLE IF NOT EXISTS api_client_calls (
                id INTEGER PRIMARY KEY,
                project_id INTEGER NOT NULL,
                caller_file TEXT NOT NULL,
                line_number INTEGER NOT NULL,
                route TEXT NOT NULL,
                method TEXT,
                snippet TEXT
            )",
            [],
        )?;
        tx.execute("DELETE FROM api_client_calls WHERE project_id = ?1", [project_id])?;

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

        for call in client_calls {
            tx.execute(
                "INSERT INTO api_client_calls (project_id, caller_file, line_number, route, method, snippet)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![project_id, call.caller_file, call.line_number, call.route, call.method, call.snippet],
            )?;
        }

        tx.commit()
    }

    pub fn get_endpoints(conn: &Connection, project_id: i64) -> Result<Vec<StoredApiEndpoint>> {
        let mut client_calls_map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
        let has_calls_table: bool = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='api_client_calls'",
            [],
            |r| r.get::<_, i64>(0),
        ).unwrap_or(0) > 0;

        if has_calls_table {
            let mut call_stmt = conn.prepare(
                "SELECT caller_file, line_number, route FROM api_client_calls WHERE project_id = ?1 ORDER BY caller_file ASC, line_number ASC"
            )?;
            let call_rows = call_stmt.query_map([project_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, String>(2)?))
            })?;
            for r in call_rows {
                if let Ok((cf, ln, rt)) = r {
                    client_calls_map.entry(rt).or_default().push(format!("{}:{}", cf, ln));
                }
            }
        }

        let mut db_tables = Vec::new();
        let has_db_table: bool = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='database_tables'",
            [],
            |r| r.get::<_, i64>(0),
        ).unwrap_or(0) > 0;
        if has_db_table {
            let mut tbl_stmt = conn.prepare("SELECT name FROM database_tables WHERE project_id = ?1")?;
            let tbl_rows = tbl_stmt.query_map([project_id], |r| r.get::<_, String>(0))?;
            for r in tbl_rows {
                if let Ok(name) = r {
                    db_tables.push(name);
                }
            }
        }

        let mut stmt = conn.prepare(
            "SELECT e.id, e.framework, e.method, e.route, e.controller_name, e.file_path, e.start_line, e.end_line,
                    se.snippet, e.confidence, e.source_evidence_id
             FROM api_endpoints e JOIN source_evidence se ON se.id = e.source_evidence_id
             WHERE e.project_id = ?1 ORDER BY e.file_path, e.start_line, e.method, e.route",
        )?;
        let endpoints: Vec<StoredApiEndpoint> = stmt.query_map([project_id], |row| {
            let id: i64 = row.get(0)?;
            let framework: String = row.get(1)?;
            let method: String = row.get(2)?;
            let route: String = row.get(3)?;
            let controller_name: Option<String> = row.get(4)?;
            let file_path: String = row.get(5)?;
            let start_line: i64 = row.get(6)?;
            let end_line: i64 = row.get(7)?;
            let snippet: String = row.get(8)?;
            let confidence: String = row.get(9)?;
            let source_evidence_id: i64 = row.get(10)?;

            let mut callers = Vec::new();
            for (call_route, caller_list) in &client_calls_map {
                if call_route == &route || call_route.starts_with(&format!("{}/", route.trim_end_matches('/'))) {
                    callers.extend(caller_list.clone());
                }
            }
            callers.sort();
            callers.dedup();

            let mut affected = Vec::new();
            let route_lower = route.to_lowercase();
            let snippet_lower = snippet.to_lowercase();
            for tbl in &db_tables {
                let tbl_lower = tbl.to_lowercase();
                if route_lower.contains(&tbl_lower) || snippet_lower.contains(&tbl_lower) {
                    affected.push(tbl.clone());
                }
            }
            affected.sort();
            affected.dedup();

            let blast_radius = if callers.len() >= 3 || affected.len() >= 2 {
                "critical".to_string()
            } else if !callers.is_empty() || !affected.is_empty() {
                "warning".to_string()
            } else {
                "low".to_string()
            };

            Ok(StoredApiEndpoint {
                id,
                framework,
                method,
                route,
                controller_name,
                file_path,
                start_line,
                end_line,
                snippet,
                confidence,
                source_evidence_id,
                caller_files: callers,
                affected_models: affected,
                downstream_packages: Vec::new(),
                blast_radius,
            })
        })?.collect::<Result<Vec<_>>>()?;

        Ok(endpoints)
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
        }], &[ClientApiCall {
            caller_file: "src/client.ts".into(),
            line_number: 12,
            route: "/health".into(),
            method: Some("GET".into()),
            snippet: "fetch('/health')".into(),
        }]).unwrap();
        let endpoints = ApiStore::get_endpoints(&conn, 1).unwrap();
        assert_eq!(endpoints.len(), 1);
        assert!(endpoints[0].source_evidence_id > 0);
        assert_eq!(endpoints[0].caller_files, vec!["src/client.ts:12"]);
        assert_eq!(endpoints[0].blast_radius, "warning");
    }
}
