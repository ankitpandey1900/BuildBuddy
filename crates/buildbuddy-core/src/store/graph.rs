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
}
