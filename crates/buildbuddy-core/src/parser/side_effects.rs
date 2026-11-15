use crate::symbols::model::SideEffectMarker;

/// Explicit pattern lists for static side-effect marker detection.
/// All matches are assigned confidence "static", never "confirmed".
pub struct SideEffectDetector;

impl SideEffectDetector {
    pub fn check_call(callee: &str, line_number: usize) -> Option<SideEffectMarker> {
        let callee_trimmed = callee.trim();

        // 1. Check Network patterns
        const NETWORK_PATTERNS: &[&str] = &[
            "fetch",
            "axios",
            "http.get",
            "http.request",
            "https.get",
            "https.request",
            "WebSocket",
            "requests.get",
            "requests.post",
            "requests.put",
            "requests.delete",
            "requests.request",
            "urllib.request",
            "aiohttp",
            "httpx.get",
            "httpx.post",
            "socket.connect",
            "socket.send",
        ];

        for &pat in NETWORK_PATTERNS {
            if Self::matches_pattern(callee_trimmed, pat) {
                return Some(SideEffectMarker {
                    category: "network".to_string(),
                    pattern: pat.to_string(),
                    confidence: "static".to_string(),
                    line_number,
                });
            }
        }

        // 2. Check File System (fs) patterns
        const FS_PATTERNS: &[&str] = &[
            "fs.readFile",
            "fs.readFileSync",
            "fs.writeFile",
            "fs.writeFileSync",
            "fs.open",
            "fs.unlink",
            "fs.mkdir",
            "fs.rmdir",
            "fs.createReadStream",
            "fs.createWriteStream",
            "fs.promises",
            "promises.readFile",
            "promises.writeFile",
            "readFile",
            "readFileSync",
            "writeFile",
            "writeFileSync",
            "open",
            "os.remove",
            "os.unlink",
            "os.mkdir",
            "os.rmdir",
            "os.path",
            "pathlib.Path",
            "shutil.copy",
            "shutil.rmtree",
        ];

        for &pat in FS_PATTERNS {
            if Self::matches_pattern(callee_trimmed, pat) {
                return Some(SideEffectMarker {
                    category: "fs".to_string(),
                    pattern: pat.to_string(),
                    confidence: "static".to_string(),
                    line_number,
                });
            }
        }

        // 3. Check Database (db) patterns
        const DB_PATTERNS: &[&str] = &[
            "query",
            "execute",
            "connect",
            "cursor",
            "session.query",
            "session.add",
            "session.commit",
            "session.rollback",
            "prisma",
            "prisma.findUnique",
            "prisma.findMany",
            "prisma.create",
            "prisma.update",
            "prisma.delete",
            "repository.find",
            "findOne",
            "createConnection",
            "select",
            "insert",
            "update",
            "delete",
            "commit",
            "rollback",
            "db.query",
            "db.collection",
        ];

        for &pat in DB_PATTERNS {
            if Self::matches_pattern(callee_trimmed, pat) {
                return Some(SideEffectMarker {
                    category: "db".to_string(),
                    pattern: pat.to_string(),
                    confidence: "static".to_string(),
                    line_number,
                });
            }
        }

        None
    }

    fn matches_pattern(callee: &str, pat: &str) -> bool {
        if callee == pat {
            return true;
        }

        if let Some(suffix) = callee.strip_prefix(pat) {
            if suffix.starts_with('.') || suffix.starts_with('(') {
                return true;
            }
        }

        if let Some(prefix) = callee.strip_suffix(pat) {
            if prefix.ends_with('.') {
                return true;
            }
        }

        if pat.contains('.') && callee.ends_with(pat) {
            return true;
        }

        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_side_effect_detection() {
        let m1 = SideEffectDetector::check_call("fetch", 10).unwrap();
        assert_eq!(m1.category, "network");
        assert_eq!(m1.confidence, "static");

        let m2 = SideEffectDetector::check_call("fs.readFileSync", 20).unwrap();
        assert_eq!(m2.category, "fs");
        assert_eq!(m2.confidence, "static");

        let m3 = SideEffectDetector::check_call("db.query", 30).unwrap();
        assert_eq!(m3.category, "db");
        assert_eq!(m3.confidence, "static");

        let m4 = SideEffectDetector::check_call("myHelperFunction", 40);
        assert!(m4.is_none());
    }
}

