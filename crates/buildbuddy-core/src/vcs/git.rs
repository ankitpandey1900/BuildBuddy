use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GitRepoStatus {
    pub is_git_repo: bool,
    pub current_branch: Option<String>,
    pub commit_hash: Option<String>,
    pub changed_files: Vec<String>,
}

pub fn detect_git_status(project_root: &Path) -> GitRepoStatus {
    let git_path = project_root.join(".git");
    if !git_path.exists() {
        return GitRepoStatus {
            is_git_repo: false,
            current_branch: None,
            commit_hash: None,
            changed_files: Vec::new(),
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

    let changed_files = detect_changed_files(project_root, &actual_git_dir);

    let head_path = actual_git_dir.join("HEAD");
    if !head_path.exists() {
        return GitRepoStatus {
            is_git_repo: true,
            current_branch: None,
            commit_hash: None,
            changed_files,
        };
    }

    let head_content = match fs::read_to_string(&head_path) {
        Ok(c) => c.trim().to_string(),
        Err(_) => {
            return GitRepoStatus {
                is_git_repo: true,
                current_branch: None,
                commit_hash: None,
                changed_files,
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
            changed_files,
        }
    } else if head_content.len() >= 40
        && head_content.chars().all(|c| c.is_ascii_hexdigit())
    {
        // Detached HEAD
        GitRepoStatus {
            is_git_repo: true,
            current_branch: None,
            commit_hash: Some(head_content),
            changed_files,
        }
    } else {
        GitRepoStatus {
            is_git_repo: true,
            current_branch: None,
            commit_hash: None,
            changed_files,
        }
    }
}

pub fn find_in_packed_refs(git_dir: &Path, ref_target: &str) -> Option<String> {
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitIndexEntry {
    pub path: String,
    pub size: u32,
    pub mtime_sec: u32,
    pub sha1: [u8; 20],
}

pub fn parse_git_index(data: &[u8]) -> Vec<GitIndexEntry> {
    if data.len() < 12 || &data[0..4] != b"DIRC" {
        return Vec::new();
    }

    let version = u32::from_be_bytes([data[4], data[5], data[6], data[7]]);
    if version < 2 || version > 3 {
        return Vec::new();
    }

    let entry_count = u32::from_be_bytes([data[8], data[9], data[10], data[11]]) as usize;
    let mut entries = Vec::with_capacity(entry_count);
    let mut offset = 12;

    for _ in 0..entry_count {
        if offset + 62 > data.len() {
            break;
        }

        let entry_start = offset;
        let mtime_sec = u32::from_be_bytes([
            data[offset + 8],
            data[offset + 9],
            data[offset + 10],
            data[offset + 11],
        ]);
        let file_size = u32::from_be_bytes([
            data[offset + 36],
            data[offset + 37],
            data[offset + 38],
            data[offset + 39],
        ]);

        let mut sha1 = [0u8; 20];
        sha1.copy_from_slice(&data[offset + 40..offset + 60]);

        offset += 62;

        let path_start = offset;
        while offset < data.len() && data[offset] != 0 {
            offset += 1;
        }

        let path_str = String::from_utf8_lossy(&data[path_start..offset]).to_string();

        // 1 to 8 null bytes padding to align to multiple of 8 bytes from entry_start
        offset += 1; // skip terminating null
        while (offset - entry_start) % 8 != 0 && offset < data.len() {
            offset += 1;
        }

        entries.push(GitIndexEntry {
            path: path_str,
            size: file_size,
            mtime_sec,
            sha1,
        });
    }

    entries
}

pub fn detect_changed_files(project_root: &Path, git_dir: &Path) -> Vec<String> {
    let index_path = git_dir.join("index");
    if !index_path.exists() {
        return Vec::new();
    }

    let data = match fs::read(&index_path) {
        Ok(d) => d,
        Err(_) => return Vec::new(),
    };

    let entries = parse_git_index(&data);
    let mut changed = Vec::new();

    for entry in entries {
        let file_path = project_root.join(&entry.path);
        if !file_path.exists() {
            changed.push(entry.path);
            continue;
        }

        let meta = match fs::metadata(&file_path) {
            Ok(m) => m,
            Err(_) => {
                changed.push(entry.path);
                continue;
            }
        };

        if meta.len() != entry.size as u64 {
            changed.push(entry.path);
            continue;
        }

        if let Ok(content) = fs::read(&file_path) {
            let actual_sha1 = compute_git_blob_sha1(&content);
            if actual_sha1 != entry.sha1 {
                changed.push(entry.path);
            }
        }
    }

    changed.sort();
    changed
}

pub fn compute_git_blob_sha1(data: &[u8]) -> [u8; 20] {
    let header = format!("blob {}\0", data.len());
    let mut full = Vec::with_capacity(header.len() + data.len());
    full.extend_from_slice(header.as_bytes());
    full.extend_from_slice(data);
    sha1_digest(&full)
}

fn sha1_digest(data: &[u8]) -> [u8; 20] {
    let mut h0: u32 = 0x67452301;
    let mut h1: u32 = 0xEFCDAB89;
    let mut h2: u32 = 0x98BADCFE;
    let mut h3: u32 = 0x10325476;
    let mut h4: u32 = 0xC3D2E1F0;

    let bit_len = (data.len() as u64) * 8;
    let mut msg = data.to_vec();
    msg.push(0x80);
    while (msg.len() % 64) != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in msg.chunks_exact(64) {
        let mut w = [0u32; 80];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }

        let mut a = h0;
        let mut b = h1;
        let mut c = h2;
        let mut d = h3;
        let mut e = h4;

        for i in 0..80 {
            let (f, k) = match i {
                0..=19 => ((b & c) | ((!b) & d), 0x5A827999),
                20..=39 => (b ^ c ^ d, 0x6ED9EBA1),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDC),
                _ => (b ^ c ^ d, 0xCA62C1D6),
            };

            let temp = a
                .rotate_left(5)
                .wrapping_add(f)
                .wrapping_add(e)
                .wrapping_add(k)
                .wrapping_add(w[i]);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = temp;
        }

        h0 = h0.wrapping_add(a);
        h1 = h1.wrapping_add(b);
        h2 = h2.wrapping_add(c);
        h3 = h3.wrapping_add(d);
        h4 = h4.wrapping_add(e);
    }

    let mut out = [0u8; 20];
    out[0..4].copy_from_slice(&h0.to_be_bytes());
    out[4..8].copy_from_slice(&h1.to_be_bytes());
    out[8..12].copy_from_slice(&h2.to_be_bytes());
    out[12..16].copy_from_slice(&h3.to_be_bytes());
    out[16..20].copy_from_slice(&h4.to_be_bytes());
    out
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
        assert!(status.changed_files.is_empty());
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

    #[test]
    fn test_detect_packed_refs() {
        let temp = tempdir().unwrap();
        let git_dir = temp.path().join(".git");
        fs::create_dir_all(&git_dir).unwrap();

        fs::write(git_dir.join("HEAD"), "ref: refs/heads/release\n").unwrap();
        let packed_refs_content = "# pack-refs with: peeled fully-peeled sorted\na5e3221000000000000000000000000000000000 refs/heads/release\n";
        fs::write(git_dir.join("packed-refs"), packed_refs_content).unwrap();

        let status = detect_git_status(temp.path());
        assert!(status.is_git_repo);
        assert_eq!(status.current_branch.as_deref(), Some("release"));
        assert_eq!(
            status.commit_hash.as_deref(),
            Some("a5e3221000000000000000000000000000000000")
        );
    }

    #[test]
    fn test_detect_changed_files_modified_and_deleted() {
        let temp = tempdir().unwrap();
        let git_dir = temp.path().join(".git");
        fs::create_dir_all(&git_dir).unwrap();

        // Create file1 and file2 in project
        let file1_path = temp.path().join("src").join("file1.ts");
        fs::create_dir_all(file1_path.parent().unwrap()).unwrap();
        fs::write(&file1_path, "original file1 content").unwrap();

        let file2_path = temp.path().join("src").join("file2.ts");
        fs::write(&file2_path, "original file2 content").unwrap();

        // Construct a synthetic git index entry for file1 and file2
        let sha1_f1 = compute_git_blob_sha1(b"original file1 content");
        let sha1_f2 = compute_git_blob_sha1(b"original file2 content");

        let mut index_bytes = Vec::new();
        index_bytes.extend_from_slice(b"DIRC");
        index_bytes.extend_from_slice(&2u32.to_be_bytes()); // version 2
        index_bytes.extend_from_slice(&2u32.to_be_bytes()); // 2 entries

        let append_entry = |buf: &mut Vec<u8>, path: &str, size: u32, sha: [u8; 20]| {
            let start = buf.len();
            buf.extend_from_slice(&[0u8; 8]); // ctime
            buf.extend_from_slice(&[0u8; 8]); // mtime
            buf.extend_from_slice(&[0u8; 4]); // dev
            buf.extend_from_slice(&[0u8; 4]); // ino
            buf.extend_from_slice(&0o100644u32.to_be_bytes()); // mode
            buf.extend_from_slice(&[0u8; 4]); // uid
            buf.extend_from_slice(&[0u8; 4]); // gid
            buf.extend_from_slice(&size.to_be_bytes()); // size
            buf.extend_from_slice(&sha); // sha1
            let flags = path.len().min(0xFFF) as u16;
            buf.extend_from_slice(&flags.to_be_bytes());
            buf.extend_from_slice(path.as_bytes());
            buf.push(0); // null terminator
            while (buf.len() - start) % 8 != 0 {
                buf.push(0);
            }
        };

        append_entry(&mut index_bytes, "src/file1.ts", 22, sha1_f1);
        append_entry(&mut index_bytes, "src/file2.ts", 22, sha1_f2);
        fs::write(git_dir.join("index"), &index_bytes).unwrap();

        // Initial check: unchanged
        let status1 = detect_git_status(temp.path());
        assert!(status1.changed_files.is_empty());

        // Modify file1: change content
        fs::write(&file1_path, "modified content").unwrap();
        // Delete file2
        fs::remove_file(&file2_path).unwrap();

        let status2 = detect_git_status(temp.path());
        assert_eq!(status2.changed_files, vec!["src/file1.ts", "src/file2.ts"]);
    }
}
