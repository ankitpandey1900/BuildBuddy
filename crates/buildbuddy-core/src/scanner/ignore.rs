use ignore::gitignore::{Gitignore, GitignoreBuilder};
use std::path::Path;

pub struct IgnoreFilter {
    matcher: Gitignore,
}

impl IgnoreFilter {
    pub fn new(project_root: &Path, custom_patterns: &[String]) -> Self {
        let mut builder = GitignoreBuilder::new(project_root);

        // Always ignored folders & files
        let default_ignores = [
            ".git",
            "node_modules",
            "target",
            "dist",
            "build",
            ".next",
            ".nuxt",
            "__pycache__",
            ".venv",
            "venv",
            "env",
            ".env",
            ".DS_Store",
            "Thumbs.db",
            "*.pyc",
            "*.pyo",
            "*.pyd",
            "*.lock",
            "package-lock.json",
            "pnpm-lock.yaml",
            "yarn.lock",
        ];

        for pattern in default_ignores {
            builder.add_line(None, pattern).ok();
        }

        // Add project's .gitignore if present
        let gitignore_path = project_root.join(".gitignore");
        if gitignore_path.exists() {
            builder.add(&gitignore_path);
        }

        // Add project's .buildbuddyignore if present
        let bb_ignore_path = project_root.join(".buildbuddyignore");
        if bb_ignore_path.exists() {
            builder.add(&bb_ignore_path);
        }

        // Add any user-supplied custom patterns
        for pat in custom_patterns {
            builder.add_line(None, pat).ok();
        }

        let matcher = builder.build().unwrap_or_else(|_| Gitignore::empty());
        Self { matcher }
    }

    pub fn is_ignored(&self, path: &Path, is_dir: bool) -> bool {
        match self.matcher.matched(path, is_dir) {
            ignore::Match::Ignore(_) => true,
            ignore::Match::Whitelist(_) => false,
            ignore::Match::None => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_default_ignores() {
        let dir = tempdir().unwrap();
        let filter = IgnoreFilter::new(dir.path(), &[]);

        assert!(filter.is_ignored(dir.path().join("node_modules").as_path(), true));
        assert!(filter.is_ignored(dir.path().join(".git").as_path(), true));
        assert!(filter.is_ignored(dir.path().join("target").as_path(), true));
        assert!(filter.is_ignored(dir.path().join(".venv").as_path(), true));
        assert!(filter.is_ignored(dir.path().join("file.pyc").as_path(), false));

        // Normal files should not be ignored
        assert!(!filter.is_ignored(dir.path().join("src/main.rs").as_path(), false));
        assert!(!filter.is_ignored(dir.path().join("package.json").as_path(), false));
    }

    #[test]
    fn test_custom_ignores() {
        let dir = tempdir().unwrap();
        let custom = vec!["*.generated.ts".to_string(), "temp_folder/".to_string()];
        let filter = IgnoreFilter::new(dir.path(), &custom);

        assert!(filter.is_ignored(dir.path().join("foo.generated.ts").as_path(), false));
        assert!(filter.is_ignored(dir.path().join("temp_folder").as_path(), true));
        assert!(!filter.is_ignored(dir.path().join("foo.normal.ts").as_path(), false));
    }

    #[test]
    fn test_gitignore_file_respected() {
        let dir = tempdir().unwrap();
        let gitignore = dir.path().join(".gitignore");
        std::fs::write(&gitignore, "custom_ignored_dir/\n*.secret").unwrap();

        let filter = IgnoreFilter::new(dir.path(), &[]);
        assert!(filter.is_ignored(dir.path().join("custom_ignored_dir").as_path(), true));
        assert!(filter.is_ignored(dir.path().join("key.secret").as_path(), false));
        assert!(!filter.is_ignored(dir.path().join("key.public").as_path(), false));
    }
}

