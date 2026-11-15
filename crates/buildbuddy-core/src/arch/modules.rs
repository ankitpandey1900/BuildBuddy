use std::collections::{HashMap, HashSet};
use crate::arch::model::{LayerLabel, ModuleGroup};
use crate::graph::model::ImportEdge;

pub struct ModuleGrouper;

impl ModuleGrouper {
    pub fn group_modules(
        all_relative_paths: &[String],
        edges: &[ImportEdge],
    ) -> Vec<ModuleGroup> {
        let mut dir_to_files: HashMap<String, Vec<String>> = HashMap::new();

        for rel_path in all_relative_paths {
            let normalized = rel_path.replace('\\', "/");
            let dir = Self::extract_module_dir(&normalized);
            dir_to_files.entry(dir).or_default().push(normalized);
        }

        // Map each file to its module
        let mut file_to_module: HashMap<String, String> = HashMap::new();
        for (module_dir, files) in &dir_to_files {
            for f in files {
                file_to_module.insert(f.clone(), module_dir.clone());
            }
        }

        // Count internal vs external edges per module
        let mut internal_edge_counts: HashMap<String, usize> = HashMap::new();
        let mut outgoing_edge_counts: HashMap<String, usize> = HashMap::new();
        let mut modules_importing: HashMap<String, HashSet<String>> = HashMap::new();

        for edge in edges {
            let src_mod = file_to_module.get(&edge.source_file_path);
            let tgt_mod = edge.target_file_path.as_ref().and_then(|p| file_to_module.get(p));

            if let Some(src) = src_mod {
                if let Some(tgt) = tgt_mod {
                    if src == tgt {
                        *internal_edge_counts.entry(src.clone()).or_insert(0) += 1;
                    } else {
                        *outgoing_edge_counts.entry(src.clone()).or_insert(0) += 1;
                        modules_importing.entry(tgt.clone()).or_default().insert(src.clone());
                    }
                }
            }
        }

        let mut groups = Vec::new();

        // Sort keys for deterministic output
        let mut module_dirs: Vec<String> = dir_to_files.keys().cloned().collect();
        module_dirs.sort();

        for mod_dir in module_dirs {
            let mut files = dir_to_files.remove(&mod_dir).unwrap_or_default();
            files.sort();

            let internal = *internal_edge_counts.get(&mod_dir).unwrap_or(&0) as f64;
            let outgoing = *outgoing_edge_counts.get(&mod_dir).unwrap_or(&0) as f64;
            let total = internal + outgoing;
            let cohesion_score = if total > 0.0 {
                ((internal / total) * 100.0).round() / 100.0
            } else {
                1.0
            };

            let layer = Self::classify_layer(&mod_dir, &files);

            let name = if mod_dir == "." {
                "root".to_string()
            } else {
                mod_dir.replace('/', "::")
            };

            groups.push(ModuleGroup {
                name,
                root_directory: mod_dir,
                layer,
                file_count: files.len(),
                cohesion_score,
                files,
            });
        }

        // If a module is imported by both a frontend and backend module, classify as Shared if currently unclassified
        let frontend_mods: HashSet<String> = groups.iter().filter(|g| g.layer == LayerLabel::Frontend).map(|g| g.root_directory.clone()).collect();
        let backend_mods: HashSet<String> = groups.iter().filter(|g| g.layer == LayerLabel::Backend).map(|g| g.root_directory.clone()).collect();

        for group in &mut groups {
            if group.layer == LayerLabel::Unclassified {
                if let Some(importers) = modules_importing.get(&group.root_directory) {
                    let has_fe = importers.iter().any(|m| frontend_mods.contains(m));
                    let has_be = importers.iter().any(|m| backend_mods.contains(m));
                    if has_fe && has_be {
                        group.layer = LayerLabel::Shared;
                    }
                }
            }
        }

        groups
    }

    fn extract_module_dir(path: &str) -> String {
        let parts: Vec<&str> = path.split('/').collect();
        if parts.len() <= 1 {
            return ".".to_string();
        }

        // If path starts with "src/" and has a subfolder (e.g. "src/client/App.tsx")
        if parts[0] == "src" && parts.len() > 2 {
            format!("src/{}", parts[1])
        } else if parts.len() > 2 {
            // e.g. "pkg/subpkg/main.py" -> "pkg"
            parts[0].to_string()
        } else {
            // e.g. "api/routes.py" -> "api" or "src/index.ts" -> "src"
            parts[0].to_string()
        }
    }

    fn classify_layer(mod_dir: &str, files: &[String]) -> LayerLabel {
        let dir_lower = mod_dir.to_lowercase();

        // 1. Frontend layer evidence
        if dir_lower.contains("client")
            || dir_lower.contains("frontend")
            || dir_lower.contains("ui")
            || dir_lower.contains("components")
            || dir_lower.contains("pages")
            || dir_lower.contains("views")
        {
            return LayerLabel::Frontend;
        }

        // Check if all/most files are TSX/JSX/CSS/HTML
        let frontend_file_count = files.iter().filter(|f| {
            f.ends_with(".tsx") || f.ends_with(".jsx") || f.ends_with(".vue") || f.ends_with(".css") || f.ends_with(".html")
        }).count();

        if !files.is_empty() && frontend_file_count == files.len() {
            return LayerLabel::Frontend;
        }

        // 2. Backend layer evidence
        if dir_lower.contains("server")
            || dir_lower.contains("backend")
            || dir_lower.contains("api")
            || dir_lower.contains("controllers")
            || dir_lower.contains("routes")
            || dir_lower.contains("services")
            || dir_lower.contains("handlers")
        {
            return LayerLabel::Backend;
        }

        // 3. Data layer evidence
        if dir_lower.contains("models")
            || dir_lower.contains("entities")
            || dir_lower.contains("data")
            || dir_lower.contains("db")
            || dir_lower.contains("migrations")
            || dir_lower.contains("schemas")
            || dir_lower.contains("repositories")
        {
            return LayerLabel::Data;
        }

        // 4. Config layer evidence
        if dir_lower.contains("config") || dir_lower.contains("settings") {
            return LayerLabel::Config;
        }

        // 5. Shared layer evidence
        if dir_lower.contains("shared")
            || dir_lower.contains("common")
            || dir_lower.contains("utils")
            || dir_lower.contains("lib")
        {
            return LayerLabel::Shared;
        }

        // Root directory check
        if mod_dir == "." {
            let config_only = files.iter().all(|f| {
                f.ends_with(".json") || f.ends_with(".toml") || f.ends_with(".txt") || f.ends_with(".config.ts") || f.ends_with(".config.js") || f.ends_with(".md")
            });
            if config_only {
                return LayerLabel::Config;
            }
        }

        LayerLabel::Unclassified
    }
}

