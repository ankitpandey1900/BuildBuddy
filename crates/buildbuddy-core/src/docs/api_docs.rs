use rusqlite::{params, Connection, Result};

use crate::docs::model::{drop_secret_sentences, DocumentSection, DocumentType, GeneratedDocument};

pub struct ApiDocGenerator;

impl ApiDocGenerator {
    pub fn generate(conn: &Connection, project_id: i64) -> Result<GeneratedDocument> {
        let project_name: String = conn.query_row(
            "SELECT name FROM projects WHERE id = ?1",
            params![project_id],
            |r| r.get(0),
        )?;

        let mut sections = Vec::new();
        let mut sort_order = 10;

        // 1. Overview
        let (overview_content, overview_ev) = Self::generate_overview(conn, project_id)?;
        sections.push(DocumentSection::new(
            "overview",
            "API Architecture Overview",
            sort_order,
            drop_secret_sentences(&overview_content),
            overview_ev,
        ));
        sort_order += 10;

        // 2. Endpoints Inventory
        let (endpoints_content, endpoints_ev) = Self::generate_endpoints(conn, project_id)?;
        sections.push(DocumentSection::new(
            "endpoints",
            "HTTP Endpoints Inventory",
            sort_order,
            drop_secret_sentences(&endpoints_content),
            endpoints_ev,
        ));

        Ok(GeneratedDocument {
            doc_type: DocumentType::ApiDocumentation,
            title: format!("API Documentation: {}", project_name),
            sections,
        })
    }

    fn generate_overview(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut evidence = Vec::new();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM api_endpoints WHERE project_id = ?1",
            params![project_id],
            |r| r.get(0),
        ).unwrap_or(0);

        let frameworks: Vec<String> = {
            let mut stmt = conn.prepare(
                "SELECT DISTINCT framework FROM api_endpoints WHERE project_id = ?1 ORDER BY framework ASC",
            )?;
            let rows = stmt.query_map(params![project_id], |r| r.get(0))?;
            rows.collect::<Result<Vec<_>>>()?
        };

        let mut text = String::from("### HTTP API Overview\n\n");
        text.push_str(&format!("BuildBuddy identified **{}** HTTP API endpoints in this project.\n\n", count));
        if !frameworks.is_empty() {
            text.push_str(&format!("Detected API frameworks: **{}**.\n", frameworks.join(", ")));
            evidence.push(format!("api-frameworks:{}", frameworks.join(",")));
        }

        Ok((text, evidence))
    }

    fn generate_endpoints(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut evidence = Vec::new();
        let mut text = String::from("### Endpoints\n\n");

        let endpoints: Vec<(String, String, String, Option<String>, String, i64, String)> = {
            let mut stmt = conn.prepare(
                "SELECT framework, method, route, controller_name, file_path, start_line, confidence
                 FROM api_endpoints
                 WHERE project_id = ?1
                 ORDER BY file_path ASC, start_line ASC, method ASC",
            )?;
            let rows = stmt.query_map(params![project_id], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?))
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };

        if endpoints.is_empty() {
            text.push_str("No HTTP API routes detected in the indexed source files.\n");
        } else {
            text.push_str("| Method | Route | Controller | Declaration | Framework | Confidence |\n");
            text.push_str("|---|---|---|---|---|---|\n");
            for (fw, method, route, ctrl, fp, line, conf) in &endpoints {
                let norm = fp.replace('\\', "/");
                let ctrl_str = ctrl.as_deref().unwrap_or("-");
                text.push_str(&format!(
                    "| `{}` | `{}` | `{}` | `{}:{}` | {} | {} |\n",
                    method, route, ctrl_str, norm, line, fw, conf
                ));
                evidence.push(format!("{}:{}-endpoint", norm, line));
            }
            text.push('\n');
        }

        Ok((text, evidence))
    }
}
