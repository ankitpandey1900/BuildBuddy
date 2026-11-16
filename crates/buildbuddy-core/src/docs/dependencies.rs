use std::collections::HashSet;
use rusqlite::{params, Connection, Result};

use crate::docs::model::{DocumentSection, DocumentType, GeneratedDocument};

pub const TOOLING_PACKAGES: &[&str] = &[
    "typescript",
    "eslint",
    "prettier",
    "vite",
    "vitest",
    "jest",
    "webpack",
    "rollup",
    "ts-node",
    "babel",
    "tailwindcss",
    "postcss",
    "autoprefixer",
    "pytest",
    "mypy",
    "black",
    "flake8",
    "isort",
    "ruff",
    "pylint",
    "tox",
    "coverage",
    "nodemon",
    "concurrently",
    "rimraf",
    "cross-env",
    "uvicorn",
];

pub struct DependencyInventoryGenerator;

impl DependencyInventoryGenerator {
    pub fn generate(conn: &Connection, project_id: i64) -> Result<GeneratedDocument> {
        let project_name: String = conn.query_row(
            "SELECT name FROM projects WHERE id = ?1",
            params![project_id],
            |r| r.get(0),
        )?;

        let mut sections = Vec::new();
        let mut sort_order = 10;

        // 1. Direct Dependencies
        let (direct_content, direct_ev) = Self::generate_manifest_deps_section(
            conn,
            project_id,
            &["direct"],
            "Direct Dependencies",
        )?;
        sections.push(DocumentSection::new(
            "direct_dependencies",
            "Direct Dependencies",
            sort_order,
            direct_content,
            direct_ev,
        ));
        sort_order += 10;

        // 2. Development Dependencies
        let (dev_content, dev_ev) = Self::generate_manifest_deps_section(
            conn,
            project_id,
            &["dev"],
            "Development Dependencies",
        )?;
        sections.push(DocumentSection::new(
            "dev_dependencies",
            "Development Dependencies",
            sort_order,
            dev_content,
            dev_ev,
        ));
        sort_order += 10;

        // 3. Internal Dependencies
        let (internal_content, internal_ev) = Self::generate_internal_dependencies(conn, project_id)?;
        sections.push(DocumentSection::new(
            "internal_dependencies",
            "Internal Dependencies",
            sort_order,
            internal_content,
            internal_ev,
        ));
        sort_order += 10;

        // 4. Circular Dependencies
        let (circular_content, circular_ev) = Self::generate_circular_dependencies(conn, project_id)?;
        sections.push(DocumentSection::new(
            "circular_dependencies",
            "Circular Dependencies",
            sort_order,
            circular_content,
            circular_ev,
        ));
        sort_order += 10;

        // 5. Potentially Unused Dependencies
        let (unused_content, unused_ev) = Self::generate_unused_dependencies(conn, project_id)?;
        sections.push(DocumentSection::new(
            "unused_dependencies",
            "Potentially Unused Dependencies",
            sort_order,
            unused_content,
            unused_ev,
        ));

        let doc = GeneratedDocument {
            doc_type: DocumentType::DependencyInventory,
            title: format!("Dependency Inventory: {}", project_name),
            sections,
        };

        if let Err(violations) = doc.validate_lint() {
            return Err(rusqlite::Error::ToSqlConversionFailure(Box::new(
                std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    format!("Banned phrase violation in Dependency Inventory: {:?}", violations),
                ),
            )));
        }

        Ok(doc)
    }

    fn generate_manifest_deps_section(
        conn: &Connection,
        project_id: i64,
        types: &[&str],
        _section_title: &str,
    ) -> Result<(String, Vec<String>)> {
        let type_placeholders = types.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT md.package_name, md.version_spec, md.dependency_type, f.relative_path, se.start_line, se.end_line 
             FROM manifest_dependencies md 
             JOIN files f ON md.manifest_file_id = f.id 
             LEFT JOIN source_evidence se ON md.source_evidence_id = se.id 
             WHERE md.project_id = ?1 AND md.dependency_type IN ({}) 
             ORDER BY md.package_name ASC, f.relative_path ASC",
            type_placeholders
        );

        let mut stmt = conn.prepare(&sql)?;
        let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();
        params_vec.push(project_id.into());
        for t in types {
            params_vec.push(t.to_string().into());
        }

        let mut evidence_keys = Vec::new();
        let mut table_rows = Vec::new();

        let rows = stmt.query_map(rusqlite::params_from_iter(params_vec.iter()), |row| {
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
            let (pkg_name, version, _dep_type, manifest_path, start_line, end_line) = r?;
            let ver_str = version.unwrap_or_else(|| "*".to_string());
            let line_val = start_line.unwrap_or(1);
            let end_val = end_line.unwrap_or(line_val);
            let ev_key = format!("{}:{}-{}:manifest_entry", manifest_path, line_val, end_val);
            evidence_keys.push(ev_key);

            table_rows.push(format!(
                "| {} | {} | {}:{} |",
                pkg_name, ver_str, manifest_path, line_val
            ));
        }

        if table_rows.is_empty() {
            return Ok(("Not detected".to_string(), Vec::new()));
        }

        let mut lines = Vec::new();
        lines.push("| Package | Version | Manifest File |".to_string());
        lines.push("| --- | --- | --- |".to_string());
        lines.extend(table_rows);

        Ok((lines.join("\n"), evidence_keys))
    }

    fn generate_internal_dependencies(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut stmt = conn.prepare(
            "SELECT f_src.relative_path, f_tgt.relative_path, ie.imported_name, ie.line_number, ie.is_type_only 
             FROM import_edges ie 
             JOIN files f_src ON ie.source_file_id = f_src.id 
             LEFT JOIN files f_tgt ON ie.target_file_id = f_tgt.id 
             WHERE ie.project_id = ?1 AND ie.resolution_status = 'internal' 
             ORDER BY f_src.relative_path ASC, ie.line_number ASC, ie.imported_name ASC",
        )?;

        let mut evidence_keys = Vec::new();
        let mut table_rows = Vec::new();

        let rows = stmt.query_map(params![project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)? as usize,
                row.get::<_, i64>(4)? == 1,
            ))
        })?;

        for r in rows {
            let (src_path, tgt_path_opt, symbol, line_num, is_type_only) = r?;
            let tgt_path = tgt_path_opt.unwrap_or_else(|| "unknown".to_string());
            let type_only_str = if is_type_only { "yes" } else { "no" };
            let ev_key = format!("{}:{}-{}:import_stmt", src_path, line_num, line_num);
            evidence_keys.push(ev_key);

            table_rows.push(format!(
                "| {} | {} | {} | {}:{} | {} |",
                src_path, tgt_path, symbol, src_path, line_num, type_only_str
            ));
        }

        if table_rows.is_empty() {
            return Ok(("Not detected".to_string(), Vec::new()));
        }

        let mut lines = Vec::new();
        lines.push("| Source File | Target File | Imported Symbol | Line Reference | Type Only |".to_string());
        lines.push("| --- | --- | --- | --- | --- |".to_string());
        lines.extend(table_rows);

        Ok((lines.join("\n"), evidence_keys))
    }

    fn generate_circular_dependencies(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut stmt = conn.prepare(
            "SELECT title, description, severity, confidence, metadata_json 
             FROM findings 
             WHERE project_id = ?1 AND category = 'circular_dependency' 
             ORDER BY description ASC, title ASC",
        )?;

        let mut evidence_keys = Vec::new();
        let mut table_rows = Vec::new();

        let rows = stmt.query_map(params![project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })?;

        for r in rows {
            let (title, description, severity, confidence, meta_json) = r?;
            if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&meta_json) {
                if let Some(cycle) = meta.get("cycle").and_then(|c| c.as_array()) {
                    for node in cycle {
                        if let Some(node_str) = node.as_str() {
                            let ev_key = format!("{}:1-1:import_stmt", node_str);
                            if !evidence_keys.contains(&ev_key) {
                                evidence_keys.push(ev_key);
                            }
                        }
                    }
                }
            }

            table_rows.push(format!(
                "| {} | {} | {} | [{}] |",
                title, description, severity, confidence
            ));
        }

        if table_rows.is_empty() {
            return Ok(("Not detected".to_string(), Vec::new()));
        }

        let mut lines = Vec::new();
        lines.push("| Finding | Cycle Description | Severity | Confidence |".to_string());
        lines.push("| --- | --- | --- | --- |".to_string());
        lines.extend(table_rows);

        Ok((lines.join("\n"), evidence_keys))
    }

    fn generate_unused_dependencies(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        // 1. Get imported packages from import_edges
        let mut ext_stmt = conn.prepare(
            "SELECT target_module FROM import_edges WHERE project_id = ?1 AND resolution_status = 'external'",
        )?;
        let ext_rows = ext_stmt.query_map(params![project_id], |row| row.get::<_, String>(0))?;
        let mut imported_pkgs = HashSet::new();
        for r in ext_rows {
            let mod_name = r?;
            let root = extract_root_pkg(&mod_name);
            imported_pkgs.insert(root.to_lowercase());
            imported_pkgs.insert(root.replace('-', "_").to_lowercase());
            imported_pkgs.insert(root.replace('_', "-").to_lowercase());
        }

        // Also check if any findings exist for unused dependencies
        let mut finding_pkgs = HashSet::new();
        let mut finding_stmt = conn.prepare(
            "SELECT description, metadata_json FROM findings WHERE project_id = ?1 AND category = 'unused_dependency'",
        )?;
        if let Ok(f_rows) = finding_stmt.query_map(params![project_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }) {
            for r in f_rows {
                if let Ok((desc, meta_str)) = r {
                    if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&meta_str) {
                        if let Some(pkg) = meta.get("package_name").and_then(|p| p.as_str()) {
                            finding_pkgs.insert(pkg.to_lowercase());
                        }
                    }
                    if let Some((pkg, _)) = desc.split_once(' ') {
                        finding_pkgs.insert(pkg.to_lowercase());
                    }
                }
            }
        }

        let mut manifest_stmt = conn.prepare(
            "SELECT md.package_name, md.version_spec, md.dependency_type, f.relative_path, se.start_line 
             FROM manifest_dependencies md 
             JOIN files f ON md.manifest_file_id = f.id 
             LEFT JOIN source_evidence se ON md.source_evidence_id = se.id 
             WHERE md.project_id = ?1 
             ORDER BY md.package_name ASC, f.relative_path ASC",
        )?;

        let mut table_rows = Vec::new();
        let mut evidence_keys = Vec::new();

        let m_rows = manifest_stmt.query_map(params![project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<i64>>(4)?,
            ))
        })?;

        for r in m_rows {
            let (pkg, ver, dep_type, rel_path, line_opt) = r?;
            let pkg_lower = pkg.to_lowercase();
            let pkg_hyphen = pkg_lower.replace('_', "-");
            let pkg_under = pkg_lower.replace('-', "_");

            let is_imported = imported_pkgs.contains(&pkg_lower)
                || imported_pkgs.contains(&pkg_hyphen)
                || imported_pkgs.contains(&pkg_under)
                || (pkg_lower.starts_with("@types/") && imported_pkgs.contains(&pkg_lower[7..]));

            let is_in_findings = finding_pkgs.contains(&pkg_lower)
                || finding_pkgs.contains(&pkg_hyphen)
                || finding_pkgs.contains(&pkg_under);

            if is_in_findings || (finding_pkgs.is_empty() && !is_imported) {
                let line_val = line_opt.unwrap_or(1);
                let ev_key = format!("{}:{}-{}:manifest_entry", rel_path, line_val, line_val);
                evidence_keys.push(ev_key);

                let ver_str = ver.unwrap_or_else(|| "*".to_string());
                let is_tooling = TOOLING_PACKAGES.iter().any(|&tool| pkg_lower.contains(tool));
                let status_label = if is_tooling {
                    "tooling, not imported by design"
                } else {
                    "potentially unused [inferred]"
                };

                table_rows.push(format!(
                    "| {} | {} | {} | {}:{} | {} |",
                    pkg, ver_str, dep_type, rel_path, line_val, status_label
                ));
            }
        }

        if table_rows.is_empty() {
            return Ok(("Not detected".to_string(), Vec::new()));
        }

        let mut lines = Vec::new();
        lines.push("| Package | Version | Type | Manifest File | Status |".to_string());
        lines.push("| --- | --- | --- | --- | --- |".to_string());
        lines.extend(table_rows);

        Ok((lines.join("\n"), evidence_keys))
    }
}

fn extract_root_pkg(spec: &str) -> String {
    let trimmed = spec.trim().trim_start_matches("node:");
    if trimmed.starts_with('@') {
        let parts: Vec<&str> = trimmed.split('/').collect();
        if parts.len() >= 2 {
            return format!("{}/{}", parts[0], parts[1]);
        }
    }
    if let Some((root, _)) = trimmed.split_once('/') {
        root.to_string()
    } else if let Some((root, _)) = trimmed.split_once('.') {
        root.to_string()
    } else {
        trimmed.to_string()
    }
}
