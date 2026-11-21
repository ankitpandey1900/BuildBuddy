use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::arch::ArchitectureAnalyzer;
use crate::api::ApiExtractor;
use crate::database::DatabaseExtractor;
use crate::health::SecretDetector;
use crate::arch::model::ProjectArchReport;
use crate::graph::call_resolver::CallResolver;
use crate::graph::FileImportItem;
use crate::graph::ProjectGraphResolver;
use crate::manifest::package_json::parse_package_json;
use crate::manifest::python::{parse_pyproject_toml, parse_requirements_txt};
use crate::manifest::ManifestDependency;
use crate::parser::traits::FileParseResult;
use crate::parser::{FileToParse, ParserManager, ParserWorkerPool, WorkerPoolConfig};
use crate::scanner::incremental::IncrementalEngine;
use crate::scanner::walker::scan_directory;
use crate::store::arch::ArchStore;
use crate::store::api::ApiStore;
use crate::store::database::DatabaseStore;
use crate::store::files::batch_insert_or_update_files;
use crate::store::graph::GraphStore;
use crate::store::symbols::persist_file_parse_result;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PipelineStage {
    Scanning,
    Scanned,
    Parsing,
    Analyzing,
    Completed,
    Failed,
    Cancelled,
}

impl PipelineStage {
    pub fn as_str(&self) -> &'static str {
        match self {
            PipelineStage::Scanning => "in_progress",
            PipelineStage::Scanned => "scanned",
            PipelineStage::Parsing => "parsing",
            PipelineStage::Analyzing => "analyzing",
            PipelineStage::Completed => "completed",
            PipelineStage::Failed => "failed",
            PipelineStage::Cancelled => "cancelled",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineProgress {
    pub project_id: i64,
    pub stage: PipelineStage,
    pub message: String,
    pub count: usize,
    pub total: usize,
}

pub struct PipelineRunner;

impl PipelineRunner {
    pub fn run<F>(
        conn: &mut Connection,
        project_id: i64,
        run_id: i64,
        root_path: &Path,
        cancel_flag: Arc<AtomicBool>,
        progress_cb: F,
    ) -> Result<ProjectArchReport, String>
    where
        F: Fn(PipelineProgress) + Send + Sync + 'static,
    {
        let start_time = Instant::now();
        let progress_cb = Arc::new(progress_cb);

        // ================= STAGE 1: SCANNING =================
        progress_cb(PipelineProgress {
            project_id,
            stage: PipelineStage::Scanning,
            message: "Scanning directory...".to_string(),
            count: 0,
            total: 0,
        });

        let scanned_files = scan_directory(
            root_path,
            &[],
            cancel_flag.clone(),
            |progress| {
                progress_cb(PipelineProgress {
                    project_id,
                    stage: PipelineStage::Scanning,
                    message: format!("Scanning: {}", progress.current_file),
                    count: progress.files_scanned,
                    total: 0,
                });
            },
        ).map_err(|e| e.to_string())?;

        if cancel_flag.load(Ordering::Relaxed) {
            conn.execute(
                "UPDATE analysis_runs SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP WHERE id = ?1",
                params![run_id],
            ).map_err(|e| e.to_string())?;
            return Err("Scan cancelled by user".to_string());
        }

        // Apply incremental plan
        let plan = IncrementalEngine::compute_plan(conn, project_id, &scanned_files)
            .map_err(|e| e.to_string())?;
        IncrementalEngine::apply_plan_deletions(conn, &plan)
            .map_err(|e| e.to_string())?;

        let mut to_update = plan.added;
        for (_, m) in plan.modified {
            to_update.push(m);
        }

        if !to_update.is_empty() {
            batch_insert_or_update_files(conn, project_id, run_id, &to_update)
                .map_err(|e| e.to_string())?;
        }

        let total_scanned = scanned_files.len();
        let _ = conn.execute(
            "UPDATE analysis_runs 
             SET status = 'scanned', files_discovered = ?1, files_scanned = ?1 
             WHERE id = ?2",
            params![total_scanned as i64, run_id],
        ).or_else(|_| {
            conn.execute(
                "UPDATE analysis_runs 
                 SET files_discovered = ?1, files_scanned = ?1 
                 WHERE id = ?2",
                params![total_scanned as i64, run_id],
            )
        });

        progress_cb(PipelineProgress {
            project_id,
            stage: PipelineStage::Scanned,
            message: format!("Scanned {} files", total_scanned),
            count: total_scanned,
            total: total_scanned,
        });

        if cancel_flag.load(Ordering::Relaxed) {
            conn.execute(
                "UPDATE analysis_runs SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP WHERE id = ?1",
                params![run_id],
            ).map_err(|e| e.to_string())?;
            return Err("Pipeline cancelled".to_string());
        }

        // ================= STAGE 2: PARSING =================
        let _ = conn.execute(
            "UPDATE analysis_runs SET status = 'parsing' WHERE id = ?1",
            params![run_id],
        );

        progress_cb(PipelineProgress {
            project_id,
            stage: PipelineStage::Parsing,
            message: "Parsing source files...".to_string(),
            count: 0,
            total: 0,
        });

        let files_to_parse: Vec<FileToParse> = {
            let mut stmt = conn.prepare(
                "SELECT id, relative_path, extension FROM files WHERE project_id = ?1 AND status = 'pending'",
            ).map_err(|e| e.to_string())?;
            let rows = stmt.query_map([project_id], |r| {
                Ok(FileToParse {
                    file_id: r.get(0)?,
                    relative_path: r.get(1)?,
                    extension: r.get(2)?,
                })
            }).map_err(|e| e.to_string())?;

            let mut list = Vec::new();
            for r in rows {
                if let Ok(item) = r {
                    list.push(item);
                }
            }
            list
        };

        let total_to_parse = files_to_parse.len();
        if total_to_parse > 0 {
            let pool = ParserWorkerPool::new(WorkerPoolConfig::default());
            let cancel_for_worker = cancel_flag.clone();
            let cb_parse = progress_cb.clone();
            let parsed_results = pool.parse_project_files(
                root_path,
                files_to_parse,
                cancel_for_worker,
                move |p| {
                    cb_parse(PipelineProgress {
                        project_id,
                        stage: PipelineStage::Parsing,
                        message: format!("Parsing: {}", p.current_file),
                        count: p.files_parsed,
                        total: p.total_files,
                    });
                },
            ).map_err(|e| e.to_string())?;

            for (file_id, result) in &parsed_results {
                if let Err(e) = persist_file_parse_result(conn, project_id, *file_id, result) {
                    eprintln!("Failed to persist parsed symbols for {}: {}", result.relative_path, e);
                    let err_msg = format!("Failed to persist symbols: {}", e);
                    let _ = conn.execute(
                        "UPDATE files SET status = 'error', error_message = ?1 WHERE id = ?2",
                        params![err_msg, *file_id],
                    );
                }
            }
        }

        // Resolve cross-file calls
        CallResolver::resolve_project_calls(conn, project_id).ok();

        let parsed_count: i64 = conn.query_row(
            "SELECT count(*) FROM files WHERE project_id = ?1 AND status = 'parsed'",
            params![project_id],
            |r| r.get(0),
        ).unwrap_or(0);

        conn.execute(
            "UPDATE analysis_runs SET files_parsed = ?1 WHERE id = ?2",
            params![parsed_count, run_id],
        ).ok();

        if cancel_flag.load(Ordering::Relaxed) {
            conn.execute(
                "UPDATE analysis_runs SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP WHERE id = ?1",
                params![run_id],
            ).map_err(|e| e.to_string())?;
            return Err("Pipeline cancelled".to_string());
        }

        // ================= STAGE 3: ANALYZING =================
        let _ = conn.execute(
            "UPDATE analysis_runs SET status = 'analyzing' WHERE id = ?1",
            params![run_id],
        );

        progress_cb(PipelineProgress {
            project_id,
            stage: PipelineStage::Analyzing,
            message: "Analyzing architecture & dependencies...".to_string(),
            count: 0,
            total: 0,
        });

        let files: Vec<(i64, String)> = {
            let mut stmt = conn
                .prepare("SELECT id, relative_path FROM files WHERE project_id = ?1")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([project_id], |row| Ok((row.get(0)?, row.get(1)?)))
                .map_err(|e| e.to_string())?;
            let mut list = Vec::new();
            for r in rows {
                if let Ok(item) = r {
                    list.push(item);
                }
            }
            list
        };

        // Clean previous dependencies so fresh analysis is consistent
        conn.execute("DELETE FROM import_edges WHERE project_id = ?1", params![project_id]).ok();
        conn.execute("DELETE FROM manifest_dependencies WHERE project_id = ?1", params![project_id]).ok();

        let parser = ParserManager::new();
        let mut all_files = Vec::new();
        let mut parsed_results = Vec::new();
        let mut manifest_deps: Vec<ManifestDependency> = Vec::new();
        let mut raw_imports = Vec::new();

        for (file_id, rel_path) in &files {
            let abs_path = root_path.join(rel_path);
            let content = fs::read_to_string(&abs_path).unwrap_or_default();
            all_files.push((rel_path.clone(), content.clone()));

            let is_package_json = rel_path == "package.json" 
                || (rel_path.ends_with("/package.json") || rel_path.ends_with(r"\package.json"));
            let is_requirements = rel_path == "requirements.txt" 
                || (rel_path.ends_with("/requirements.txt") || rel_path.ends_with(r"\requirements.txt"));
            let is_pyproject = rel_path == "pyproject.toml" 
                || (rel_path.ends_with("/pyproject.toml") || rel_path.ends_with(r"\pyproject.toml"));

            if is_package_json {
                if let Ok(deps) = parse_package_json(&content, rel_path) {
                    GraphStore::insert_manifest_dependencies(conn, project_id, *file_id, &deps).ok();
                    manifest_deps.extend(deps);
                }
            } else if is_requirements {
                if let Ok(deps) = parse_requirements_txt(&content, rel_path) {
                    GraphStore::insert_manifest_dependencies(conn, project_id, *file_id, &deps).ok();
                    manifest_deps.extend(deps);
                }
            } else if is_pyproject {
                if let Ok(deps) = parse_pyproject_toml(&content, rel_path) {
                    GraphStore::insert_manifest_dependencies(conn, project_id, *file_id, &deps).ok();
                    manifest_deps.extend(deps);
                }
            }

            let ext = abs_path.extension().and_then(|s| s.to_str());
            if let Some(e) = ext {
                if matches!(e, "ts" | "tsx" | "js" | "jsx" | "py") {
                    if let Ok(parsed) = parser.parse_source(rel_path, Some(e), &content) {
                        for imp in &parsed.imports {
                            raw_imports.push(FileImportItem {
                                source_file_id: *file_id,
                                source_file_path: rel_path.clone(),
                                source_module: imp.source_module.clone(),
                                imported_name: imp.imported_name.clone(),
                                is_type_only: imp.is_type_only,
                                line_number: imp.line_number,
                                source_evidence_id: None,
                            });
                        }
                        parsed_results.push((rel_path.clone(), parsed, content));
                    }
                }
            }
        }

        let tsconfig_content = fs::read_to_string(root_path.join("tsconfig.json")).ok();
        let resolver = ProjectGraphResolver::new(&files, tsconfig_content.as_deref());
        let edges = resolver.resolve_all(&raw_imports);
        GraphStore::insert_import_edges(conn, project_id, &edges).ok();

        let all_files_refs: Vec<(String, &str)> = all_files
            .iter()
            .map(|(p, c)| (p.clone(), c.as_str()))
            .collect();

        let parsed_refs: Vec<(String, &FileParseResult, &str)> = parsed_results
            .iter()
            .map(|(p, res, c)| (p.clone(), res, c.as_str()))
            .collect();

        let report = ArchitectureAnalyzer::analyze(&all_files_refs, &parsed_refs, &manifest_deps, &edges);

        let endpoints = ApiExtractor::extract(&all_files_refs);
        let client_calls = ApiExtractor::extract_client_calls(&all_files_refs);
        ApiStore::replace_endpoints(conn, project_id, &endpoints, &client_calls).map_err(|e| e.to_string())?;
        let (engines, schemas) = DatabaseExtractor::extract(&all_files_refs);
        DatabaseStore::replace(conn, project_id, &engines, &schemas).map_err(|e| e.to_string())?;
        GraphStore::refresh_complexity_findings(conn, project_id).map_err(|e| e.to_string())?;
        let secret_candidates = SecretDetector::scan(&all_files_refs);
        GraphStore::refresh_health_findings(conn, project_id, &secret_candidates).map_err(|e| e.to_string())?;

        ArchStore::persist_architecture(
            conn,
            project_id,
            &report.frameworks,
            &report.declared_only,
            &report.entry_points,
            &report.modules,
            &report.architecture_model,
        ).map_err(|e| e.to_string())?;

        // ================= STAGE 4: COMPLETED =================
        let duration_ms = start_time.elapsed().as_millis() as u64;
        conn.execute(
            "UPDATE analysis_runs 
             SET status = 'completed', completed_at = CURRENT_TIMESTAMP, duration_ms = ?1 
             WHERE id = ?2",
            params![duration_ms as i64, run_id],
        ).map_err(|e| e.to_string())?;

        progress_cb(PipelineProgress {
            project_id,
            stage: PipelineStage::Completed,
            message: "Analysis completed successfully".to_string(),
            count: total_scanned,
            total: total_scanned,
        });

        Ok(report)
    }
}
