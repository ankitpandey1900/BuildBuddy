use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitRepoStatus {
    pub is_git_repo: bool,
    pub current_branch: Option<String>,
    pub commit_hash: Option<String>,
}

pub fn detect_git_status(project_root: &Path) -> GitRepoStatus {
    let git_path = project_root.join(".git");
    if !git_path.exists() {
        return GitRepoStatus {
            is_git_repo: false,
            current_branch: None,
            commit_hash: None,
        };
    }

    let actual_git_dir = if git_path.is_file() {
        // Submodule or worktree: "gitdir: <path>"
        if let Ok(content) = fs::read_to_string(&git_path) {
            let trimmed = content.trim();
            if let Some(target) = trimmed.strip_prefix("gitdir:") {
                let target_path = target.trim();
                let candidate = project_root.join(target_path);
                if candidate.exists() {
                    candidate
                } else {
                    PathBuf::from(target_path)
                }
            } else {
                git_path
            }
        } else {
            git_path
        }
    } else {
        git_path
    };

    let head_path = actual_git_dir.join("HEAD");
    if !head_path.exists() {
        return GitRepoStatus {
            is_git_repo: true,
            current_branch: None,
            commit_hash: None,
        };
    }

    let head_content = match fs::read_to_string(&head_path) {
        Ok(c) => c.trim().to_string(),
        Err(_) => {
            return GitRepoStatus {
                is_git_repo: true,
                current_branch: None,
                commit_hash: None,
            };
        }
    };

    if let Some(ref_path) = head_content.strip_prefix("ref:") {
        let relative_ref = ref_path.trim();
        let branch_name = relative_ref
            .strip_prefix("refs/heads/")
            .unwrap_or(relative_ref)
            .to_string();

        let branch_ref_path = actual_git_dir.join(relative_ref);
        let commit_hash = if branch_ref_path.exists() {
            fs::read_to_string(&branch_ref_path)
                .ok()
                .map(|s| s.trim().to_string())
        } else {
            // Check packed-refs if branch ref file not yet unpacked
            find_in_packed_refs(&actual_git_dir, relative_ref)
        };

        GitRepoStatus {
            is_git_repo: true,
            current_branch: Some(branch_name),
            commit_hash,
        }
    } else if head_content.len() >= 40
        && head_content.chars().all(|c| c.is_ascii_hexdigit())
    {
        // Detached HEAD
        GitRepoStatus {
            is_git_repo: true,
            current_branch: None,
            commit_hash: Some(head_content),
        }
    } else {
        GitRepoStatus {
            is_git_repo: true,
            current_branch: None,
            commit_hash: None,
        }
    }
}

fn find_in_packed_refs(git_dir: &Path, ref_target: &str) -> Option<String> {
    let packed_refs_path = git_dir.join("packed-refs");
    if !packed_refs_path.exists() {
        return None;
    }

    let content = fs::read_to_string(packed_refs_path).ok()?;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('#') || trimmed.starts_with('^') || trimmed.is_empty() {
            continue;
        }

        if let Some((hash, ref_name)) = trimmed.split_once(' ') {
            if ref_name.trim() == ref_target {
                return Some(hash.trim().to_string());
            }
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_detect_non_git_repo() {
        let temp = tempdir().unwrap();
        let status = detect_git_status(temp.path());
        assert!(!status.is_git_repo);
        assert_eq!(status.current_branch, None);
        assert_eq!(status.commit_hash, None);
    }

    #[test]
    fn test_detect_git_repo_branch() {
        let temp = tempdir().unwrap();
        let git_dir = temp.path().join(".git");
        let refs_dir = git_dir.join("refs").join("heads");
        fs::create_dir_all(&refs_dir).unwrap();

        fs::write(git_dir.join("HEAD"), "ref: refs/heads/main\n").unwrap();
        fs::write(
            refs_dir.join("main"),
            "1ccf03a6ae5198db3c44d0000000000000000000\n",
        )
        .unwrap();

        let status = detect_git_status(temp.path());
        assert!(status.is_git_repo);
        assert_eq!(status.current_branch.as_deref(), Some("main"));
        assert_eq!(
            status.commit_hash.as_deref(),
            Some("1ccf03a6ae5198db3c44d0000000000000000000")
        );
    }

    #[test]
    fn test_detect_detached_head() {
        let temp = tempdir().unwrap();
        let git_dir = temp.path().join(".git");
        fs::create_dir_all(&git_dir).unwrap();

        fs::write(
            git_dir.join("HEAD"),
            "49228807cb0697e58f02e9f62385c2aa72c45a0b\n",
        )
        .unwrap();

        let status = detect_git_status(temp.path());
        assert!(status.is_git_repo);
        assert_eq!(status.current_branch, None);
        assert_eq!(
            status.commit_hash.as_deref(),
            Some("49228807cb0697e58f02e9f62385c2aa72c45a0b")
        );
    }
}
