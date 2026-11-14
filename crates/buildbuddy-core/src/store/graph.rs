use rusqlite::{params, Connection, Result};

use crate::graph::model::{DependencyOverview, ImportEdge, ResolutionStatus};
use crate::manifest::ManifestDependency;

pub struct GraphStore;

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
                stmt.execute(params![
                    project_id,
                    edge.source_file_id,
                    edge.target_file_id,
                    edge.target_module,
                    edge.imported_name,
                    if edge.is_type_only { 1 } else { 0 },
                    edge.line_number as i64,
                    edge.resolution_status.as_str(),
                    edge.source_evidence_id,
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
}
