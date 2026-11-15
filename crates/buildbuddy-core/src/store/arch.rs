use rusqlite::{params, Connection, Result};
use crate::arch::model::{
    AnalysisCompletionDto, ArchitectureModel, Confidence, EntryPoint, EvidenceItem,
    FrameworkDetection, LanguageMetric, LayerLabel, ModuleGroup, OverviewDataDto, OverviewMetrics,
};

pub struct ArchStore;

impl ArchStore {
    pub fn persist_architecture(
        conn: &mut Connection,
        project_id: i64,
        frameworks: &[FrameworkDetection],
        entry_points: &[EntryPoint],
        modules: &[ModuleGroup],
        architecture_model: &ArchitectureModel,
    ) -> Result<()> {
        let tx = conn.transaction()?;

        // Clean previous records for this project
        tx.execute("DELETE FROM frameworks WHERE project_id = ?1", params![project_id])?;
        tx.execute("DELETE FROM entry_points WHERE project_id = ?1", params![project_id])?;
        tx.execute("DELETE FROM modules WHERE project_id = ?1", params![project_id])?;
        tx.execute(
            "DELETE FROM diagrams WHERE project_id = ?1 AND diagram_type = 'architecture'",
            params![project_id],
        )?;

        // 1. Frameworks
        for fw in frameworks {
            let mut primary_evidence_id: Option<i64> = None;

            for ev in &fw.evidence {
                let ev_type = match ev.signal_type.as_str() {
                    "manifest_dependency" => "manifest_entry",
                    "config_file" => "config_file",
                    "import_usage" => "import_stmt",
                    "source_pattern" => "source_pattern",
                    other => other,
                };

                let eid: i64 = tx.query_row(
                    "INSERT INTO source_evidence (
                        project_id, file_path, start_line, end_line,
                        start_column, end_column, snippet, confidence, evidence_type
                    ) VALUES (?1, ?2, ?3, ?4, 0, 0, ?5, ?6, ?7)
                    RETURNING id",
                    params![
                        project_id,
                        ev.file_path,
                        ev.start_line as i64,
                        ev.end_line as i64,
                        ev.snippet,
                        fw.confidence.as_str(),
                        ev_type,
                    ],
                    |row| row.get(0),
                )?;

                if primary_evidence_id.is_none() {
                    primary_evidence_id = Some(eid);
                }
            }

            let evidence_json = serde_json::to_string(&fw.evidence).unwrap_or_else(|_| "[]".to_string());

            tx.execute(
                "INSERT INTO frameworks (
                    project_id, name, version, confidence, evidence_json, source_evidence_id
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    project_id,
                    fw.name,
                    fw.version,
                    fw.confidence.as_str(),
                    evidence_json,
                    primary_evidence_id,
                ],
            )?;
        }

        // 2. Entry points
        for ep in entry_points {
            let eid: i64 = tx.query_row(
                "INSERT INTO source_evidence (
                    project_id, file_path, start_line, end_line,
                    start_column, end_column, snippet, confidence, evidence_type
                ) VALUES (?1, ?2, ?3, ?4, 0, 0, ?5, ?6, 'entry_point')
                RETURNING id",
                params![
                    project_id,
                    ep.file_path,
                    ep.start_line as i64,
                    ep.end_line as i64,
                    ep.snippet,
                    ep.confidence.as_str(),
                ],
                |row| row.get(0),
            )?;

            tx.execute(
                "INSERT INTO entry_points (
                    project_id, name, entry_type, file_path, start_line, end_line,
                    snippet, confidence, source_evidence_id
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    project_id,
                    ep.name,
                    ep.entry_type,
                    ep.file_path,
                    ep.start_line as i64,
                    ep.end_line as i64,
                    ep.snippet,
                    ep.confidence.as_str(),
                    eid,
                ],
            )?;
        }

        // 3. Modules
        for m in modules {
            let eid: i64 = tx.query_row(
                "INSERT INTO source_evidence (
                    project_id, file_path, start_line, end_line,
                    start_column, end_column, snippet, confidence, evidence_type
                ) VALUES (?1, ?2, 1, 1, 0, 0, ?3, 'static', 'heuristic')
                RETURNING id",
                params![
                    project_id,
                    m.root_directory,
                    format!("Module {} in {}", m.name, m.root_directory),
                ],
                |row| row.get(0),
            )?;

            tx.execute(
                "INSERT INTO modules (
                    project_id, name, root_directory, layer, file_count, cohesion_score, source_evidence_id
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    project_id,
                    m.name,
                    m.root_directory,
                    m.layer.as_str(),
                    m.file_count as i64,
                    m.cohesion_score,
                    eid,
                ],
            )?;
        }

        // 4. Architecture Diagram
        let model_json = serde_json::to_string(architecture_model).unwrap_or_else(|_| "{}".to_string());
        tx.execute(
            "INSERT INTO diagrams (
                project_id, diagram_type, title, model_json, layout_engine
            ) VALUES (?1, 'architecture', 'System Architecture', ?2, 'elk')",
            params![project_id, model_json],
        )?;

        tx.commit()?;
        Ok(())
    }

    pub fn get_frameworks(conn: &Connection, project_id: i64) -> Result<Vec<FrameworkDetection>> {
        let mut stmt = conn.prepare(
            "SELECT name, version, confidence, evidence_json FROM frameworks WHERE project_id = ?1 ORDER BY name ASC",
        )?;
        let rows = stmt.query_map(params![project_id], |row| {
            let name: String = row.get(0)?;
            let version: Option<String> = row.get(1)?;
            let conf_str: String = row.get(2)?;
            let ev_json: String = row.get(3)?;
            let evidence: Vec<EvidenceItem> = serde_json::from_str(&ev_json).unwrap_or_default();

            Ok(FrameworkDetection {
                name,
                version,
                confidence: Confidence::from_str(&conf_str),
                evidence,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn get_entry_points(conn: &Connection, project_id: i64) -> Result<Vec<EntryPoint>> {
        let mut stmt = conn.prepare(
            "SELECT name, entry_type, file_path, start_line, end_line, snippet, confidence
             FROM entry_points WHERE project_id = ?1 ORDER BY file_path ASC, start_line ASC",
        )?;
        let rows = stmt.query_map(params![project_id], |row| {
            let conf_str: String = row.get(6)?;
            Ok(EntryPoint {
                name: row.get(0)?,
                entry_type: row.get(1)?,
                file_path: row.get(2)?,
                start_line: row.get::<_, i64>(3)? as usize,
                end_line: row.get::<_, i64>(4)? as usize,
                snippet: row.get(5)?,
                confidence: Confidence::from_str(&conf_str),
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn get_modules(conn: &Connection, project_id: i64) -> Result<Vec<ModuleGroup>> {
        let mut stmt = conn.prepare(
            "SELECT name, root_directory, layer, file_count, cohesion_score
             FROM modules WHERE project_id = ?1 ORDER BY name ASC",
        )?;
        let rows = stmt.query_map(params![project_id], |row| {
            let layer_str: String = row.get(2)?;
            Ok(ModuleGroup {
                name: row.get(0)?,
                root_directory: row.get(1)?,
                layer: LayerLabel::from_str(&layer_str),
                file_count: row.get::<_, i64>(3)? as usize,
                cohesion_score: row.get(4)?,
                files: Vec::new(),
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn get_architecture_model(conn: &Connection, project_id: i64) -> Result<Option<ArchitectureModel>> {
        let mut stmt = conn.prepare(
            "SELECT model_json FROM diagrams WHERE project_id = ?1 AND diagram_type = 'architecture' ORDER BY id DESC LIMIT 1",
        )?;
        let mut rows = stmt.query(params![project_id])?;
        if let Some(row) = rows.next()? {
            let json_str: String = row.get(0)?;
            let model: ArchitectureModel = serde_json::from_str(&json_str).unwrap_or(ArchitectureModel {
                nodes: Vec::new(),
                edges: Vec::new(),
                groups: Vec::new(),
            });
            Ok(Some(model))
        } else {
            Ok(None)
        }
    }

    pub fn get_overview_data(conn: &Connection, project_id: i64) -> Result<OverviewDataDto> {
        let (project_name, root_path) = conn.query_row(
            "SELECT name, root_path FROM projects WHERE id = ?1",
            params![project_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;

        let total_files: usize = conn.query_row(
            "SELECT count(*) FROM files WHERE project_id = ?1",
            params![project_id],
            |r| r.get(0),
        ).unwrap_or(0);

        let total_modules: usize = conn.query_row(
            "SELECT count(*) FROM modules WHERE project_id = ?1",
            params![project_id],
            |r| r.get(0),
        ).unwrap_or(0);

        let total_symbols: usize = conn.query_row(
            "SELECT count(*) FROM symbols WHERE project_id = ?1",
            params![project_id],
            |r| r.get(0),
        ).unwrap_or(0);

        let total_functions: usize = conn.query_row(
            "SELECT count(*) FROM functions WHERE project_id = ?1",
            params![project_id],
            |r| r.get(0),
        ).unwrap_or(0);

        let total_classes: usize = conn.query_row(
            "SELECT count(*) FROM classes WHERE project_id = ?1",
            params![project_id],
            |r| r.get(0),
        ).unwrap_or(0);

        let total_entry_points: usize = conn.query_row(
            "SELECT count(*) FROM entry_points WHERE project_id = ?1",
            params![project_id],
            |r| r.get(0),
        ).unwrap_or(0);

        let total_dependencies: usize = conn.query_row(
            "SELECT count(*) FROM manifest_dependencies WHERE project_id = ?1",
            params![project_id],
            |r| r.get(0),
        ).unwrap_or(0);

        let unsupported_files_count: usize = conn.query_row(
            "SELECT count(*) FROM files WHERE project_id = ?1 AND status = 'unsupported'",
            params![project_id],
            |r| r.get(0),
        ).unwrap_or(0);

        let partial_files_count: usize = conn.query_row(
            "SELECT count(*) FROM files WHERE project_id = ?1 AND status = 'partial'",
            params![project_id],
            |r| r.get(0),
        ).unwrap_or(0);

        let metrics = OverviewMetrics {
            total_files,
            total_modules,
            total_symbols,
            total_functions,
            total_classes,
            total_entry_points,
            total_dependencies,
            unsupported_files_count,
            partial_files_count,
        };

        // Query language distribution
        let mut lang_stmt = conn.prepare(
            "SELECT extension, count(*), sum(line_count) FROM files WHERE project_id = ?1 GROUP BY extension",
        )?;
        let mut lang_map: std::collections::HashMap<String, (usize, usize)> = std::collections::HashMap::new();
        let mut total_lines = 0usize;

        let lang_rows = lang_stmt.query_map(params![project_id], |row| {
            let ext: Option<String> = row.get(0)?;
            let file_count: usize = row.get(1)?;
            let line_count: usize = row.get::<_, Option<usize>>(2)?.unwrap_or(0);
            Ok((ext, file_count, line_count))
        })?;

        for r in lang_rows {
            let (ext, f_count, l_count) = r?;
            total_lines += l_count;
            let lang_name = match ext.as_deref().unwrap_or("") {
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
            let entry = lang_map.entry(lang_name.to_string()).or_insert((0, 0));
            entry.0 += f_count;
            entry.1 += l_count;
        }

        let mut languages: Vec<LanguageMetric> = lang_map
            .into_iter()
            .map(|(name, (f_cnt, l_cnt))| {
                let percentage = if total_lines > 0 {
                    ((l_cnt as f64 / total_lines as f64) * 1000.0).round() / 10.0
                } else if total_files > 0 {
                    ((f_cnt as f64 / total_files as f64) * 1000.0).round() / 10.0
                } else {
                    0.0
                };
                LanguageMetric {
                    name,
                    file_count: f_cnt,
                    line_count: l_cnt,
                    percentage,
                }
            })
            .collect();
        languages.sort_by(|a, b| b.line_count.cmp(&a.line_count));

        let frameworks = Self::get_frameworks(conn, project_id)?;
        let entry_points = Self::get_entry_points(conn, project_id)?;
        let modules = Self::get_modules(conn, project_id)?;

        let completion = {
            let mut stmt = conn.prepare(
                "SELECT status, started_at, completed_at, duration_ms, files_scanned, files_parsed
                 FROM analysis_runs WHERE project_id = ?1 ORDER BY id DESC LIMIT 1",
            )?;
            let mut rows = stmt.query(params![project_id])?;
            if let Some(row) = rows.next()? {
                Some(AnalysisCompletionDto {
                    status: row.get(0)?,
                    started_at: row.get(1)?,
                    completed_at: row.get(2)?,
                    duration_ms: row.get(3)?,
                    files_scanned: row.get::<_, i64>(4)? as usize,
                    files_parsed: row.get::<_, i64>(5)? as usize,
                })
            } else {
                None
            }
        };

        Ok(OverviewDataDto {
            project_name,
            root_path,
            metrics,
            languages,
            frameworks,
            entry_points,
            modules,
            completion,
        })
    }
}
