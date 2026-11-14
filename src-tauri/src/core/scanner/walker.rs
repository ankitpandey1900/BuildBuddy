use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use walkdir::WalkDir;

use crate::core::scanner::classifier::classify_file;
use crate::core::scanner::hasher::hash_file;
use crate::core::scanner::ignore::IgnoreFilter;
use crate::core::store::files::ScannedFileInsert;

#[derive(Debug, Clone)]
pub struct ScanProgress {
    pub files_scanned: usize,
    pub current_file: String,
}

pub fn scan_directory<F>(
    root_path: &Path,
    custom_ignores: &[String],
    cancel_flag: Arc<AtomicBool>,
    mut progress_cb: F,
) -> std::io::Result<Vec<ScannedFileInsert>>
where
    F: FnMut(ScanProgress),
{
    let canonical_root = root_path.canonicalize().unwrap_or_else(|_| root_path.to_path_buf());
    let filter = IgnoreFilter::new(root_path, custom_ignores);
    let mut scanned_files = Vec::new();

    let walker = WalkDir::new(root_path)
        .follow_links(false) // First step: don't automatically follow symlinks blindly
        .into_iter();

    for entry_res in walker {
        if cancel_flag.load(Ordering::Relaxed) {
            break;
        }

        let entry = match entry_res {
            Ok(e) => e,
            Err(_) => continue,
        };

        let path = entry.path();

        // Check symlinks
        if entry.file_type().is_symlink() {
            if let Ok(target) = path.canonicalize() {
                // If symlink points outside canonical project root, skip it
                if !target.starts_with(&canonical_root) {
                    continue;
                }
            } else {
                continue;
            }
        }

        let is_dir = entry.file_type().is_dir();

        // Check ignore rules
        if filter.is_ignored(path, is_dir) {
            continue;
        }

        // Only record files
        if is_dir {
            continue;
        }

        let relative_path = match path.strip_prefix(root_path) {
            Ok(rel) => rel.to_string_lossy().replace('\\', "/"),
            Err(_) => continue,
        };

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let size_bytes = metadata.len() as i64;
        let file_name = path
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_default();

        let extension = path
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase());

        // Fast line count for text files under 10MB
        let line_count = if size_bytes < 10 * 1024 * 1024 && classify_file(path).is_some() {
            count_lines(path).unwrap_or(0)
        } else {
            0
        };

        // Compute hash
        let content_hash = hash_file(path).unwrap_or_default();

        let status = if classify_file(path).is_some() {
            "parsed".to_string()
        } else {
            "unsupported".to_string()
        };

        scanned_files.push(ScannedFileInsert {
            relative_path: relative_path.clone(),
            file_name,
            extension,
            size_bytes,
            line_count,
            content_hash,
            status,
        });

        if scanned_files.len() % 50 == 0 {
            progress_cb(ScanProgress {
                files_scanned: scanned_files.len(),
                current_file: relative_path,
            });
        }
    }

    Ok(scanned_files)
}

fn count_lines(path: &Path) -> std::io::Result<i64> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut count = 0;
    for line in reader.lines() {
        if line.is_ok() {
            count += 1;
        }
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_walker_basic() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("src");
        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("main.rs"), "fn main() {\n    println!(\"hello\");\n}\n").unwrap();
        fs::write(dir.path().join("README.md"), "# Test\n").unwrap();

        let cancel = Arc::new(AtomicBool::new(false));
        let results = scan_directory(dir.path(), &[], cancel, |_| {}).unwrap();

        assert_eq!(results.len(), 2);
        let main_file = results.iter().find(|f| f.file_name == "main.rs").unwrap();
        assert_eq!(main_file.line_count, 3);
        assert_eq!(main_file.extension, Some("rs".to_string()));
    }

    #[test]
    fn test_walker_cancellation() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("f1.txt"), "hello").unwrap();
        fs::write(dir.path().join("f2.txt"), "world").unwrap();

        let cancel = Arc::new(AtomicBool::new(true)); // cancel immediately
        let results = scan_directory(dir.path(), &[], cancel, |_| {}).unwrap();
        assert_eq!(results.len(), 0);
    }
}

