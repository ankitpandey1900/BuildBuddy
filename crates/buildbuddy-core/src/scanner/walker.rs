use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use walkdir::WalkDir;

use crate::scanner::classifier::classify_file;
use crate::scanner::hasher::hash_file;
use crate::scanner::ignore::IgnoreFilter;
use crate::store::files::ScannedFileInsert;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkippedItem {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Clone)]
pub struct ScanProgress {
    pub files_scanned: usize,
    pub current_file: String,
}

pub fn scan_directory<F>(
    root_path: &Path,
    custom_ignores: &[String],
    cancel_flag: Arc<AtomicBool>,
    progress_cb: F,
) -> std::io::Result<Vec<ScannedFileInsert>>
where
    F: FnMut(ScanProgress),
{
    let (files, _) = scan_directory_detailed(root_path, custom_ignores, cancel_flag, progress_cb)?;
    Ok(files)
}

pub fn scan_directory_detailed<F>(
    root_path: &Path,
    custom_ignores: &[String],
    cancel_flag: Arc<AtomicBool>,
    mut progress_cb: F,
) -> std::io::Result<(Vec<ScannedFileInsert>, Vec<SkippedItem>)>
where
    F: FnMut(ScanProgress),
{
    let canonical_root = root_path.canonicalize().unwrap_or_else(|_| root_path.to_path_buf());
    let filter = IgnoreFilter::new(root_path, custom_ignores);
    let mut scanned_files = Vec::new();
    let mut skipped = Vec::new();

    let mut it = WalkDir::new(root_path)
        .follow_links(false) // First step: don't automatically follow symlinks blindly
        .into_iter();

    while let Some(entry_res) = it.next() {
        if cancel_flag.load(Ordering::Relaxed) {
            break;
        }

        let entry = match entry_res {
            Ok(e) => e,
            Err(_) => continue,
        };

        let path = entry.path();
        let is_dir = entry.file_type().is_dir();

        // Check symlinks: must not point outside project root
        if entry.file_type().is_symlink() {
            match path.canonicalize() {
                Ok(target) => {
                    if !target.starts_with(&canonical_root) {
                        skipped.push(SkippedItem {
                            path: path.to_string_lossy().replace('\\', "/"),
                            reason: "Symlink points outside canonical project root".to_string(),
                        });
                        continue;
                    }
                }
                Err(e) => {
                    skipped.push(SkippedItem {
                        path: path.to_string_lossy().replace('\\', "/"),
                        reason: format!("Broken or unresolvable symlink: {}", e),
                    });
                    continue;
                }
            }
        }

        // Check ignore rules
        if filter.is_ignored(path, is_dir) {
            if is_dir {
                it.skip_current_dir();
            }
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
            "pending".to_string()
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

    Ok((scanned_files, skipped))
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

    #[test]
    fn test_symlink_outside_project_not_followed() {
        let project_dir = tempdir().unwrap();
        let outside_dir = tempdir().unwrap();

        let secret_file = outside_dir.path().join("secret.txt");
        fs::write(&secret_file, "classified").unwrap();

        let symlink_path = project_dir.path().join("external_link.txt");

        #[cfg(windows)]
        let symlink_res = std::os::windows::fs::symlink_file(&secret_file, &symlink_path);
        #[cfg(unix)]
        let symlink_res = std::os::unix::fs::symlink(&secret_file, &symlink_path);

        match symlink_res {
            Ok(()) => {
                let cancel = Arc::new(AtomicBool::new(false));
                let (files, skipped) =
                    scan_directory_detailed(project_dir.path(), &[], cancel, |_| {}).unwrap();

                // Target outside must NOT be indexed as a project file
                assert!(files.is_empty(), "Outside file should not be indexed");
                assert_eq!(skipped.len(), 1);
                assert!(skipped[0].reason.contains("outside canonical project root"));
            }
            Err(e) => {
                println!(
                    "Skipping symlink test: privilege not held on this system ({}).",
                    e
                );
            }
        }
    }

    #[test]
    fn test_measure_tallymate_unsupported_count() {
        use std::collections::HashMap;
        let tallymate_path = Path::new(r"D:\Projects\Vibe Code\09_Tallymate");
        if !tallymate_path.exists() {
            return;
        }

        let cancel = Arc::new(AtomicBool::new(false));
        let scanned = scan_directory(tallymate_path, &[], cancel, |_| {}).unwrap();

        let mut unsupported_by_ext: HashMap<String, usize> = HashMap::new();
        let mut parseable_count = 0;
        let mut unsupported_count = 0;

        for file in &scanned {
            if file.status == "pending" {
                parseable_count += 1;
            } else if file.status == "unsupported" {
                unsupported_count += 1;
                let ext = file.extension.clone().unwrap_or_else(|| "(none)".to_string());
                *unsupported_by_ext.entry(ext).or_insert(0) += 1;
            }
        }

        let mut ext_list: Vec<(String, usize)> = unsupported_by_ext.into_iter().collect();
        ext_list.sort_by(|a, b| b.1.cmp(&a.1));

        println!("\n=== TALLYMATE SCAN METRICS AFTER FIX ===");
        println!("Total scanned files: {}", scanned.len());
        println!("Parseable (pending) files: {}", parseable_count);
        println!("Unsupported files: {}", unsupported_count);
        println!("Top 10 unsupported extensions:");
        for (i, (ext, count)) in ext_list.iter().take(10).enumerate() {
            println!("  {}. {}: {}", i + 1, ext, count);
        }
        println!("========================================\n");
    }
}

