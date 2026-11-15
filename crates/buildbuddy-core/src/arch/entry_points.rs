use crate::arch::model::{Confidence, EntryPoint};
use crate::parser::FileParseResult;

pub struct EntryPointDetector;

impl EntryPointDetector {
    pub fn detect(
        all_files: &[(String, &str)], // (relative_path, content)
        parsed_files: &[(String, &FileParseResult, &str)],
    ) -> Vec<EntryPoint> {
        let mut entries = Vec::new();

        // 1. package.json entry points (main, bin, scripts)
        for (rel_path, content) in all_files {
            if rel_path == "package.json" {
                entries.extend(Self::extract_package_json_entries(rel_path, content));
            }
        }

        // 2. Framework entry files and source patterns
        for (rel_path, _parsed, content) in parsed_files {
            // Express: app.listen / server.listen
            for (idx, line) in content.lines().enumerate() {
                let trimmed = line.trim();
                if trimmed.contains(".listen(") && (trimmed.contains("app.listen") || trimmed.contains("server.listen")) {
                    entries.push(EntryPoint {
                        name: "Express HTTP Server Entry".to_string(),
                        entry_type: "framework_entry".to_string(),
                        file_path: rel_path.clone(),
                        start_line: idx + 1,
                        end_line: idx + 1,
                        snippet: trimmed.to_string(),
                        confidence: Confidence::Static,
                    });
                    break;
                }
            }

            // React / Web Client: createRoot / ReactDOM.render
            for (idx, line) in content.lines().enumerate() {
                let trimmed = line.trim();
                if trimmed.contains("createRoot(") || trimmed.contains("ReactDOM.render(") {
                    entries.push(EntryPoint {
                        name: "React DOM Root Entry".to_string(),
                        entry_type: "framework_entry".to_string(),
                        file_path: rel_path.clone(),
                        start_line: idx + 1,
                        end_line: idx + 1,
                        snippet: trimmed.to_string(),
                        confidence: Confidence::Static,
                    });
                    break;
                }
            }

            // Next.js entry files
            if rel_path == "app/layout.tsx" || rel_path == "app/layout.jsx" || rel_path == "app/page.tsx" || rel_path == "app/page.jsx" || rel_path == "pages/_app.tsx" || rel_path == "pages/_app.js" {
                let snippet = content.lines().find(|l| !l.trim().is_empty()).unwrap_or("export default").trim().to_string();
                entries.push(EntryPoint {
                    name: format!("Next.js Route Entry: {}", rel_path),
                    entry_type: "framework_entry".to_string(),
                    file_path: rel_path.clone(),
                    start_line: 1,
                    end_line: 1,
                    snippet,
                    confidence: Confidence::Static,
                });
            }

            // Vue createApp
            for (idx, line) in content.lines().enumerate() {
                let trimmed = line.trim();
                if trimmed.contains("createApp(") && (rel_path.ends_with("main.ts") || rel_path.ends_with("main.js")) {
                    entries.push(EntryPoint {
                        name: "Vue Application Entry".to_string(),
                        entry_type: "framework_entry".to_string(),
                        file_path: rel_path.clone(),
                        start_line: idx + 1,
                        end_line: idx + 1,
                        snippet: trimmed.to_string(),
                        confidence: Confidence::Static,
                    });
                    break;
                }
            }

            // Django manage.py / asgi.py / wsgi.py
            if rel_path.ends_with("manage.py") || rel_path.ends_with("wsgi.py") || rel_path.ends_with("asgi.py") {
                let snippet = content.lines().find(|l| l.contains("DJANGO_SETTINGS_MODULE") || l.contains("execute_from_command_line")).unwrap_or("import os").trim().to_string();
                entries.push(EntryPoint {
                    name: format!("Django System Entry: {}", rel_path),
                    entry_type: "framework_entry".to_string(),
                    file_path: rel_path.clone(),
                    start_line: 1,
                    end_line: 1,
                    snippet,
                    confidence: Confidence::Static,
                });
            }
        }

        // 3. Python __main__ blocks and app factories
        for (rel_path, parsed, content) in parsed_files {
            // Check for __main__ block in Python files
            if rel_path.ends_with(".py") {
                for (idx, line) in content.lines().enumerate() {
                    let trimmed = line.trim();
                    if trimmed.starts_with("if __name__ ==") && trimmed.contains("__main__") {
                        entries.push(EntryPoint {
                            name: "Python __main__ Entry".to_string(),
                            entry_type: "main_block".to_string(),
                            file_path: rel_path.clone(),
                            start_line: idx + 1,
                            end_line: idx + 1,
                            snippet: trimmed.to_string(),
                            confidence: Confidence::Static,
                        });
                    }
                }
            }

            // Check for app factories from extracted functions or code
            for func in &parsed.functions {
                let lower = func.name.to_lowercase();
                if lower == "create_app" || lower == "make_app" || lower == "build_app" {
                    let snippet = content
                        .lines()
                        .nth(func.start_line.saturating_sub(1))
                        .unwrap_or("")
                        .trim()
                        .to_string();
                    entries.push(EntryPoint {
                        name: format!("Application Factory: {}()", func.name),
                        entry_type: "app_factory".to_string(),
                        file_path: rel_path.clone(),
                        start_line: func.start_line,
                        end_line: func.end_line,
                        snippet: if snippet.is_empty() {
                            format!("def {}():", func.name)
                        } else {
                            snippet
                        },
                        confidence: Confidence::Static,
                    });
                }
            }

            // Check for FastAPI / Flask instance assignment at top level (e.g. app = FastAPI(...) or app = Flask(...))
            if rel_path.ends_with(".py") {
                for (idx, line) in content.lines().enumerate() {
                    let trimmed = line.trim();
                    if (trimmed.starts_with("app = FastAPI(") || trimmed.starts_with("app = Flask(")) && !trimmed.contains("def ") {
                        let name = if trimmed.contains("FastAPI") {
                            "FastAPI Application Factory / Instance"
                        } else {
                            "Flask Application Factory / Instance"
                        };
                        entries.push(EntryPoint {
                            name: name.to_string(),
                            entry_type: "app_factory".to_string(),
                            file_path: rel_path.clone(),
                            start_line: idx + 1,
                            end_line: idx + 1,
                            snippet: trimmed.to_string(),
                            confidence: Confidence::Static,
                        });
                        break;
                    }
                }
            }
        }

        // Deduplicate and sort
        entries.sort_by(|a, b| {
            (&a.file_path, a.start_line, &a.name).cmp(&(&b.file_path, b.start_line, &b.name))
        });
        entries.dedup_by(|a, b| a.file_path == b.file_path && a.start_line == b.start_line && a.name == b.name);

        entries
    }

    fn extract_package_json_entries(rel_path: &str, content: &str) -> Vec<EntryPoint> {
        let mut entries = Vec::new();
        let json: serde_json::Value = match serde_json::from_str(content) {
            Ok(v) => v,
            Err(_) => return entries,
        };

        let lines: Vec<&str> = content.lines().collect();

        // 1. "main" field
        if let Some(main_val) = json.get("main").and_then(|v| v.as_str()) {
            let line_no = Self::find_line(&lines, "\"main\"");
            entries.push(EntryPoint {
                name: "package.json main".to_string(),
                entry_type: "main".to_string(),
                file_path: rel_path.to_string(),
                start_line: line_no,
                end_line: line_no,
                snippet: format!("\"main\": \"{}\"", main_val),
                confidence: Confidence::Static,
            });
        }

        // 2. "bin" field
        if let Some(bin_obj) = json.get("bin") {
            if let Some(bin_str) = bin_obj.as_str() {
                let line_no = Self::find_line(&lines, "\"bin\"");
                entries.push(EntryPoint {
                    name: "package.json bin".to_string(),
                    entry_type: "bin".to_string(),
                    file_path: rel_path.to_string(),
                    start_line: line_no,
                    end_line: line_no,
                    snippet: format!("\"bin\": \"{}\"", bin_str),
                    confidence: Confidence::Static,
                });
            } else if let Some(bin_map) = bin_obj.as_object() {
                for (bin_name, bin_val) in bin_map {
                    let pattern = format!("\"{}\"", bin_name);
                    let line_no = Self::find_line(&lines, &pattern);
                    entries.push(EntryPoint {
                        name: format!("package.json bin: {}", bin_name),
                        entry_type: "bin".to_string(),
                        file_path: rel_path.to_string(),
                        start_line: line_no,
                        end_line: line_no,
                        snippet: format!("\"{}\": \"{}\"", bin_name, bin_val.as_str().unwrap_or("")),
                        confidence: Confidence::Static,
                    });
                }
            }
        }

        // 3. "scripts" field: keep only start/dev/serve scripts, label as "script"
        if let Some(scripts) = json.get("scripts").and_then(|v| v.as_object()) {
            for script_name in ["start", "dev", "serve"] {
                if let Some(script_val) = scripts.get(script_name).and_then(|v| v.as_str()) {
                    let pattern = format!("\"{}\"", script_name);
                    let line_no = Self::find_line(&lines, &pattern);
                    entries.push(EntryPoint {
                        name: format!("package.json script: {}", script_name),
                        entry_type: "script".to_string(),
                        file_path: rel_path.to_string(),
                        start_line: line_no,
                        end_line: line_no,
                        snippet: format!("\"{}\": \"{}\"", script_name, script_val),
                        confidence: Confidence::Static,
                    });
                }
            }
        }

        entries
    }

    fn find_line(lines: &[&str], search: &str) -> usize {
        for (i, line) in lines.iter().enumerate() {
            if line.contains(search) {
                return i + 1;
            }
        }
        1
    }
}
