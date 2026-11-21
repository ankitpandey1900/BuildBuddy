use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};

use crate::graph::model::{DependencyOverview, ImportEdge, ResolutionStatus};
use crate::manifest::ManifestDependency;
use crate::health::HealthFinding;

pub struct GraphStore;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StoredFinding {
    pub id: i64,
    pub category: String,
    pub title: String,
    pub description: String,
    pub severity: String,
    pub confidence: String,
    pub file_path: Option<String>,
    pub start_line: Option<i64>,
    pub end_line: Option<i64>,
    pub source_evidence_id: Option<i64>,
    pub metadata_json: String,
}

impl GraphStore {
    pub fn insert_import_edges(
        conn: &mut Connection,
        project_id: i64,
        edges: &[ImportEdge],
    ) -> Result<()> {
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare(
                "INSERT INTO import_edges (
                    project_id, source_file_id, target_file_id, target_module,
                    imported_name, is_type_only, line_number, resolution_status,
                    source_evidence_id
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            )?;

            for edge in edges {
                let evidence_id = if let Some(eid) = edge.source_evidence_id {
                    eid
                } else {
                    tx.query_row(
                        "INSERT INTO source_evidence (
                            project_id, file_path, start_line, end_line,
                            start_column, end_column, snippet, confidence, evidence_type
                        ) VALUES (?1, ?2, ?3, ?3, 0, 0, ?4, 'static', 'import_stmt')
                        RETURNING id",
                        params![
                            project_id,
                            edge.source_file_path,
                            edge.line_number as i64,
                            format!("import {} from '{}'", edge.imported_name, edge.target_module),
                        ],
                        |row| row.get(0),
                    )?
                };

                stmt.execute(params![
                    project_id,
                    edge.source_file_id,
                    edge.target_file_id,
                    edge.target_module,
                    edge.imported_name,
                    if edge.is_type_only { 1 } else { 0 },
                    edge.line_number as i64,
                    edge.resolution_status.as_str(),
                    evidence_id,
                ])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn insert_manifest_dependencies(
        conn: &mut Connection,
        project_id: i64,
        manifest_file_id: i64,
        deps: &[ManifestDependency],
    ) -> Result<()> {
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare(
                "INSERT INTO manifest_dependencies (
                    project_id, manifest_file_id, package_name, version_spec,
                    dependency_type, source_evidence_id
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )?;

            for dep in deps {
                let evidence_id: Option<i64> = if let Some(line) = dep.line_number {
                    // Create evidence row
                    tx.query_row(
                        "INSERT INTO source_evidence (
                            project_id, file_path, start_line, end_line,
                            start_column, end_column, snippet, confidence, evidence_type
                        ) VALUES (?1, ?2, ?3, ?4, 0, 0, ?5, 'confirmed', 'manifest_entry')
                        RETURNING id",
                        params![
                            project_id,
                            dep.source_file,
                            line as i64,
                            line as i64,
                            format!("{} ({})", dep.name, dep.version_spec.as_deref().unwrap_or("*")),
                        ],
                        |row| row.get(0),
                    ).ok()
                } else {
                    None
                };

                stmt.execute(params![
                    project_id,
                    manifest_file_id,
                    dep.name,
                    dep.version_spec,
                    dep.dep_type.as_str(),
                    evidence_id,
                ])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn insert_finding(
        conn: &Connection,
        project_id: i64,
        category: &str,
        title: &str,
        description: &str,
        severity: &str,
        confidence: &str,
        source_evidence_id: Option<i64>,
        metadata_json: &str,
    ) -> Result<i64> {
        conn.query_row(
            "INSERT INTO findings (
                project_id, category, title, description, severity, confidence,
                source_evidence_id, metadata_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            RETURNING id",
            params![
                project_id,
                category,
                title,
                description,
                severity,
                confidence,
                source_evidence_id,
                metadata_json,
            ],
            |row| row.get(0),
        )
    }

    pub fn get_import_edges(
        conn: &Connection,
        project_id: i64,
    ) -> Result<Vec<ImportEdge>> {
        let mut stmt = conn.prepare(
            "SELECT e.source_file_id, sf.relative_path, e.target_file_id, tf.relative_path,
                    e.target_module, e.imported_name, e.is_type_only, e.line_number,
                    e.resolution_status, e.source_evidence_id
             FROM import_edges e
             JOIN files sf ON e.source_file_id = sf.id
             LEFT JOIN files tf ON e.target_file_id = tf.id
             WHERE e.project_id = ?1
             ORDER BY e.id ASC",
        )?;

        let rows = stmt.query_map(params![project_id], |row| {
            let res_status_str: String = row.get(8)?;
            let resolution_status = ResolutionStatus::from_str(&res_status_str)
                .unwrap_or(ResolutionStatus::Unresolved);

            Ok(ImportEdge {
                source_file_id: row.get(0)?,
                source_file_path: row.get(1)?,
                target_file_id: row.get(2)?,
                target_file_path: row.get(3)?,
                target_module: row.get(4)?,
                imported_name: row.get(5)?,
                is_type_only: row.get::<_, i64>(6)? != 0,
                line_number: row.get::<_, i64>(7)? as usize,
                resolution_status,
                source_evidence_id: row.get(9)?,
            })
        })?;

        let mut edges = Vec::new();
        for r in rows {
            edges.push(r?);
        }
        Ok(edges)
    }

    pub fn get_dependency_overview(
        conn: &Connection,
        project_id: i64,
    ) -> Result<DependencyOverview> {
        let internal_count: usize = conn.query_row(
            "SELECT COUNT(*) FROM import_edges WHERE project_id = ?1 AND resolution_status = 'internal'",
            params![project_id],
            |r| r.get(0),
        )?;

        let external_count: usize = conn.query_row(
            "SELECT COUNT(DISTINCT target_module) FROM import_edges WHERE project_id = ?1 AND resolution_status = 'external'",
            params![project_id],
            |r| r.get(0),
        )?;

        let unresolved_count: usize = conn.query_row(
            "SELECT COUNT(*) FROM import_edges WHERE project_id = ?1 AND resolution_status = 'unresolved'",
            params![project_id],
            |r| r.get(0),
        )?;

        let circular_cycles_count: usize = conn.query_row(
            "SELECT COUNT(*) FROM findings WHERE project_id = ?1 AND category = 'circular_dependency'",
            params![project_id],
            |r| r.get(0),
        )?;

        let unused_dependencies_count: usize = conn.query_row(
            "SELECT COUNT(*) FROM findings WHERE project_id = ?1 AND category = 'unused_dependency'",
            params![project_id],
            |r| r.get(0),
        )?;

        Ok(DependencyOverview {
            internal_edges_count: internal_count,
            external_dependencies_count: external_count,
            unresolved_count,
            circular_cycles_count,
            unused_dependencies_count,
        })
    }

    /// Rebuild findings that are derived directly from persisted function metrics.
    /// A complexity score is an objective static metric, while the threshold is a
    /// review prompt rather than a claim that the function is defective.
    pub fn refresh_complexity_findings(conn: &Connection, project_id: i64) -> Result<()> {
        conn.execute(
            "DELETE FROM findings WHERE project_id = ?1 AND category = 'complexity'",
            params![project_id],
        )?;

        let mut statement = conn.prepare(
            "SELECT func.name, func.cyclomatic_complexity, f.relative_path,
                    evidence.start_line, evidence.end_line, func.source_evidence_id
             FROM functions func
             JOIN files f ON f.id = func.file_id
             LEFT JOIN source_evidence evidence ON evidence.id = func.source_evidence_id
             WHERE func.project_id = ?1 AND func.cyclomatic_complexity >= 10
             ORDER BY func.cyclomatic_complexity DESC, f.relative_path ASC, func.name ASC",
        )?;
        let rows = statement.query_map(params![project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<i64>>(3)?,
                row.get::<_, Option<i64>>(4)?,
                row.get::<_, Option<i64>>(5)?,
            ))
        })?;

        for row in rows {
            let (name, complexity, file_path, start_line, end_line, evidence_id) = row?;
            let severity = if complexity >= 15 { "high" } else { "medium" };
            let title = format!("High complexity: {}", name);
            let description = format!(
                "{} has cyclomatic complexity {}. Review its branching and loop paths before changing it.",
                name, complexity
            );
            let metadata = format!(
                r#"{{"function_name":{},"cyclomatic_complexity":{},"file_path":{},"start_line":{},"end_line":{}}}"#,
                serde_json::to_string(&name).unwrap_or_default(),
                complexity,
                serde_json::to_string(&file_path).unwrap_or_default(),
                start_line.map_or("null".to_string(), |line| line.to_string()),
                end_line.map_or("null".to_string(), |line| line.to_string()),
            );
            Self::insert_finding(
                conn,
                project_id,
                "complexity",
                &title,
                &description,
                severity,
                "static",
                evidence_id,
                &metadata,
            )?;
        }
        Ok(())
    }

    pub fn refresh_health_findings(conn: &Connection, project_id: i64, candidates: &[HealthFinding]) -> Result<()> {
        conn.execute("DELETE FROM findings WHERE project_id = ?1 AND category IN ('security', 'dead_code')", params![project_id])?;
        for candidate in candidates {
            let evidence_type = if candidate.confidence == "inferred" { "heuristic" } else { "source_pattern" };
            let evidence_id = conn.query_row(
                "INSERT INTO source_evidence (project_id, file_path, start_line, end_line, start_column, end_column, snippet, confidence, evidence_type)
                 VALUES (?1, ?2, ?3, ?3, 0, 0, ?4, ?5, ?6) RETURNING id",
                params![project_id, candidate.file_path, candidate.line_number as i64, candidate.evidence_snippet, candidate.confidence, evidence_type], |row| row.get(0),
            )?;
            let metadata = format!(r#"{{"rule":{},"file_path":{},"line":{}}}"#, serde_json::to_string(candidate.rule).unwrap_or_default(), serde_json::to_string(&candidate.file_path).unwrap_or_default(), candidate.line_number);
            Self::insert_finding(conn, project_id, candidate.category, candidate.title, candidate.description, candidate.severity, candidate.confidence, Some(evidence_id), &metadata)?;
        }
        Ok(())
    }

    pub fn get_findings(conn: &Connection, project_id: i64) -> Result<Vec<StoredFinding>> {
        let mut statement = conn.prepare(
            "SELECT finding.id, finding.category, finding.title, finding.description,
                    finding.severity, finding.confidence, evidence.file_path,
                    evidence.start_line, evidence.end_line, finding.source_evidence_id,
                    finding.metadata_json
             FROM findings finding
             LEFT JOIN source_evidence evidence ON evidence.id = finding.source_evidence_id
             WHERE finding.project_id = ?1
             ORDER BY CASE finding.severity
                WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2
                WHEN 'low' THEN 3 ELSE 4 END, finding.id ASC",
        )?;
        let findings = statement
            .query_map(params![project_id], |row| {
                Ok(StoredFinding {
                    id: row.get(0)?, category: row.get(1)?, title: row.get(2)?,
                    description: row.get(3)?, severity: row.get(4)?, confidence: row.get(5)?,
                    file_path: row.get(6)?, start_line: row.get(7)?, end_line: row.get(8)?,
                    source_evidence_id: row.get(9)?, metadata_json: row.get(10)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(findings)
    }

    pub fn get_package_inventory(conn: &Connection, project_id: i64) -> Result<Vec<PackageInventoryItem>> {
        let mut stmt = conn.prepare(
            "SELECT md.name, md.version_spec, md.dep_type, f.relative_path
             FROM manifest_dependencies md
             JOIN files f ON f.id = md.file_id
             WHERE md.project_id = ?1
             ORDER BY md.name ASC, f.relative_path ASC",
        )?;

        let mut manifest_map: std::collections::HashMap<String, (Option<String>, String, String)> = std::collections::HashMap::new();
        let rows = stmt.query_map(params![project_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;

        for r in rows {
            let (name, ver, dtype, manifest_file) = r?;
            manifest_map.entry(name).or_insert((ver, dtype, manifest_file));
        }

        // Find which source files actually import each external module
        let mut import_stmt = conn.prepare(
            "SELECT ie.target_module, f.relative_path
             FROM import_edges ie
             JOIN files f ON f.id = ie.source_file_id
             WHERE ie.project_id = ?1 AND ie.resolution_status = 'external'
             ORDER BY ie.target_module, f.relative_path",
        )?;

        let mut usages_map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
        let imp_rows = import_stmt.query_map(params![project_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        for r in imp_rows {
            let (target_mod, source_file) = r?;
            let root_name = if target_mod.starts_with('@') {
                let parts: Vec<&str> = target_mod.split('/').collect();
                if parts.len() >= 2 {
                    format!("{}/{}", parts[0], parts[1])
                } else {
                    target_mod.clone()
                }
            } else {
                target_mod.split('/').next().unwrap_or(&target_mod).to_string()
            };

            let list = usages_map.entry(root_name).or_default();
            if !list.contains(&source_file) {
                list.push(source_file);
            }
        }

        let mut results = Vec::new();
        for (pkg_name, (version, dep_type, manifest_file)) in manifest_map {
            let category = classify_package_category(&pkg_name).to_string();
            let usage_files = usages_map.get(&pkg_name).cloned().unwrap_or_default();
            let usage_count = usage_files.len();

            results.push(PackageInventoryItem {
                name: pkg_name,
                version,
                category,
                dep_type,
                manifest_file,
                usage_count,
                usage_files,
            });
        }

        results.sort_by(|a, b| b.usage_count.cmp(&a.usage_count).then_with(|| a.name.cmp(&b.name)));
        Ok(results)
    }

    pub fn get_file_intelligence(conn: &Connection, project_id: i64, file_path: &str) -> Result<Option<FileIntelligenceDto>> {
        let norm_fwd = file_path.replace('\\', "/");
        let norm_back = file_path.replace('/', "\\");
        let trimmed_fwd = norm_fwd.trim_start_matches("./").trim_start_matches('/');
        let trimmed_back = norm_back.trim_start_matches(".\\").trim_start_matches('\\');

        let file_id_res: Result<i64> = conn.query_row(
            "SELECT id FROM files WHERE project_id = ?1 AND (relative_path = ?2 OR relative_path = ?3 OR relative_path = ?4 OR relative_path = ?5 OR relative_path = ?6)",
            params![project_id, file_path, norm_fwd, norm_back, trimmed_fwd, trimmed_back],
            |r| r.get(0),
        );
        let file_id = match file_id_res {
            Ok(id) => id,
            Err(_) => return Ok(None),
        };

        // 1. Direct dependants (files that import this file)
        let mut dep_stmt = conn.prepare(
            "SELECT DISTINCT f.relative_path
             FROM import_edges ie
             JOIN files f ON f.id = ie.source_file_id
             WHERE ie.project_id = ?1 AND ie.target_file_id = ?2
             ORDER BY f.relative_path ASC",
        )?;
        let direct_dependants: Vec<String> = dep_stmt.query_map(params![project_id, file_id], |r| r.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        // 2. Internal dependencies (files this file imports)
        let mut int_stmt = conn.prepare(
            "SELECT DISTINCT tf.relative_path
             FROM import_edges ie
             JOIN files tf ON tf.id = ie.target_file_id
             WHERE ie.project_id = ?1 AND ie.source_file_id = ?2
             ORDER BY tf.relative_path ASC",
        )?;
        let internal_dependencies: Vec<String> = int_stmt.query_map(params![project_id, file_id], |r| r.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        // 3. External packages used
        let mut ext_stmt = conn.prepare(
            "SELECT DISTINCT ie.target_module
             FROM import_edges ie
             WHERE ie.project_id = ?1 AND ie.source_file_id = ?2 AND ie.resolution_status = 'external'
             ORDER BY ie.target_module ASC",
        )?;
        let external_packages_used: Vec<String> = ext_stmt.query_map(params![project_id, file_id], |r| r.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        // 4. Exported symbols (join source_evidence for start_line and functions for cyclomatic_complexity)
        let mut sym_stmt = conn.prepare(
            "SELECT s.name, s.kind, COALESCE(se.start_line, 1), s.is_exported, COALESCE(f.cyclomatic_complexity, 1)
             FROM symbols s
             LEFT JOIN source_evidence se ON s.source_evidence_id = se.id
             LEFT JOIN functions f ON f.symbol_id = s.id
             WHERE s.file_id = ?1
             ORDER BY se.start_line ASC, s.name ASC",
        )?;
        let exported_symbols: Vec<SymbolSummaryDto> = sym_stmt.query_map(params![file_id], |r| {
            let is_exp_int: i64 = r.get(3)?;
            Ok(SymbolSummaryDto {
                name: r.get(0)?,
                kind: r.get(1)?,
                line_number: r.get(2)?,
                is_exported: is_exp_int != 0,
                complexity: r.get(4)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

        // 5. API Endpoints declared in this file
        let like_suffix = format!("%{}", trimmed_fwd);
        let mut api_stmt = conn.prepare(
            "SELECT method, route, framework
             FROM api_endpoints
             WHERE project_id = ?1 AND (file_path = ?2 OR file_path = ?3 OR file_path = ?4 OR file_path LIKE ?5)
             ORDER BY route ASC, method ASC",
        )?;
        let api_endpoints: Vec<FileApiEndpointDto> = api_stmt.query_map(
            params![project_id, file_path, norm_fwd, norm_back, like_suffix],
            |r| {
                Ok(FileApiEndpointDto {
                    method: r.get(0)?,
                    route: r.get(1)?,
                    framework: r.get(2)?,
                })
            },
        )?
        .filter_map(|r| r.ok())
        .collect();

        // 6. Blast Radius Level
        let dep_count = direct_dependants.len();
        let blast_radius_level = if dep_count >= 8 {
            "critical".to_string()
        } else if dep_count >= 3 {
            "warning".to_string()
        } else {
            "low".to_string()
        };

        // 7. Role & Explanation
        let p_lower = file_path.to_ascii_lowercase();
        let (role, explanation) = if !api_endpoints.is_empty() {
            (
                "API Gateway Route Handler",
                format!("Exposes {} HTTP endpoint(s) ({}) for external consumers. Handles requests, input validation, and coordinates business workflows.",
                    api_endpoints.len(),
                    api_endpoints.iter().map(|e| format!("{} {}", e.method, e.route)).collect::<Vec<_>>().join(", ")
                ),
            )
        } else if p_lower.contains("/api/") || p_lower.ends_with("route.ts") || p_lower.ends_with("route.js") {
            (
                "API Gateway Route Handler",
                "Handles incoming HTTP requests, parses payloads, validates input schemas, and coordinates responses.".to_string(),
            )
        } else if p_lower.ends_with(".prisma") {
            (
                "Database Persistence Schema",
                "Defines Prisma entity models, relational foreign keys, database columns, and storage schemas.".to_string(),
            )
        } else if p_lower.ends_with(".tsx") || p_lower.ends_with(".jsx") {
            (
                "UI Presentation Component",
                "Renders interactive visual interface components and binds user interactions.".to_string(),
            )
        } else if p_lower.contains("store") || p_lower.contains("state") || p_lower.contains("slice") || p_lower.contains("atom") {
            (
                "State Management Store",
                "Maintains reactive application state, mutations, and cross-component subscriptions.".to_string(),
            )
        } else if p_lower.contains("validation") || p_lower.contains("schema") || p_lower.contains("contract") {
            (
                "Data Contract & Validation",
                "Enforces runtime data schema boundaries, field assertions, and TypeScript type contracts.".to_string(),
            )
        } else if p_lower.contains("db") || p_lower.contains("repo") || p_lower.contains("client") || p_lower.contains("repository") {
            (
                "Database Access Layer",
                "Interfaces directly with persistence storage, executing queries, mutations, and connection pooling.".to_string(),
            )
        } else if p_lower.contains("hook") {
            (
                "Custom React Hook",
                "Encapsulates reusable stateful logic, asynchronous side effects, and lifecycle interactions.".to_string(),
            )
        } else if p_lower.contains("test") || p_lower.contains("spec") {
            (
                "Automated Verification Suite",
                "Executes functional test suites, unit assertions, and verifies regression safety.".to_string(),
            )
        } else if p_lower.ends_with(".json") || p_lower.ends_with(".yaml") || p_lower.ends_with(".yml") || p_lower.ends_with(".toml") {
            (
                "Configuration & Project Manifest",
                "Defines build configurations, runtime parameters, container topologies, or dependency manifests.".to_string(),
            )
        } else if p_lower.ends_with(".md") {
            (
                "Project Documentation",
                "Provides architecture overviews, developer onboarding guides, and operational runbooks.".to_string(),
            )
        } else {
            (
                "Domain Business Logic",
                "Encapsulates domain algorithms, reusable services, and core operational workflows.".to_string(),
            )
        };

        Ok(Some(FileIntelligenceDto {
            file_path: file_path.to_string(),
            role: role.to_string(),
            explanation,
            blast_radius_level,
            direct_dependants_count: dep_count,
            direct_dependants,
            external_packages_used,
            internal_dependencies,
            exported_symbols,
            api_endpoints,
        }))
    }
}

fn classify_package_category(name: &str) -> &'static str {
    let lower = name.to_ascii_lowercase();
    if lower.contains("prisma") || lower.contains("drizzle") || lower == "pg" || lower.contains("mysql") || lower.contains("sqlite") || lower.contains("mongo") || lower.contains("redis") || lower.contains("typeorm") || lower.contains("sequelize") {
        "Database & Persistence"
    } else if lower == "react" || lower == "react-dom" || lower.contains("vue") || lower.contains("svelte") || lower.contains("tailwind") || lower.contains("lucide") || lower.contains("radix") || lower.contains("shadcn") || lower.contains("framer") || lower.contains("icon") || lower.contains("ui") {
        "UI & Components"
    } else if lower == "next" || lower == "express" || lower == "fastapi" || lower == "flask" || lower == "remix" || lower == "astro" || lower == "nuxt" || lower == "hono" || lower == "koa" || lower == "nest" || lower == "@nestjs/core" {
        "Web Framework & Routing"
    } else if lower.contains("zod") || lower.contains("yup") || lower.contains("joi") || lower.contains("valibot") || lower == "typescript" {
        "Validation & Type Safety"
    } else if lower.contains("zustand") || lower.contains("redux") || lower.contains("query") || lower.contains("axios") || lower.contains("swr") || lower.contains("trpc") {
        "State & Network"
    } else if lower.contains("auth") || lower.contains("jwt") || lower.contains("jose") || lower.contains("bcrypt") || lower.contains("clerk") || lower.contains("lucia") {
        "Auth & Security"
    } else if lower.contains("vite") || lower.contains("turbo") || lower.contains("vitest") || lower.contains("jest") || lower.contains("eslint") || lower.contains("prettier") || lower.contains("postcss") || lower.contains("babel") || lower.contains("tsup") {
        "Build & Tooling"
    } else {
        "Utility & Domain Logic"
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SymbolSummaryDto {
    pub name: String,
    pub kind: String,
    pub line_number: i64,
    pub is_exported: bool,
    pub complexity: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileApiEndpointDto {
    pub method: String,
    pub route: String,
    pub framework: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileIntelligenceDto {
    pub file_path: String,
    pub role: String,
    pub explanation: String,
    pub blast_radius_level: String,
    pub direct_dependants_count: usize,
    pub direct_dependants: Vec<String>,
    pub external_packages_used: Vec<String>,
    pub internal_dependencies: Vec<String>,
    pub exported_symbols: Vec<SymbolSummaryDto>,
    #[serde(default)]
    pub api_endpoints: Vec<FileApiEndpointDto>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PackageInventoryItem {
    pub name: String,
    pub version: Option<String>,
    pub category: String,
    pub dep_type: String,
    pub manifest_file: String,
    pub usage_count: usize,
    pub usage_files: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::connection::open_in_memory;
    use crate::store::migrations::run_migrations;
    use crate::store::projects::create_or_get_project;

    #[test]
    fn test_graph_store_edges_and_findings() {
        let mut conn = open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let project_id = create_or_get_project(&conn, "Test Project", "/tmp/test").unwrap().id;

        // Insert two test files
        conn.execute(
            "INSERT INTO files (project_id, relative_path, file_name, size_bytes, content_hash, status)
             VALUES (?1, 'src/a.ts', 'a.ts', 100, 'hash1', 'parsed')",
            params![project_id],
        ).unwrap();
        let file_a_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO files (project_id, relative_path, file_name, size_bytes, content_hash, status)
             VALUES (?1, 'src/b.ts', 'b.ts', 120, 'hash2', 'parsed')",
            params![project_id],
        ).unwrap();
        let file_b_id = conn.last_insert_rowid();

        let edge = ImportEdge {
            source_file_id: file_a_id,
            source_file_path: "src/a.ts".to_string(),
            target_file_id: Some(file_b_id),
            target_file_path: Some("src/b.ts".to_string()),
            target_module: "./b".to_string(),
            imported_name: "helper".to_string(),
            is_type_only: false,
            line_number: 1,
            resolution_status: ResolutionStatus::Internal,
            source_evidence_id: None,
        };

        GraphStore::insert_import_edges(&mut conn, project_id, &[edge]).unwrap();

        let edges = GraphStore::get_import_edges(&conn, project_id).unwrap();
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].source_file_path, "src/a.ts");
        assert_eq!(edges[0].target_file_path.as_deref(), Some("src/b.ts"));

        // Insert finding
        GraphStore::insert_finding(
            &conn,
            project_id,
            "circular_dependency",
            "Circular cycle detected",
            "src/a.ts <-> src/b.ts",
            "medium",
            "confirmed",
            None,
            r#"{"cycle": ["src/a.ts", "src/b.ts"]}"#,
        ).unwrap();

        let overview = GraphStore::get_dependency_overview(&conn, project_id).unwrap();
        assert_eq!(overview.internal_edges_count, 1);
        assert_eq!(overview.circular_cycles_count, 1);
    }

    #[test]
    fn test_no_import_edge_without_provenance_evidence() {
        let mut conn = open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let project_id = create_or_get_project(&conn, "Test Evidence", "/tmp/evidence").unwrap().id;

        conn.execute(
            "INSERT INTO files (project_id, relative_path, file_name, size_bytes, content_hash, status)
             VALUES (?1, 'src/main.ts', 'main.ts', 100, 'hash1', 'parsed')",
            params![project_id],
        ).unwrap();
        let file_id = conn.last_insert_rowid();

        let edge = ImportEdge {
            source_file_id: file_id,
            source_file_path: "src/main.ts".to_string(),
            target_file_id: None,
            target_file_path: None,
            target_module: "react".to_string(),
            imported_name: "useState".to_string(),
            is_type_only: false,
            line_number: 1,
            resolution_status: ResolutionStatus::External,
            source_evidence_id: None,
        };

        GraphStore::insert_import_edges(&mut conn, project_id, &[edge]).unwrap();

        // Check that source_evidence_id was automatically populated
        let count_null: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM import_edges WHERE source_evidence_id IS NULL",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count_null, 0, "No import_edges row should ever have NULL source_evidence_id");

        let edges = GraphStore::get_import_edges(&conn, project_id).unwrap();
        assert!(edges[0].source_evidence_id.is_some());
    }

    #[test]
    fn test_get_file_intelligence_with_symbols_and_endpoints() {
        let conn = open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let project_id = create_or_get_project(&conn, "Test Intel", "/tmp/intel").unwrap().id;

        // 1. Insert file
        conn.execute(
            "INSERT INTO files (project_id, relative_path, file_name, size_bytes, content_hash, status)
             VALUES (?1, 'apps/api/src/app/api/academies/[id]/route.ts', 'route.ts', 448, 'hash_abc', 'parsed')",
            params![project_id],
        ).unwrap();
        let file_id = conn.last_insert_rowid();

        // 2. Insert source evidence and symbol
        conn.execute(
            "INSERT INTO source_evidence (project_id, file_path, start_line, end_line, start_column, end_column, snippet, confidence, evidence_type)
             VALUES (?1, 'apps/api/src/app/api/academies/[id]/route.ts', 15, 30, 1, 10, 'export async function GET()', 'confirmed', 'ast_node')",
            params![project_id],
        ).unwrap();
        let evidence_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO symbols (project_id, file_id, stable_id, name, qualified_name, kind, is_exported, source_evidence_id)
             VALUES (?1, ?2, 'sym_get_1', 'GET', 'api.academies.GET', 'function', 1, ?3)",
            params![project_id, file_id, evidence_id],
        ).unwrap();
        let sym_id = conn.last_insert_rowid();

        conn.execute(
            "INSERT INTO functions (project_id, file_id, symbol_id, name, cyclomatic_complexity)
             VALUES (?1, ?2, ?3, 'GET', 4)",
            params![project_id, file_id, sym_id],
        ).unwrap();

        // 3. Insert API endpoint
        conn.execute(
            "INSERT INTO api_endpoints (project_id, framework, method, route, file_path, start_line, end_line, confidence, source_evidence_id)
             VALUES (?1, 'Next.js App Router', 'GET', '/api/academies/[id]', 'apps/api/src/app/api/academies/[id]/route.ts', 15, 30, 'confirmed', ?2)",
            params![project_id, evidence_id],
        ).unwrap();

        // 4. Test get_file_intelligence
        let intel_opt = GraphStore::get_file_intelligence(&conn, project_id, "apps/api/src/app/api/academies/[id]/route.ts").unwrap();
        assert!(intel_opt.is_some());
        let intel = intel_opt.unwrap();

        assert_eq!(intel.role, "API Gateway Route Handler");
        assert_eq!(intel.exported_symbols.len(), 1);
        assert_eq!(intel.exported_symbols[0].name, "GET");
        assert_eq!(intel.exported_symbols[0].line_number, 15);
        assert_eq!(intel.exported_symbols[0].complexity, Some(4));
        assert!(intel.exported_symbols[0].is_exported);

        assert_eq!(intel.api_endpoints.len(), 1);
        assert_eq!(intel.api_endpoints[0].method, "GET");
        assert_eq!(intel.api_endpoints[0].route, "/api/academies/[id]");

        // Also test Windows backslash matching
        let intel_win = GraphStore::get_file_intelligence(&conn, project_id, "apps\\api\\src\\app\\api\\academies\\[id]\\route.ts").unwrap();
        assert!(intel_win.is_some());
    }
}
