use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::model::ResolutionStatus;

pub struct PyResolver {
    known_files: HashMap<String, i64>,
}

impl PyResolver {
    pub fn new(known_files: HashMap<String, i64>) -> Self {
        Self { known_files }
    }

    pub fn resolve(
        &self,
        source_file_path: &str,
        import_module: &str,
    ) -> (ResolutionStatus, Option<i64>, Option<String>) {
        let trimmed = import_module.trim();
        if trimmed.is_empty() {
            return (ResolutionStatus::Unresolved, None, None);
        }

        let leading_dots = trimmed.chars().take_while(|&c| c == '.').count();

        if leading_dots > 0 {
            // Relative import
            let remainder = &trimmed[leading_dots..];
            let source_dir = Path::new(source_file_path)
                .parent()
                .unwrap_or_else(|| Path::new(""));

            let mut target_dir = source_dir.to_path_buf();
            // In Python:
            // 1 dot = current package (source_dir)
            // 2 dots = parent directory
            // 3 dots = grandparent directory, etc.
            for _ in 1..leading_dots {
                if !target_dir.pop() {
                    return (ResolutionStatus::Unresolved, None, None);
                }
            }

            let candidate_relative_path = if remainder.is_empty() {
                target_dir
            } else {
                let sub_parts: Vec<&str> = remainder.split('.').collect();
                let mut p = target_dir;
                for part in sub_parts {
                    p.push(part);
                }
                p
            };

            let normalized = normalize_path(&candidate_relative_path);
            if let Some((file_id, file_path)) = self.probe_py_file_or_pkg(&normalized) {
                return (ResolutionStatus::Internal, Some(file_id), Some(file_path));
            }

            return (ResolutionStatus::Unresolved, None, None);
        }

        // Absolute import: check if module matches files in project root
        let parts: Vec<&str> = trimmed.split('.').collect();
        let mut candidate_path = PathBuf::new();
        for part in &parts {
            candidate_path.push(part);
        }
        let normalized = normalize_path(&candidate_path);

        if let Some((file_id, file_path)) = self.probe_py_file_or_pkg(&normalized) {
            return (ResolutionStatus::Internal, Some(file_id), Some(file_path));
        }

        // Check if root of project has `src/` prefix and package lives under `src/`
        let src_candidate = format!("src/{}", normalized);
        if let Some((file_id, file_path)) = self.probe_py_file_or_pkg(&src_candidate) {
            return (ResolutionStatus::Internal, Some(file_id), Some(file_path));
        }

        // Not found in project -> External (Standard library or third-party)
        (ResolutionStatus::External, None, None)
    }

    fn probe_py_file_or_pkg(&self, path_str: &str) -> Option<(i64, String)> {
        // Direct .py file
        let direct_py = if path_str.ends_with(".py") {
            path_str.to_string()
        } else {
            format!("{}.py", path_str)
        };
        if let Some(&id) = self.known_files.get(&direct_py) {
            return Some((id, direct_py));
        }

        // Package with __init__.py
        let pkg_init = format!("{}/__init__.py", path_str.trim_end_matches('/'));
        if let Some(&id) = self.known_files.get(&pkg_init) {
            return Some((id, pkg_init));
        }

        None
    }
}

fn normalize_path(path: &Path) -> String {
    let mut components = Vec::new();
    for c in path.components() {
        match c {
            std::path::Component::Normal(os_str) => {
                components.push(os_str.to_string_lossy().to_string());
            }
            std::path::Component::ParentDir => {
                components.pop();
            }
            std::path::Component::CurDir => {}
            _ => {}
        }
    }
    components.join("/")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_py_relative_resolution() {
        let mut known = HashMap::new();
        known.insert("pkg/utils.py".to_string(), 1);
        known.insert("core/base.py".to_string(), 2);
        known.insert("pkg/sub/__init__.py".to_string(), 3);

        let resolver = PyResolver::new(known);

        // Sibling dot import: from .utils import ... in pkg/main.py
        let (status, id, path) = resolver.resolve("pkg/main.py", ".utils");
        assert_eq!(status, ResolutionStatus::Internal);
        assert_eq!(id, Some(1));
        assert_eq!(path.as_deref(), Some("pkg/utils.py"));

        // Parent double-dot import: from ..core.base import ... in pkg/worker.py
        let (status, id, path) = resolver.resolve("pkg/worker.py", "..core.base");
        assert_eq!(status, ResolutionStatus::Internal);
        assert_eq!(id, Some(2));
        assert_eq!(path.as_deref(), Some("core/base.py"));

        // Grandparent triple-dot import: from ...core.base import ... in pkg/sub/worker.py
        let (status, id, path) = resolver.resolve("pkg/sub/worker.py", "...core.base");
        assert_eq!(status, ResolutionStatus::Internal);
        assert_eq!(id, Some(2));
        assert_eq!(path.as_deref(), Some("core/base.py"));

        // Package __init__.py import
        let (status, id, path) = resolver.resolve("pkg/main.py", ".sub");
        assert_eq!(status, ResolutionStatus::Internal);
        assert_eq!(id, Some(3));
        assert_eq!(path.as_deref(), Some("pkg/sub/__init__.py"));

        // External module
        let (status, id, path) = resolver.resolve("pkg/main.py", "os");
        assert_eq!(status, ResolutionStatus::External);
        assert_eq!(id, None);
        assert_eq!(path, None);

        // Broken relative import
        let (status, id, _) = resolver.resolve("pkg/main.py", ".nonexistent");
        assert_eq!(status, ResolutionStatus::Unresolved);
        assert_eq!(id, None);
    }
}
