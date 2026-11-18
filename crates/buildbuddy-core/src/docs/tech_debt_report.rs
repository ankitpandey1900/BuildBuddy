use rusqlite::{params, Connection, Result};

use crate::docs::model::{drop_secret_sentences, DocumentSection, DocumentType, GeneratedDocument};

pub struct TechDebtReportGenerator;

impl TechDebtReportGenerator {
    pub fn generate(conn: &Connection, project_id: i64) -> Result<GeneratedDocument> {
        let project_name: String = conn.query_row(
            "SELECT name FROM projects WHERE id = ?1",
            params![project_id],
            |r| r.get(0),
        )?;

        let mut sections = Vec::new();
        let mut sort_order = 10;

        // 1. Debt Summary
        let (summary_content, summary_ev) = Self::generate_summary(conn, project_id)?;
        sections.push(DocumentSection::new(
            "summary",
            "Technical Debt Summary",
            sort_order,
            drop_secret_sentences(&summary_content),
            summary_ev,
        ));
        sort_order += 10;

        // 2. High-Complexity Hotspots
        let (hotspots_content, hotspots_ev) = Self::generate_complexity_hotspots(conn, project_id)?;
        sections.push(DocumentSection::new(
            "complexity_hotspots",
            "High-Complexity Hotspots",
            sort_order,
            drop_secret_sentences(&hotspots_content),
            hotspots_ev,
        ));
        sort_order += 10;

        // 3. Structural & Dependency Debt
        let (dep_content, dep_ev) = Self::generate_dependency_debt(conn, project_id)?;
        sections.push(DocumentSection::new(
            "dependency_debt",
            "Architectural & Dependency Debt",
            sort_order,
            drop_secret_sentences(&dep_content),
            dep_ev,
        ));
        sort_order += 10;

        // 4. Code Quality & Reliability Risk
        let (quality_content, quality_ev) = Self::generate_quality_debt(conn, project_id)?;
        sections.push(DocumentSection::new(
            "quality_debt",
            "Code Quality & Reliability Risks",
            sort_order,
            drop_secret_sentences(&quality_content),
            quality_ev,
        ));

        Ok(GeneratedDocument {
            doc_type: DocumentType::TechnicalDebtReport,
            title: format!("Technical Debt Report: {}", project_name),
            sections,
        })
    }

    fn generate_summary(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut evidence = Vec::new();

        let complexity_hotspots: i64 = conn.query_row(
            "SELECT COUNT(*) FROM functions
             WHERE project_id = ?1 AND cyclomatic_complexity >= 10",
            params![project_id],
            |r| r.get(0),
        ).unwrap_or(0);

        let circular_cycles: i64 = conn.query_row(
            "SELECT COUNT(*) FROM findings
             WHERE project_id = ?1 AND category = 'circular_dependency'",
            params![project_id],
            |r| r.get(0),
        ).unwrap_or(0);

        let quality_findings: i64 = conn.query_row(
            "SELECT COUNT(*) FROM findings
             WHERE project_id = ?1 AND category = 'dead_code'",
            params![project_id],
            |r| r.get(0),
        ).unwrap_or(0);

        let mut text = String::from("### Technical Debt Overview\n\n");
        text.push_str("Summary of static quality and structural debt indicators across the codebase:\n\n");
        text.push_str(&format!("- High-Complexity Functions (Cyclomatic ≥ 10): **{}**\n", complexity_hotspots));
        text.push_str(&format!("- Circular Dependency Cycles: **{}**\n", circular_cycles));
        text.push_str(&format!("- Code Quality & Reliability Findings: **{}**\n\n", quality_findings));

        evidence.push(format!("debt-metrics:hotspots={},cycles={},quality={}", complexity_hotspots, circular_cycles, quality_findings));

        Ok((text, evidence))
    }

    fn generate_complexity_hotspots(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut evidence = Vec::new();
        let mut text = String::from("### Complex Functions & Methods\n\n");
        text.push_str("Functions exhibiting high branch counts (Cyclomatic ≥ 10) have higher defect probability and require modular refactoring.\n\n");

        let mut stmt = conn.prepare(
            "SELECT f.name, 'function', fl.relative_path, COALESCE(se.start_line, 0), f.cyclomatic_complexity, f.branch_count
             FROM functions f
             JOIN files fl ON f.file_id = fl.id
             LEFT JOIN source_evidence se ON f.source_evidence_id = se.id
             WHERE f.project_id = ?1 AND f.cyclomatic_complexity >= 10
             ORDER BY f.cyclomatic_complexity DESC
             LIMIT 50",
        )?;

        let rows = stmt.query_map(params![project_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, Option<i64>>(4)?.unwrap_or(0),
                r.get::<_, Option<i64>>(5)?.unwrap_or(0),
            ))
        })?;

        let symbols: Vec<_> = rows.collect::<Result<Vec<_>>>()?;

        if symbols.is_empty() {
            text.push_str("No functions exceeding cyclomatic complexity threshold of 10 were detected.\n");
        } else {
            text.push_str("| Symbol | Kind | File Location | Line | Cyclomatic | Branches |\n");
            text.push_str("|---|---|---|---|---|---|\n");
            for (name, kind, path, line, cyc, cog) in &symbols {
                let norm = path.replace('\\', "/");
                text.push_str(&format!(
                    "| `{}` | {} | `{}` | {} | {} | {} |\n",
                    name, kind, norm, line, cyc, cog
                ));
                evidence.push(format!("{}:{}:{}", norm, line, name));
            }
        }

        Ok((text, evidence))
    }

    fn generate_dependency_debt(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut evidence = Vec::new();
        let mut text = String::from("### Circular Dependencies & Unused Packages\n\n");

        let mut stmt = conn.prepare(
            "SELECT f.category, f.title, f.description, COALESCE(se.file_path, 'unknown'), COALESCE(se.start_line, 0)
             FROM findings f
             LEFT JOIN source_evidence se ON f.source_evidence_id = se.id
             WHERE f.project_id = ?1 AND f.category IN ('circular_dependency', 'unused_dependency')
             ORDER BY f.category ASC, f.id ASC",
        )?;

        let rows = stmt.query_map(params![project_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, i64>(4)?,
            ))
        })?;

        let findings: Vec<_> = rows.collect::<Result<Vec<_>>>()?;

        if findings.is_empty() {
            text.push_str("No circular dependency loops or unused external dependencies detected.\n");
        } else {
            for (cat, title, desc, path, line) in &findings {
                let norm = path.replace('\\', "/");
                text.push_str(&format!("- **{}** (`{}`): {}\n  - Location: `{}:{}`\n", title, cat, desc, norm, line));
                evidence.push(format!("{}:{}:{}", norm, line, cat));
            }
        }

        Ok((text, evidence))
    }

    fn generate_quality_debt(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut evidence = Vec::new();
        let mut text = String::from("### Maintenance & Reliability Risks\n\n");

        let mut stmt = conn.prepare(
            "SELECT f.category, f.title, f.description, f.severity, COALESCE(se.file_path, 'unknown'), COALESCE(se.start_line, 0)
             FROM findings f
             LEFT JOIN source_evidence se ON f.source_evidence_id = se.id
             WHERE f.project_id = ?1 AND f.category = 'dead_code'
             ORDER BY f.id ASC",
        )?;

        let rows = stmt.query_map(params![project_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, i64>(5)?,
            ))
        })?;

        let findings: Vec<_> = rows.collect::<Result<Vec<_>>>()?;

        if findings.is_empty() {
            text.push_str("No dead code, unhandled asynchronous calls, or missing test suites detected.\n");
        } else {
            text.push_str("| Category | Severity | Title | File Location | Line |\n");
            text.push_str("|---|---|---|---|---|\n");
            for (cat, title, _desc, sev, path, line) in &findings {
                let norm = path.replace('\\', "/");
                text.push_str(&format!(
                    "| {} | `{}` | {} | `{}` | {} |\n",
                    cat, sev, title, norm, line
                ));
                evidence.push(format!("{}:{}:{}", norm, line, cat));
            }
        }

        Ok((text, evidence))
    }
}
