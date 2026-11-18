use rusqlite::{params, Connection, Result};

use crate::docs::model::{drop_secret_sentences, DocumentSection, DocumentType, GeneratedDocument};

pub struct SecurityReportGenerator;

impl SecurityReportGenerator {
    pub fn generate(conn: &Connection, project_id: i64) -> Result<GeneratedDocument> {
        let project_name: String = conn.query_row(
            "SELECT name FROM projects WHERE id = ?1",
            params![project_id],
            |r| r.get(0),
        )?;

        let mut sections = Vec::new();
        let mut sort_order = 10;

        // 1. Executive Summary
        let (summary_content, summary_ev) = Self::generate_summary(conn, project_id)?;
        sections.push(DocumentSection::new(
            "summary",
            "Executive Security Summary",
            sort_order,
            drop_secret_sentences(&summary_content),
            summary_ev,
        ));
        sort_order += 10;

        // 2. Findings Inventory
        let (findings_content, findings_ev) = Self::generate_findings(conn, project_id)?;
        sections.push(DocumentSection::new(
            "findings",
            "Security Findings Inventory",
            sort_order,
            drop_secret_sentences(&findings_content),
            findings_ev,
        ));
        sort_order += 10;

        // 3. Remediation Guidance
        let (guidance_content, guidance_ev) = Self::generate_remediation(conn, project_id)?;
        sections.push(DocumentSection::new(
            "remediation",
            "Remediation Guidance",
            sort_order,
            drop_secret_sentences(&guidance_content),
            guidance_ev,
        ));

        Ok(GeneratedDocument {
            doc_type: DocumentType::SecurityReport,
            title: format!("Security Audit Report: {}", project_name),
            sections,
        })
    }

    fn generate_summary(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut evidence = Vec::new();

        let total_security: i64 = conn.query_row(
            "SELECT COUNT(*) FROM findings
             WHERE project_id = ?1 AND category = 'security'",
            params![project_id],
            |r| r.get(0),
        ).unwrap_or(0);

        let high_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM findings
             WHERE project_id = ?1 AND severity IN ('critical', 'high') AND category = 'security'",
            params![project_id],
            |r| r.get(0),
        ).unwrap_or(0);

        let med_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM findings
             WHERE project_id = ?1 AND severity = 'medium' AND category = 'security'",
            params![project_id],
            |r| r.get(0),
        ).unwrap_or(0);

        let mut text = String::from("### Security Assessment Summary\n\n");
        text.push_str(&format!(
            "Static analysis identified **{}** security-sensitive findings across the repository.\n\n",
            total_security
        ));
        text.push_str(&format!("- High Severity: **{}**\n", high_count));
        text.push_str(&format!("- Medium Severity: **{}**\n\n", med_count));

        if total_security == 0 {
            text.push_str("No hardcoded secrets, dangerous execution sinks, or disabled TLS configurations were detected.\n");
        } else {
            text.push_str("Review the specific findings below to isolate vulnerabilities prior to production deployment.\n");
            evidence.push(format!("security-findings:{}", total_security));
        }

        Ok((text, evidence))
    }

    fn generate_findings(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut evidence = Vec::new();
        let mut text = String::from("### Detected Security Issues\n\n");

        let mut stmt = conn.prepare(
            "SELECT f.category, f.title, f.description, f.severity, f.confidence,
                    COALESCE(se.file_path, 'unknown'), COALESCE(se.start_line, 0)
             FROM findings f
             LEFT JOIN source_evidence se ON f.source_evidence_id = se.id
             WHERE f.project_id = ?1 AND f.category = 'security'
             ORDER BY CASE f.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, f.id ASC",
        )?;

        let rows = stmt.query_map(params![project_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, i64>(6)?,
            ))
        })?;

        let findings: Vec<_> = rows.collect::<Result<Vec<_>>>()?;

        if findings.is_empty() {
            text.push_str("No security issues detected.\n");
        } else {
            text.push_str("| Severity | Category | Title | File Location | Line | Confidence |\n");
            text.push_str("|---|---|---|---|---|---|\n");
            for (cat, title, _desc, sev, conf, path, line) in &findings {
                let norm = path.replace('\\', "/");
                text.push_str(&format!(
                    "| `{}` | {} | {} | `{}` | {} | {} |\n",
                    sev.to_uppercase(), cat, title, norm, line, conf
                ));
                evidence.push(format!("{}:{}:{}", norm, line, cat));
            }
        }

        Ok((text, evidence))
    }

    fn generate_remediation(_conn: &Connection, _project_id: i64) -> Result<(String, Vec<String>)> {
        let mut text = String::from("### Security Remediation Guidance\n\n");
        text.push_str("1. **Credential Management**: Store API keys, tokens, and private certificates in environment variables or external secrets managers (e.g. HashiCorp Vault, AWS Secrets Manager). Never commit plaintext credentials to source control.\n");
        text.push_str("2. **Dynamic Code Execution**: Avoid `eval()`, `new Function()`, or dynamic execution sinks. Parse structured input with validated parsers (e.g., `JSON.parse` or schema validators).\n");
        text.push_str("3. **Transport Layer Security**: Ensure TLS verification flags (`rejectUnauthorized`, `verify=False`) remain strictly enabled in all production network clients.\n");

        Ok((text, Vec::new()))
    }
}
