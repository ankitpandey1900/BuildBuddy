use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;

use rayon::prelude::*;

use crate::parser::manager::ParserManager;
use crate::parser::traits::{FileParseResult, ParserLimits};

#[derive(Debug, Clone)]
pub struct WorkerPoolConfig {
    pub concurrency: usize,
    pub limits: ParserLimits,
}

impl Default for WorkerPoolConfig {
    fn default() -> Self {
        let concurrency = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4);
        Self {
            concurrency,
            limits: ParserLimits::default(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ParseProgress {
    pub files_parsed: usize,
    pub total_files: usize,
    pub current_file: String,
}

#[derive(Debug, Clone)]
pub struct FileToParse {
    pub file_id: i64,
    pub relative_path: String,
    pub extension: Option<String>,
}

pub struct ParserWorkerPool {
    config: WorkerPoolConfig,
    manager: ParserManager,
}

impl ParserWorkerPool {
    pub fn new(config: WorkerPoolConfig) -> Self {
        let manager = ParserManager::with_limits(config.limits.clone());
        Self { config, manager }
    }

    pub fn parse_project_files<F>(
        &self,
        project_root: &Path,
        files: Vec<FileToParse>,
        cancel_flag: Arc<AtomicBool>,
        on_progress: F,
    ) -> Result<Vec<(i64, FileParseResult)>, String>
    where
        F: Fn(ParseProgress) + Send + Sync + 'static,
    {
        let pool = rayon::ThreadPoolBuilder::new()
            .num_threads(self.config.concurrency)
            .build()
            .map_err(|e| format!("Failed to create Rayon thread pool: {}", e))?;

        let total_files = files.len();
        let parsed_counter = Arc::new(AtomicUsize::new(0));

        let results: Vec<(i64, FileParseResult)> = pool.install(|| {
            files
                .into_par_iter()
                .filter_map(|file| {
                    if cancel_flag.load(Ordering::Relaxed) {
                        return None;
                    }

                    let full_path = project_root.join(&file.relative_path);
                    let source = match fs::read_to_string(&full_path) {
                        Ok(s) => s,
                        Err(e) => {
                            // If unreadable, record error
                            return Some((
                                file.file_id,
                                FileParseResult {
                                    relative_path: file.relative_path,
                                    language: file.extension.unwrap_or_default(),
                                    status: crate::parser::traits::ParseStatus::Error,
                                    symbols: Vec::new(),
                                    imports: Vec::new(),
                                    exports: Vec::new(),
                                    errors: vec![format!("Failed to read file: {}", e)],
                                },
                            ));
                        }
                    };

                    let res = match self.manager.parse_source(
                        &file.relative_path,
                        file.extension.as_deref(),
                        &source,
                    ) {
                        Ok(r) => r,
                        Err(e) => FileParseResult {
                            relative_path: file.relative_path.clone(),
                            language: file.extension.unwrap_or_default(),
                            status: crate::parser::traits::ParseStatus::Error,
                            symbols: Vec::new(),
                            imports: Vec::new(),
                            exports: Vec::new(),
                            errors: vec![e.to_string()],
                        },
                    };

                    let count = parsed_counter.fetch_add(1, Ordering::Relaxed) + 1;
                    on_progress(ParseProgress {
                        files_parsed: count,
                        total_files,
                        current_file: file.relative_path,
                    });

                    Some((file.file_id, res))
                })
                .collect()
        });

        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_worker_pool_concurrency_and_cancellation() {
        let temp = tempdir().unwrap();
        let file1 = temp.path().join("a.ts");
        let file2 = temp.path().join("b.py");

        fs::write(&file1, "export function foo(): number { return 1; }").unwrap();
        fs::write(&file2, "def bar(): return 2").unwrap();

        let files = vec![
            FileToParse {
                file_id: 1,
                relative_path: "a.ts".to_string(),
                extension: Some("ts".to_string()),
            },
            FileToParse {
                file_id: 2,
                relative_path: "b.py".to_string(),
                extension: Some("py".to_string()),
            },
        ];

        let config = WorkerPoolConfig {
            concurrency: 2, // Explicit concurrency setting tested
            limits: ParserLimits::default(),
        };

        let pool = ParserWorkerPool::new(config);
        let cancel = Arc::new(AtomicBool::new(false));

        let progress_events = Arc::new(std::sync::Mutex::new(Vec::new()));
        let events_clone = progress_events.clone();

        let results = pool
            .parse_project_files(temp.path(), files, cancel, move |p| {
                events_clone.lock().unwrap().push(p);
            })
            .unwrap();

        assert_eq!(results.len(), 2);
        assert_eq!(progress_events.lock().unwrap().len(), 2);

        // Verify cancellation
        let cancel_active = Arc::new(AtomicBool::new(true)); // Already cancelled
        let files2 = vec![FileToParse {
            file_id: 3,
            relative_path: "a.ts".to_string(),
            extension: Some("ts".to_string()),
        }];

        let results_cancelled = pool
            .parse_project_files(temp.path(), files2, cancel_active, |_| {})
            .unwrap();

        assert_eq!(results_cancelled.len(), 0);
    }
}
