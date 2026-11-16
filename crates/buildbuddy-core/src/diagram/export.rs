use std::fs;
use std::path::{Path, PathBuf};

/// Validates that an export file path does not reside within the analyzed project directory.
///
/// Security guarantee:
/// - Strictly prohibits writing or modifying any file inside the analyzed project root.
/// - Resolves parent symlinks and canonicalizes paths to prevent `..` directory traversal bypasses.
pub fn validate_export_path(target_path: &Path, project_root: &Path) -> Result<PathBuf, String> {
    if target_path.as_os_str().is_empty() {
        return Err("Export path cannot be empty".to_string());
    }

    // Canonicalize project root if it exists, otherwise normalize
    let canonical_root = project_root
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize project root {:?}: {}", project_root, e))?;

    // Determine the target's parent directory and file name
    let file_name = target_path
        .file_name()
        .ok_or_else(|| "Export path must include a valid file name".to_string())?;

    let parent_dir = target_path.parent().unwrap_or_else(|| Path::new("."));

    // Canonicalize parent directory to resolve relative paths, '..', and symlinks
    let canonical_parent = parent_dir
        .canonicalize()
        .map_err(|e| format!("Export parent directory {:?} does not exist or is invalid: {}", parent_dir, e))?;

    let canonical_target = canonical_parent.join(file_name);

    // Check if canonical target starts with canonical project root
    if canonical_target.starts_with(&canonical_root) {
        return Err(format!(
            "Security violation: export path {:?} is inside the analyzed project directory {:?}",
            canonical_target, canonical_root
        ));
    }

    Ok(canonical_target)
}

/// Safely writes export content to disk after validating path security.
pub fn save_export_file(target_path: &Path, project_root: &Path, content: &[u8]) -> Result<PathBuf, String> {
    let safe_path = validate_export_path(target_path, project_root)?;
    fs::write(&safe_path, content)
        .map_err(|e| format!("Failed to write export file to {:?}: {}", safe_path, e))?;
    Ok(safe_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_rejects_export_directly_in_project_root() {
        let root = tempdir().unwrap();
        let target = root.path().join("export.svg");

        let res = validate_export_path(&target, root.path());
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Security violation"));
    }

    #[test]
    fn test_rejects_export_in_subdirectory_of_project_root() {
        let root = tempdir().unwrap();
        let sub = root.path().join("src").join("diagrams");
        fs::create_dir_all(&sub).unwrap();
        let target = sub.join("architecture.mmd");

        let res = validate_export_path(&target, root.path());
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Security violation"));
    }

    #[test]
    fn test_rejects_traversal_into_project_root() {
        let temp = tempdir().unwrap();
        let project_dir = temp.path().join("project");
        let other_dir = temp.path().join("other");
        fs::create_dir_all(&project_dir).unwrap();
        fs::create_dir_all(&other_dir).unwrap();

        // Traversal starting from other_dir navigating into project_dir
        let target = other_dir.join("..").join("project").join("traversal.png");

        let res = validate_export_path(&target, &project_dir);
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("Security violation"));
    }

    #[test]
    fn test_allows_valid_export_outside_project_root() {
        let temp = tempdir().unwrap();
        let project_dir = temp.path().join("project");
        let exports_dir = temp.path().join("exports");
        fs::create_dir_all(&project_dir).unwrap();
        fs::create_dir_all(&exports_dir).unwrap();

        let target = exports_dir.join("diagram.svg");
        let res = validate_export_path(&target, &project_dir);
        assert!(res.is_ok());
        let validated = res.unwrap();
        assert_eq!(validated.file_name().unwrap(), "diagram.svg");
        assert!(!validated.starts_with(&project_dir.canonicalize().unwrap()));
    }

    #[test]
    fn test_save_export_file_writes_safely() {
        let temp = tempdir().unwrap();
        let project_dir = temp.path().join("project");
        let exports_dir = temp.path().join("exports");
        fs::create_dir_all(&project_dir).unwrap();
        fs::create_dir_all(&exports_dir).unwrap();

        let target = exports_dir.join("diagram.mmd");
        let content = b"graph TD\n  A --> B";

        let res = save_export_file(&target, &project_dir, content);
        assert!(res.is_ok());
        assert!(target.exists());
        assert_eq!(fs::read(&target).unwrap(), content);
    }
}
