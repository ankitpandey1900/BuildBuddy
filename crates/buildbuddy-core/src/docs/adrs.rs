use std::fs;
use std::path::Path;
use rusqlite::{params, Connection, Result};

use crate::docs::model::{drop_secret_sentences, DocumentSection, DocumentType, GeneratedDocument};

pub struct AdrGenerator;

impl AdrGenerator {
    pub fn generate(conn: &Connection, project_id: i64) -> Result<GeneratedDocument> {
        let (project_name, root_path): (String, String) = conn.query_row(
            "SELECT name, root_path FROM projects WHERE id = ?1",
            params![project_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;

        let mut sections = Vec::new();
        let (log_content, log_ev) = Self::generate_adr_log(&root_path)?;
        sections.push(DocumentSection::new(
            "decision_records",
            "Architecture Decisions",
            10,
            drop_secret_sentences(&log_content),
            log_ev,
        ));

        Ok(GeneratedDocument {
            doc_type: DocumentType::ArchitectureDecisionRecords,
            title: format!("Architecture Decision Records (ADRs): {}", project_name),
            sections,
        })
    }

    fn generate_adr_log(root_path: &str) -> Result<(String, Vec<String>)> {
        let mut evidence = Vec::new();
        let mut text = String::from("### Architectural Decision Log\n\n");

        // Check if project has docs/DECISIONS.md or similar ADR files
        let decisions_path = Path::new(root_path).join("docs").join("DECISIONS.md");
        if decisions_path.exists() {
            if let Ok(content) = fs::read_to_string(&decisions_path) {
                text.push_str("Derived from project `docs/DECISIONS.md`:\n\n");
                evidence.push("docs/DECISIONS.md:1-adr".to_string());
                text.push_str(&content);
                return Ok((text, evidence));
            }
        }

        text.push_str("No `docs/DECISIONS.md` file found in the project root. Create architectural decision records using the template below:\n\n");
        text.push_str("#### ADR Template\n\n");
        text.push_str("- **Title**: [Short description of decision]\n");
        text.push_str("- **Status**: Proposed | Accepted | Deprecated | Superseded\n");
        text.push_str("- **Context**: [What is the problem being solved?]\n");
        text.push_str("- **Decision**: [What choice was made?]\n");
        text.push_str("- **Consequences**: [Trade-offs and architectural outcomes]\n\n");

        Ok((text, evidence))
    }
}
