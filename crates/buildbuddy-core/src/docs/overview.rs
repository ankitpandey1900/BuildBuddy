use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use rusqlite::{params, Connection, Result};

use crate::docs::lint::check_banned_phrases;
use crate::docs::model::{sentence_contains_secret, split_into_sentences, DocumentSection, DocumentType, GeneratedDocument};

pub struct ProjectOverviewGenerator;

impl ProjectOverviewGenerator {
    pub fn generate(conn: &Connection, project_id: i64) -> Result<GeneratedDocument> {
        let (project_name, root_path) = conn.query_row(
            "SELECT name, root_path FROM projects WHERE id = ?1",
            params![project_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )?;

        let mut sections = Vec::new();
        let mut sort_order = 10;

        // 1. Purpose
        let (purpose_content, purpose_ev) = Self::generate_purpose(conn, project_id, &root_path)?;
        sections.push(DocumentSection::new(
            "purpose",
            "Purpose",
            sort_order,
            purpose_content,
            purpose_ev,
        ));
        sort_order += 10;

        // 2. Languages
        let (lang_content, lang_ev) = Self::generate_languages(conn, project_id)?;
        sections.push(DocumentSection::new(
            "languages",
            "Languages",
            sort_order,
            lang_content,
            lang_ev,
        ));
        sort_order += 10;

        // 3. Frameworks
        let (fw_content, fw_ev) = Self::generate_frameworks(conn, project_id)?;
        sections.push(DocumentSection::new(
            "frameworks",
            "Frameworks",
            sort_order,
            fw_content,
            fw_ev,
        ));
        sort_order += 10;

        // 4. Directory Structure
        let (dir_content, dir_ev) = Self::generate_directory_structure(conn, project_id)?;
        sections.push(DocumentSection::new(
            "directory_structure",
            "Directory Structure",
            sort_order,
            dir_content,
            dir_ev,
        ));
        sort_order += 10;

        // 5. Entry Points
        let (ep_content, ep_ev) = Self::generate_entry_points(conn, project_id)?;
        sections.push(DocumentSection::new(
            "entry_points",
            "Entry Points",
            sort_order,
            ep_content,
            ep_ev,
        ));
        sort_order += 10;

        // 6. Major Modules
        let (mod_content, mod_ev) = Self::generate_modules(conn, project_id)?;
        sections.push(DocumentSection::new(
            "major_modules",
            "Major Modules",
            sort_order,
            mod_content,
            mod_ev,
        ));
        sort_order += 10;

        // 7. External Dependencies
        let (dep_content, dep_ev) = Self::generate_external_dependencies(conn, project_id)?;
        sections.push(DocumentSection::new(
            "external_dependencies",
            "External Dependencies",
            sort_order,
            dep_content,
            dep_ev,
        ));

        let doc = GeneratedDocument {
            doc_type: DocumentType::ProjectOverview,
            title: format!("Project Overview: {}", project_name),
            sections,
        };

        if let Err(violations) = doc.validate_lint() {
            return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    format!("Banned phrase violation in Project Overview: {:?}", violations),
                ),
            )));
        }

        Ok(doc)
    }

    fn generate_purpose(
        conn: &Connection,
        project_id: i64,
        root_path: &str,
    ) -> Result<(String, Vec<String>)> {
        // Look for README in indexed project files
        let mut readme_stmt = conn.prepare(
            "SELECT relative_path FROM files 
             WHERE project_id = ?1 AND lower(file_name) IN ('readme.md', 'readme.markdown', 'readme.txt', 'readme') 
             ORDER BY relative_path ASC LIMIT 1",
        )?;
        let mut readme_rows = readme_stmt.query(params![project_id])?;

        if let Some(row) = readme_rows.next()? {
            let rel_path: String = row.get(0)?;
            let abs_path = Path::new(root_path).join(&rel_path);
            if let Ok(content) = fs::read_to_string(&abs_path) {
                let lines: Vec<&str> = content.lines().collect();

                for (idx, line) in lines.iter().enumerate() {
                    let trimmed = line.trim();
                    if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with("<!--") {
                        continue;
                    }

                    let sentences = split_into_sentences(trimmed);
                    for s in sentences {
                        let clean_s = s.trim();
                        if clean_s.is_empty() {
                            continue;
                        }

                        // If sentence contains secret, drop whole sentence
                        if sentence_contains_secret(clean_s) {
                            continue;
                        }

                        // Run banned-phrase lint on verbatim quote
                        if check_banned_phrases(clean_s).is_err() {
                            return Ok((
                                format!("Not detected (README present at {})", rel_path),
                                Vec::new(),
                            ));
                        }

                        let line_num = idx + 1;
                        let text = format!("\"{}\" from README ({}:{})", clean_s, rel_path, line_num);
                        let ev_key = format!("{}:{}-{}:file_content", rel_path, line_num, line_num);
                        return Ok((text, vec![ev_key]));
                    }
                }

                // If all candidate sentences were dropped (e.g. contained secrets or failed)
                return Ok((
                    format!("Not detected (README present at {})", rel_path),
                    Vec::new(),
                ));
            }
        }

        // Fallback: check package.json description
        let mut pkg_stmt = conn.prepare(
            "SELECT relative_path FROM files WHERE project_id = ?1 AND relative_path = 'package.json' LIMIT 1",
        )?;
        let mut pkg_rows = pkg_stmt.query(params![project_id])?;

        if let Some(row) = pkg_rows.next()? {
            let rel_path: String = row.get(0)?;
            let abs_path = Path::new(root_path).join(&rel_path);
            if let Ok(content) = fs::read_to_string(&abs_path) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(desc) = val.get("description").and_then(|d| d.as_str()) {
                        let trimmed = desc.trim();
                        if !trimmed.is_empty() {
                            let mut line_num = 1;
                            for (idx, line) in content.lines().enumerate() {
                                if line.contains("\"description\"") {
                                    line_num = idx + 1;
                                    break;
                                }
                            }

                            let sentences = split_into_sentences(trimmed);
                            for s in sentences {
                                let clean_s = s.trim();
                                if clean_s.is_empty() {
                                    continue;
                                }

                                if sentence_contains_secret(clean_s) {
                                    continue;
                                }

                                if check_banned_phrases(clean_s).is_err() {
                                    return Ok((
                                        format!("Not detected (manifest present at {})", rel_path),
                                        Vec::new(),
                                    ));
                                }

                                let text = format!("\"{}\" from manifest ({}:{})", clean_s, rel_path, line_num);
                                let ev_key = format!("{}:{}-{}:manifest_entry", rel_path, line_num, line_num);
                                return Ok((text, vec![ev_key]));
                            }

                            return Ok((
                                format!("Not detected (manifest present at {})", rel_path),
                                Vec::new(),
                            ));
                        }
                    }
                }
            }
        }

        Ok(("Not detected".to_string(), Vec::new()))
    }

    fn generate_languages(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut stmt = conn.prepare(
            "SELECT extension, count(*), sum(line_count) 
             FROM files 
             WHERE project_id = ?1 
             GROUP BY extension 
             ORDER BY sum(line_count) DESC, extension ASC",
        )?;

        let mut rows_data = Vec::new();
        let mut total_lines = 0usize;

        let iter = stmt.query_map(params![project_id], |row| {
            let ext: Option<String> = row.get(0)?;
            let file_count: usize = row.get(1)?;
            let line_count: usize = row.get::<_, Option<usize>>(2)?.unwrap_or(0);
            Ok((ext, file_count, line_count))
        })?;

        for item in iter {
            let (ext, fc, lc) = item?;
            total_lines += lc;
            rows_data.push((ext, fc, lc));
        }

        if rows_data.is_empty() {
            return Ok(("Not detected".to_string(), Vec::new()));
        }

        let mut lines = Vec::new();
        lines.push("| Language | Files | Lines | Percentage |".to_string());
        lines.push("| --- | --- | --- | --- |".to_string());

        for (ext, fc, lc) in rows_data {
            let lang = match ext.as_deref().unwrap_or("") {
                "ts" => "TypeScript",
                "tsx" => "TypeScript (TSX)",
                "js" => "JavaScript",
                "jsx" => "JavaScript (JSX)",
                "py" | "pyw" => "Python",
                "rs" => "Rust",
                "json" => "JSON",
                "toml" => "TOML",
                "md" | "markdown" => "Markdown",
                "css" | "scss" => "CSS",
                "html" => "HTML",
                "sql" => "SQL",
                other if !other.is_empty() => other,
                _ => "Other",
            };

            let pct = if total_lines > 0 {
                format!("{:.1}%", (lc as f64 / total_lines as f64) * 100.0)
            } else {
                "0.0%".to_string()
            };

            lines.push(format!("| {} | {} | {} | {} |", lang, fc, lc, pct));
        }

        Ok((lines.join("\n"), Vec::new()))
    }

    fn generate_frameworks(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut stmt = conn.prepare(
            "SELECT name, version, confidence, evidence_json 
             FROM frameworks 
             WHERE project_id = ?1 
             ORDER BY name ASC",
        )?;

        let mut evidence_keys = Vec::new();
        let mut table_rows = Vec::new();

        let fw_iter = stmt.query_map(params![project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;

        for r in fw_iter {
            let (name, version, confidence, ev_json) = r?;
            let version_str = version.unwrap_or_else(|| "Not specified".to_string());

            let mut source_parts = Vec::new();
            if let Ok(ev_list) = serde_json::from_str::<Vec<serde_json::Value>>(&ev_json) {
                for ev in ev_list {
                    let fp = ev.get("file_path").and_then(|v| v.as_str()).unwrap_or("");
                    let sl = ev.get("start_line").and_then(|v| v.as_u64()).unwrap_or(1);
                    let el = ev.get("end_line").and_then(|v| v.as_u64()).unwrap_or(1);
                    let sig = ev.get("signal_type").and_then(|v| v.as_str()).unwrap_or("ast_node");

                    if !fp.is_empty() {
                        let ev_key = format!("{}:{}-{}:{}", fp, sl, el, sig);
                        source_parts.push(format!("{}:{}", fp, sl));
                        if !evidence_keys.contains(&ev_key) {
                            evidence_keys.push(ev_key);
                        }
                    }
                }
            }

            source_parts.sort();
            source_parts.dedup();

            let source_str = if source_parts.is_empty() {
                "project scan".to_string()
            } else {
                source_parts.join(", ")
            };

            table_rows.push(format!(
                "| {} | {} | [{}] | {} |",
                name, version_str, confidence, source_str
            ));
        }

        // Also query declared frameworks
        let mut decl_stmt = conn.prepare(
            "SELECT name, version, dependency_type, file_path, line_number 
             FROM declared_frameworks 
             WHERE project_id = ?1 
             ORDER BY name ASC",
        )?;

        let decl_iter = decl_stmt.query_map(params![project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })?;

        for r in decl_iter {
            let (name, version, _dep_type, file_path, line_num) = r?;
            let version_str = version.unwrap_or_else(|| "Not specified".to_string());
            let ev_key = format!("{}:{}-{}:manifest_entry", file_path, line_num, line_num);
            if !evidence_keys.contains(&ev_key) {
                evidence_keys.push(ev_key);
            }

            table_rows.push(format!(
                "| {} | {} | [declared only] | {}:{} |",
                name, version_str, file_path, line_num
            ));
        }

        if table_rows.is_empty() {
            return Ok(("Not detected".to_string(), Vec::new()));
        }

        let mut lines = Vec::new();
        lines.push("| Framework | Version | Confidence | Source |".to_string());
        lines.push("| --- | --- | --- | --- |".to_string());
        lines.extend(table_rows);

        Ok((lines.join("\n"), evidence_keys))
    }

    fn generate_directory_structure(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut stmt = conn.prepare(
            "SELECT relative_path, line_count 
             FROM files 
             WHERE project_id = ?1 
             ORDER BY relative_path ASC",
        )?;

        let mut dir_map: BTreeMap<String, (usize, usize)> = BTreeMap::new();
        let mut root_file_count = 0;
        let mut root_line_count = 0;

        let rows = stmt.query_map(params![project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)? as usize,
            ))
        })?;

        for r in rows {
            let (rel_path, lines) = r?;
            let normalized = rel_path.replace('\\', "/");
            if let Some((top_dir, _)) = normalized.split_once('/') {
                let entry = dir_map.entry(format!("{}/", top_dir)).or_insert((0, 0));
                entry.0 += 1;
                entry.1 += lines;
            } else {
                root_file_count += 1;
                root_line_count += lines;
            }
        }

        if root_file_count > 0 {
            dir_map.insert("./ (root)".to_string(), (root_file_count, root_line_count));
        }

        if dir_map.is_empty() {
            return Ok(("Not detected".to_string(), Vec::new()));
        }

        let mut lines = Vec::new();
        lines.push("| Directory | Files | Lines |".to_string());
        lines.push("| --- | --- | --- |".to_string());

        for (dir_name, (fc, lc)) in dir_map {
            lines.push(format!("| {} | {} | {} |", dir_name, fc, lc));
        }

        Ok((lines.join("\n"), Vec::new()))
    }

    fn generate_entry_points(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut stmt = conn.prepare(
            "SELECT name, entry_type, file_path, start_line, end_line, confidence 
             FROM entry_points 
             WHERE project_id = ?1 
             ORDER BY file_path ASC, start_line ASC, name ASC",
        )?;

        let mut evidence_keys = Vec::new();
        let mut table_rows = Vec::new();

        let rows = stmt.query_map(params![project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)? as usize,
                row.get::<_, i64>(4)? as usize,
                row.get::<_, String>(5)?,
            ))
        })?;

        for r in rows {
            let (name, entry_type, file_path, start_line, end_line, confidence) = r?;
            let ev_key = format!("{}:{}-{}:entry_point", file_path, start_line, end_line);
            evidence_keys.push(ev_key);

            let loc = if start_line == end_line {
                format!("{}:{}", file_path, start_line)
            } else {
                format!("{}:{}-{}", file_path, start_line, end_line)
            };

            table_rows.push(format!(
                "| {} | {} | {} | [{}] |",
                name, entry_type, loc, confidence
            ));
        }

        if table_rows.is_empty() {
            return Ok(("Not detected".to_string(), Vec::new()));
        }

        let mut lines = Vec::new();
        lines.push("| Entry Point | Type | File Reference | Confidence |".to_string());
        lines.push("| --- | --- | --- | --- |".to_string());
        lines.extend(table_rows);

        Ok((lines.join("\n"), evidence_keys))
    }

    fn generate_modules(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut stmt = conn.prepare(
            "SELECT name, root_directory, layer, file_count, cohesion_score 
             FROM modules 
             WHERE project_id = ?1 AND root_directory != '.' 
             ORDER BY name ASC",
        )?;

        let mut table_rows = Vec::new();

        let rows = stmt.query_map(params![project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)? as usize,
                row.get::<_, f64>(4)?,
            ))
        })?;

        for r in rows {
            let (name, root_dir, layer, fc, cohesion) = r?;
            table_rows.push(format!(
                "| {} | {} | {} | {} | {:.2} |",
                name, root_dir, layer, fc, cohesion
            ));
        }

        if table_rows.is_empty() {
            return Ok(("Not detected".to_string(), Vec::new()));
        }

        let mut lines = Vec::new();
        lines.push("| Module | Root Directory | Layer | Files | Cohesion |".to_string());
        lines.push("| --- | --- | --- | --- | --- |".to_string());
        lines.extend(table_rows);

        // Modules represent directory groupings rather than individual AST nodes or source file spans;
        // no fake single-line AST evidence keys are synthesized.
        Ok((lines.join("\n"), Vec::new()))
    }

    fn generate_external_dependencies(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut stmt = conn.prepare(
            "SELECT md.package_name, md.version_spec, md.dependency_type, f.relative_path, se.start_line, se.end_line 
             FROM manifest_dependencies md 
             JOIN files f ON md.manifest_file_id = f.id 
             LEFT JOIN source_evidence se ON md.source_evidence_id = se.id 
             WHERE md.project_id = ?1 AND md.dependency_type IN ('direct', 'dependencies', 'production') 
             ORDER BY md.package_name ASC, f.relative_path ASC",
        )?;

        let mut evidence_keys = Vec::new();
        let mut table_rows = Vec::new();

        let rows = stmt.query_map(params![project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<i64>>(4)?,
                row.get::<_, Option<i64>>(5)?,
            ))
        })?;

        for r in rows {
            let (pkg_name, version, dep_type, manifest_path, start_line, end_line) = r?;
            let ver_str = version.unwrap_or_else(|| "*".to_string());
            let line_val = start_line.unwrap_or(1);
            let end_val = end_line.unwrap_or(line_val);
            let ev_key = format!("{}:{}-{}:manifest_entry", manifest_path, line_val, end_val);
            evidence_keys.push(ev_key);

            table_rows.push(format!(
                "| {} | {} | {} | {}:{} |",
                pkg_name, ver_str, dep_type, manifest_path, line_val
            ));
        }

        if table_rows.is_empty() {
            return Ok(("Not detected".to_string(), Vec::new()));
        }

        let mut lines = Vec::new();
        lines.push("| Package | Version | Type | Manifest |".to_string());
        lines.push("| --- | --- | --- | --- |".to_string());
        lines.extend(table_rows);

        Ok((lines.join("\n"), evidence_keys))
    }
}
