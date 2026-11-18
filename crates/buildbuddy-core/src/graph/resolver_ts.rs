use std::collections::HashMap;
use std::path::{Path, PathBuf};
use serde_json::Value;

use super::model::ResolutionStatus;

#[derive(Debug, Clone, Default)]
pub struct TsConfigOptions {
    pub base_url: Option<String>,
    pub paths: HashMap<String, Vec<String>>,
}

impl TsConfigOptions {
    pub fn parse(content: &str) -> Self {
        let stripped = strip_json_comments(content);
        let Ok(parsed): Result<Value, _> = serde_json::from_str(&stripped) else {
            return Self::default();
        };

        let compiler_opts = match parsed.get("compilerOptions") {
            Some(opts) if opts.is_object() => opts,
            _ => return Self::default(),
        };

        let base_url = compiler_opts
            .get("baseUrl")
            .and_then(|v| v.as_str())
            .map(|s| s.trim_start_matches("./").trim_end_matches('/').to_string());

        let mut paths_map = HashMap::new();
        if let Some(paths) = compiler_opts.get("paths").and_then(|v| v.as_object()) {
            for (alias_key, target_vals) in paths {
                if let Some(arr) = target_vals.as_array() {
                    let targets: Vec<String> = arr
                        .iter()
                        .filter_map(|t| t.as_str())
                        .map(|s| s.trim_start_matches("./").to_string())
                        .collect();
                    paths_map.insert(alias_key.clone(), targets);
                }
            }
        }

        Self {
            base_url,
            paths: paths_map,
        }
    }
}

pub struct TsResolver {
    known_files: HashMap<String, i64>,
    tsconfig: Option<TsConfigOptions>,
}

impl TsResolver {
    pub fn new(known_files: HashMap<String, i64>, tsconfig: Option<TsConfigOptions>) -> Self {
        Self {
            known_files,
            tsconfig,
        }
    }

    pub fn resolve(
        &self,
        source_file_path: &str,
        import_spec: &str,
    ) -> (ResolutionStatus, Option<i64>, Option<String>) {
        let is_relative = import_spec.starts_with("./")
            || import_spec.starts_with("../")
            || import_spec.starts_with('/');

        if is_relative {
            let source_dir = Path::new(source_file_path)
                .parent()
                .unwrap_or_else(|| Path::new(""));

            let combined = source_dir.join(import_spec.trim_start_matches('/'));
            let normalized = normalize_path(&combined);

            if let Some((file_id, file_path)) = self.probe_file_or_index(&normalized) {
                return (ResolutionStatus::Internal, Some(file_id), Some(file_path));
            }

            return (ResolutionStatus::Unresolved, None, None);
        }

        // Check path aliases from tsconfig if available
        if let Some(ref tsconfig) = self.tsconfig {
            for (pattern, targets) in &tsconfig.paths {
                if let Some(matched_suffix) = match_path_alias(pattern, import_spec) {
                    for target in targets {
                        let replaced_target = if target.contains('*') {
                            target.replace('*', &matched_suffix)
                        } else {
                            format!("{}/{}", target.trim_end_matches('/'), matched_suffix)
                        };

                        let candidate = if let Some(ref base) = tsconfig.base_url {
                            if base.is_empty() || base == "." {
                                PathBuf::from(&replaced_target)
                            } else {
                                Path::new(base).join(&replaced_target)
                            }
                        } else {
                            PathBuf::from(&replaced_target)
                        };

                        let normalized = normalize_path(&candidate);
                        if let Some((file_id, file_path)) = self.probe_file_or_index(&normalized) {
                            return (ResolutionStatus::Internal, Some(file_id), Some(file_path));
                        }
                    }
                }
            }

            // Check baseUrl direct relative imports
            if let Some(ref base) = tsconfig.base_url {
                let candidate = if base.is_empty() || base == "." {
                    PathBuf::from(import_spec)
                } else {
                    Path::new(base).join(import_spec)
                };
                let normalized = normalize_path(&candidate);
                if let Some((file_id, file_path)) = self.probe_file_or_index(&normalized) {
                    return (ResolutionStatus::Internal, Some(file_id), Some(file_path));
                }
            }
        }

        // Standard Next.js / Vite alias fallback: @/* or ~/*
        if import_spec.starts_with("@/") || import_spec.starts_with("~/") {
            let suffix = &import_spec[2..];
            let candidates = [
                format!("src/{}", suffix),
                suffix.to_string(),
            ];
            for cand in &candidates {
                let candidate_path = PathBuf::from(cand);
                let normalized = normalize_path(&candidate_path);
                if let Some((file_id, file_path)) = self.probe_file_or_index(&normalized) {
                    return (ResolutionStatus::Internal, Some(file_id), Some(file_path));
                }
            }
        }

        // Not a relative path and didn't match project aliases -> External package
        (ResolutionStatus::External, None, None)
    }

    fn probe_file_or_index(&self, path_str: &str) -> Option<(i64, String)> {
        // Direct match
        if let Some(&id) = self.known_files.get(path_str) {
            return Some((id, path_str.to_string()));
        }

        // Try replacing .js/.mjs/.cjs with .ts/.tsx
        let base_without_ext = if path_str.ends_with(".js") {
            &path_str[..path_str.len() - 3]
        } else if path_str.ends_with(".jsx") || path_str.ends_with(".mjs") || path_str.ends_with(".cjs") {
            &path_str[..path_str.len() - 4]
        } else {
            path_str
        };

        // Try candidate extensions
        let extensions = [
            ".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".json",
        ];
        for ext in &extensions {
            let candidate = format!("{}{}", base_without_ext, ext);
            if let Some(&id) = self.known_files.get(&candidate) {
                return Some((id, candidate));
            }
        }

        // Try directory index files
        let index_candidates = [
            "/index.ts",
            "/index.tsx",
            "/index.d.ts",
            "/index.js",
            "/index.jsx",
            "/index.mjs",
            "/index.cjs",
            "/index.json",
        ];
        for idx in &index_candidates {
            let candidate = format!("{}{}", path_str.trim_end_matches('/'), idx);
            if let Some(&id) = self.known_files.get(&candidate) {
                return Some((id, candidate));
            }
        }

        None
    }
}

fn match_path_alias<'a>(pattern: &'a str, spec: &'a str) -> Option<String> {
    if pattern.ends_with('*') {
        let prefix = &pattern[..pattern.len() - 1];
        if spec.starts_with(prefix) {
            return Some(spec[prefix.len()..].to_string());
        }
    } else if pattern == spec {
        return Some(String::new());
    }
    None
}

fn strip_json_comments(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    let mut in_string = false;
    let mut escape = false;

    while let Some(c) = chars.next() {
        if escape {
            out.push(c);
            escape = false;
            continue;
        }
        if c == '\\' && in_string {
            out.push(c);
            escape = true;
            continue;
        }
        if c == '"' {
            in_string = !in_string;
            out.push(c);
            continue;
        }
        if !in_string {
            if c == '/' {
                if let Some(&'/') = chars.peek() {
                    chars.next();
                    for next_c in chars.by_ref() {
                        if next_c == '\n' {
                            out.push('\n');
                            break;
                        }
                    }
                    continue;
                } else if let Some(&'*') = chars.peek() {
                    chars.next();
                    while let Some(next_c) = chars.next() {
                        if next_c == '*' {
                            if let Some(&'/') = chars.peek() {
                                chars.next();
                                break;
                            }
                        }
                    }
                    continue;
                }
            }
        }
        out.push(c);
    }
    out
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
    fn test_ts_relative_probe() {
        let mut known = HashMap::new();
        known.insert("src/utils/index.ts".to_string(), 1);
        known.insert("src/components/button.tsx".to_string(), 2);
        known.insert("src/constants.ts".to_string(), 3);

        let resolver = TsResolver::new(known, None);

        // Extensionless file
        let (status, id, path) = resolver.resolve("src/index.ts", "./constants");
        assert_eq!(status, ResolutionStatus::Internal);
        assert_eq!(id, Some(3));
        assert_eq!(path.as_deref(), Some("src/constants.ts"));

        // Index file probing
        let (status, id, path) = resolver.resolve("src/index.ts", "./utils");
        assert_eq!(status, ResolutionStatus::Internal);
        assert_eq!(id, Some(1));
        assert_eq!(path.as_deref(), Some("src/utils/index.ts"));

        // TSX probing
        let (status, id, path) = resolver.resolve("src/index.ts", "./components/button");
        assert_eq!(status, ResolutionStatus::Internal);
        assert_eq!(id, Some(2));
        assert_eq!(path.as_deref(), Some("src/components/button.tsx"));

        // External package
        let (status, id, path) = resolver.resolve("src/index.ts", "react");
        assert_eq!(status, ResolutionStatus::External);
        assert_eq!(id, None);
        assert_eq!(path, None);

        // Broken relative import
        let (status, id, _) = resolver.resolve("src/index.ts", "./nonexistent");
        assert_eq!(status, ResolutionStatus::Unresolved);
        assert_eq!(id, None);
    }

    #[test]
    fn test_ts_path_aliases() {
        let mut known = HashMap::new();
        known.insert("src/components/button.tsx".to_string(), 10);

        let tsconfig_str = r#"{
            "compilerOptions": {
                "baseUrl": ".",
                "paths": {
                    "@components/*": ["src/components/*"]
                }
            }
        }"#;
        let tsconfig = TsConfigOptions::parse(tsconfig_str);
        let resolver = TsResolver::new(known, Some(tsconfig));

        let (status, id, path) = resolver.resolve("src/index.ts", "@components/button");
        assert_eq!(status, ResolutionStatus::Internal);
        assert_eq!(id, Some(10));
        assert_eq!(path.as_deref(), Some("src/components/button.tsx"));
    }

    #[test]
    fn test_ts_nextjs_at_alias_fallback_and_comments() {
        let mut known = HashMap::new();
        known.insert("src/components/button.tsx".to_string(), 10);
        known.insert("src/lib/utils.ts".to_string(), 11);

        // JSON with comments
        let tsconfig_str = r#"{
            // Next.js compiler options
            "compilerOptions": {
                /* baseUrl config */
                "baseUrl": "."
            }
        }"#;
        let tsconfig = TsConfigOptions::parse(tsconfig_str);
        let resolver = TsResolver::new(known, Some(tsconfig));

        // @/components/button resolves automatically via fallback
        let (status, id, path) = resolver.resolve("src/app/page.tsx", "@/components/button");
        assert_eq!(status, ResolutionStatus::Internal);
        assert_eq!(id, Some(10));
        assert_eq!(path.as_deref(), Some("src/components/button.tsx"));

        // ~/lib/utils resolves automatically via fallback
        let (status2, id2, path2) = resolver.resolve("src/app/page.tsx", "~/lib/utils");
        assert_eq!(status2, ResolutionStatus::Internal);
        assert_eq!(id2, Some(11));
        assert_eq!(path2.as_deref(), Some("src/lib/utils.ts"));
    }
}

