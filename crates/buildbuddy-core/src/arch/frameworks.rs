use crate::arch::model::{Confidence, DeclaredFramework, EvidenceItem, FrameworkDetection};
use crate::manifest::ManifestDependency;
use crate::parser::FileParseResult;

pub struct FrameworkDetector;

impl FrameworkDetector {
    pub fn detect(
        manifest_deps: &[ManifestDependency],
        parsed_files: &[(String, &FileParseResult, &str)], // (relative_path, parsed, file_content)
        all_relative_paths: &[String],
    ) -> (Vec<FrameworkDetection>, Vec<DeclaredFramework>) {
        let mut detections = Vec::new();
        let mut declared_only = Vec::new();

        // 1. React
        let (react_det, react_decl) = Self::detect_react(manifest_deps, parsed_files, all_relative_paths);
        if let Some(d) = react_det {
            detections.push(d);
        } else if let Some(decl) = react_decl {
            declared_only.push(decl);
        }

        // 2. Next.js
        let (next_det, next_decl) = Self::detect_nextjs(manifest_deps, parsed_files, all_relative_paths);
        if let Some(d) = next_det {
            detections.push(d);
        } else if let Some(decl) = next_decl {
            declared_only.push(decl);
        }

        // 3. Express
        let (exp_det, exp_decl) = Self::detect_express(manifest_deps, parsed_files, all_relative_paths);
        if let Some(d) = exp_det {
            detections.push(d);
        } else if let Some(decl) = exp_decl {
            declared_only.push(decl);
        }

        // 4. Vue
        let (vue_det, vue_decl) = Self::detect_vue(manifest_deps, parsed_files, all_relative_paths);
        if let Some(d) = vue_det {
            detections.push(d);
        } else if let Some(decl) = vue_decl {
            declared_only.push(decl);
        }

        // 5. FastAPI
        let (fastapi_det, fastapi_decl) = Self::detect_fastapi(manifest_deps, parsed_files, all_relative_paths);
        if let Some(d) = fastapi_det {
            detections.push(d);
        } else if let Some(decl) = fastapi_decl {
            declared_only.push(decl);
        }

        // 6. Flask
        let (flask_det, flask_decl) = Self::detect_flask(manifest_deps, parsed_files, all_relative_paths);
        if let Some(d) = flask_det {
            detections.push(d);
        } else if let Some(decl) = flask_decl {
            declared_only.push(decl);
        }

        // 7. Django
        let (django_det, django_decl) = Self::detect_django(manifest_deps, parsed_files, all_relative_paths);
        if let Some(d) = django_det {
            detections.push(d);
        } else if let Some(decl) = django_decl {
            declared_only.push(decl);
        }

        detections.sort_by(|a, b| a.name.cmp(&b.name));
        declared_only.sort_by(|a, b| a.name.cmp(&b.name));

        (detections, declared_only)
    }

    fn detect_react(
        manifest_deps: &[ManifestDependency],
        parsed_files: &[(String, &FileParseResult, &str)],
        all_relative_paths: &[String],
    ) -> (Option<FrameworkDetection>, Option<DeclaredFramework>) {
        let mut evidence = Vec::new();
        let mut has_code_usage = false;
        let mut version = None;
        let mut manifest_dep_record = None;

        // Signal 1: Manifest dependency
        for dep in manifest_deps {
            if dep.name == "react" || dep.name == "react-dom" {
                if version.is_none() && dep.name == "react" {
                    version = dep.version_spec.clone();
                    manifest_dep_record = Some(dep);
                }
                evidence.push(EvidenceItem {
                    file_path: dep.source_file.clone(),
                    start_line: dep.line_number.unwrap_or(1),
                    end_line: dep.line_number.unwrap_or(1),
                    snippet: format!("\"{}\": \"{}\"", dep.name, dep.version_spec.as_deref().unwrap_or("*")),
                    signal_type: "manifest_dependency".to_string(),
                    description: format!("Declared manifest dependency '{}' ({:?})", dep.name, dep.dep_type),
                });
            }
        }

        // Signal 2: Config file (e.g. next.config.*)
        for path in all_relative_paths {
            if path.contains("next.config") {
                evidence.push(EvidenceItem {
                    file_path: path.clone(),
                    start_line: 1,
                    end_line: 1,
                    snippet: path.clone(),
                    signal_type: "config_file".to_string(),
                    description: "Next.js configuration implying React framework".to_string(),
                });
                has_code_usage = true;
            }
        }

        // Signal 3: Import usage from AST
        for (rel_path, parsed, content) in parsed_files {
            for imp in &parsed.imports {
                if imp.source_module == "react"
                    || imp.source_module.starts_with("react/")
                    || imp.source_module == "react-dom"
                    || imp.source_module.starts_with("react-dom/")
                {
                    has_code_usage = true;
                    let line = imp.line_number;
                    let snippet = content.lines().nth(line.saturating_sub(1)).unwrap_or("").trim().to_string();
                    evidence.push(EvidenceItem {
                        file_path: rel_path.clone(),
                        start_line: line,
                        end_line: line,
                        snippet,
                        signal_type: "import_usage".to_string(),
                        description: format!("AST import of React module '{}'", imp.source_module),
                    });
                }
            }
        }

        // Signal 4: Source pattern (e.g. JSX or createRoot)
        for (rel_path, _parsed, content) in parsed_files {
            if rel_path.ends_with(".tsx") || rel_path.ends_with(".jsx") {
                for (idx, line) in content.lines().enumerate() {
                    let trimmed = line.trim();
                    if trimmed.contains("createRoot(")
                        || trimmed.contains("useState(")
                        || trimmed.contains("useEffect(")
                        || trimmed.contains("React.FC")
                    {
                        has_code_usage = true;
                        evidence.push(EvidenceItem {
                            file_path: rel_path.clone(),
                            start_line: idx + 1,
                            end_line: idx + 1,
                            snippet: trimmed.to_string(),
                            signal_type: "source_pattern".to_string(),
                            description: "React hook or rendering pattern".to_string(),
                        });
                        break;
                    }
                }
            }
        }

        if has_code_usage {
            (
                Some(FrameworkDetection {
                    name: "React".to_string(),
                    version,
                    confidence: Confidence::Static,
                    evidence,
                }),
                None,
            )
        } else if let Some(dep) = manifest_dep_record {
            (
                None,
                Some(DeclaredFramework {
                    name: "React".to_string(),
                    version,
                    dependency_type: dep.dep_type.as_str().to_string(),
                    file_path: dep.source_file.clone(),
                    line_number: dep.line_number.unwrap_or(1),
                }),
            )
        } else {
            (None, None)
        }
    }

    fn detect_nextjs(
        manifest_deps: &[ManifestDependency],
        parsed_files: &[(String, &FileParseResult, &str)],
        all_relative_paths: &[String],
    ) -> (Option<FrameworkDetection>, Option<DeclaredFramework>) {
        let mut evidence = Vec::new();
        let mut has_code_usage = false;
        let mut version = None;
        let mut manifest_dep_record = None;

        for dep in manifest_deps {
            if dep.name == "next" {
                version = dep.version_spec.clone();
                manifest_dep_record = Some(dep);
                evidence.push(EvidenceItem {
                    file_path: dep.source_file.clone(),
                    start_line: dep.line_number.unwrap_or(1),
                    end_line: dep.line_number.unwrap_or(1),
                    snippet: format!("\"next\": \"{}\"", dep.version_spec.as_deref().unwrap_or("*")),
                    signal_type: "manifest_dependency".to_string(),
                    description: "Declared Next.js manifest dependency".to_string(),
                });
            }
        }

        for path in all_relative_paths {
            if path.ends_with("next.config.js") || path.ends_with("next.config.mjs") || path.ends_with("next.config.ts") {
                has_code_usage = true;
                evidence.push(EvidenceItem {
                    file_path: path.clone(),
                    start_line: 1,
                    end_line: 1,
                    snippet: path.clone(),
                    signal_type: "config_file".to_string(),
                    description: "Next.js configuration file".to_string(),
                });
            }
        }

        for (rel_path, parsed, content) in parsed_files {
            for imp in &parsed.imports {
                if imp.source_module.starts_with("next/") || imp.source_module == "next" {
                    has_code_usage = true;
                    let line = imp.line_number;
                    let snippet = content.lines().nth(line.saturating_sub(1)).unwrap_or("").trim().to_string();
                    evidence.push(EvidenceItem {
                        file_path: rel_path.clone(),
                        start_line: line,
                        end_line: line,
                        snippet,
                        signal_type: "import_usage".to_string(),
                        description: format!("AST import from Next.js module '{}'", imp.source_module),
                    });
                }
            }

            if rel_path.starts_with("app/") || rel_path.starts_with("pages/") {
                has_code_usage = true;
                evidence.push(EvidenceItem {
                    file_path: rel_path.clone(),
                    start_line: 1,
                    end_line: 1,
                    snippet: rel_path.clone(),
                    signal_type: "source_pattern".to_string(),
                    description: "Next.js routing convention directory".to_string(),
                });
            }
        }

        if has_code_usage {
            (
                Some(FrameworkDetection {
                    name: "Next.js".to_string(),
                    version,
                    confidence: Confidence::Static,
                    evidence,
                }),
                None,
            )
        } else if let Some(dep) = manifest_dep_record {
            (
                None,
                Some(DeclaredFramework {
                    name: "Next.js".to_string(),
                    version,
                    dependency_type: dep.dep_type.as_str().to_string(),
                    file_path: dep.source_file.clone(),
                    line_number: dep.line_number.unwrap_or(1),
                }),
            )
        } else {
            (None, None)
        }
    }

    fn detect_express(
        manifest_deps: &[ManifestDependency],
        parsed_files: &[(String, &FileParseResult, &str)],
        _all_relative_paths: &[String],
    ) -> (Option<FrameworkDetection>, Option<DeclaredFramework>) {
        let mut evidence = Vec::new();
        let mut has_code_usage = false;
        let mut version = None;
        let mut manifest_dep_record = None;

        for dep in manifest_deps {
            if dep.name == "express" {
                version = dep.version_spec.clone();
                manifest_dep_record = Some(dep);
                evidence.push(EvidenceItem {
                    file_path: dep.source_file.clone(),
                    start_line: dep.line_number.unwrap_or(1),
                    end_line: dep.line_number.unwrap_or(1),
                    snippet: format!("\"express\": \"{}\"", dep.version_spec.as_deref().unwrap_or("*")),
                    signal_type: "manifest_dependency".to_string(),
                    description: "Declared Express manifest dependency".to_string(),
                });
            }
        }

        for (rel_path, parsed, content) in parsed_files {
            for imp in &parsed.imports {
                if imp.source_module == "express" {
                    has_code_usage = true;
                    let line = imp.line_number;
                    let snippet = content.lines().nth(line.saturating_sub(1)).unwrap_or("").trim().to_string();
                    evidence.push(EvidenceItem {
                        file_path: rel_path.clone(),
                        start_line: line,
                        end_line: line,
                        snippet,
                        signal_type: "import_usage".to_string(),
                        description: "AST import of Express module".to_string(),
                    });
                }
            }

            for (idx, line) in content.lines().enumerate() {
                let trimmed = line.trim();
                if trimmed.contains("express()")
                    || trimmed.contains("app.listen(")
                    || trimmed.contains("router = express.Router()")
                {
                    has_code_usage = true;
                    evidence.push(EvidenceItem {
                        file_path: rel_path.clone(),
                        start_line: idx + 1,
                        end_line: idx + 1,
                        snippet: trimmed.to_string(),
                        signal_type: "source_pattern".to_string(),
                        description: "Express application initialization or router pattern".to_string(),
                    });
                    break;
                }
            }
        }

        if has_code_usage {
            (
                Some(FrameworkDetection {
                    name: "Express".to_string(),
                    version,
                    confidence: Confidence::Static,
                    evidence,
                }),
                None,
            )
        } else if let Some(dep) = manifest_dep_record {
            (
                None,
                Some(DeclaredFramework {
                    name: "Express".to_string(),
                    version,
                    dependency_type: dep.dep_type.as_str().to_string(),
                    file_path: dep.source_file.clone(),
                    line_number: dep.line_number.unwrap_or(1),
                }),
            )
        } else {
            (None, None)
        }
    }

    fn detect_vue(
        manifest_deps: &[ManifestDependency],
        parsed_files: &[(String, &FileParseResult, &str)],
        all_relative_paths: &[String],
    ) -> (Option<FrameworkDetection>, Option<DeclaredFramework>) {
        let mut evidence = Vec::new();
        let mut has_code_usage = false;
        let mut version = None;
        let mut manifest_dep_record = None;

        for dep in manifest_deps {
            if dep.name == "vue" {
                version = dep.version_spec.clone();
                manifest_dep_record = Some(dep);
                evidence.push(EvidenceItem {
                    file_path: dep.source_file.clone(),
                    start_line: dep.line_number.unwrap_or(1),
                    end_line: dep.line_number.unwrap_or(1),
                    snippet: format!("\"vue\": \"{}\"", dep.version_spec.as_deref().unwrap_or("*")),
                    signal_type: "manifest_dependency".to_string(),
                    description: "Declared Vue manifest dependency".to_string(),
                });
            }
        }

        for path in all_relative_paths {
            if path.ends_with("vue.config.js") || path.ends_with("nuxt.config.ts") || path.ends_with("nuxt.config.js") {
                has_code_usage = true;
                evidence.push(EvidenceItem {
                    file_path: path.clone(),
                    start_line: 1,
                    end_line: 1,
                    snippet: path.clone(),
                    signal_type: "config_file".to_string(),
                    description: "Vue/Nuxt configuration file".to_string(),
                });
            }
        }

        for (rel_path, parsed, content) in parsed_files {
            if rel_path.ends_with(".vue") {
                has_code_usage = true;
                evidence.push(EvidenceItem {
                    file_path: rel_path.clone(),
                    start_line: 1,
                    end_line: 1,
                    snippet: format!("<template> component in {}", rel_path),
                    signal_type: "source_pattern".to_string(),
                    description: "Vue Single File Component (.vue)".to_string(),
                });
            }

            for imp in &parsed.imports {
                if imp.source_module == "vue" || imp.source_module.starts_with("@vue/") {
                    has_code_usage = true;
                    let line = imp.line_number;
                    let snippet = content.lines().nth(line.saturating_sub(1)).unwrap_or("").trim().to_string();
                    evidence.push(EvidenceItem {
                        file_path: rel_path.clone(),
                        start_line: line,
                        end_line: line,
                        snippet,
                        signal_type: "import_usage".to_string(),
                        description: format!("AST import of Vue module '{}'", imp.source_module),
                    });
                }
            }

            for (idx, line) in content.lines().enumerate() {
                let trimmed = line.trim();
                if trimmed.contains("createApp(") || trimmed.contains("defineComponent(") {
                    has_code_usage = true;
                    evidence.push(EvidenceItem {
                        file_path: rel_path.clone(),
                        start_line: idx + 1,
                        end_line: idx + 1,
                        snippet: trimmed.to_string(),
                        signal_type: "source_pattern".to_string(),
                        description: "Vue application or component definition".to_string(),
                    });
                    break;
                }
            }
        }

        if has_code_usage {
            (
                Some(FrameworkDetection {
                    name: "Vue".to_string(),
                    version,
                    confidence: Confidence::Static,
                    evidence,
                }),
                None,
            )
        } else if let Some(dep) = manifest_dep_record {
            (
                None,
                Some(DeclaredFramework {
                    name: "Vue".to_string(),
                    version,
                    dependency_type: dep.dep_type.as_str().to_string(),
                    file_path: dep.source_file.clone(),
                    line_number: dep.line_number.unwrap_or(1),
                }),
            )
        } else {
            (None, None)
        }
    }

    fn detect_fastapi(
        manifest_deps: &[ManifestDependency],
        parsed_files: &[(String, &FileParseResult, &str)],
        _all_relative_paths: &[String],
    ) -> (Option<FrameworkDetection>, Option<DeclaredFramework>) {
        let mut evidence = Vec::new();
        let mut has_code_usage = false;
        let mut version = None;
        let mut manifest_dep_record = None;

        for dep in manifest_deps {
            if dep.name.to_lowercase() == "fastapi" {
                version = dep.version_spec.clone();
                manifest_dep_record = Some(dep);
                evidence.push(EvidenceItem {
                    file_path: dep.source_file.clone(),
                    start_line: dep.line_number.unwrap_or(1),
                    end_line: dep.line_number.unwrap_or(1),
                    snippet: format!("fastapi{}", dep.version_spec.as_deref().unwrap_or("")),
                    signal_type: "manifest_dependency".to_string(),
                    description: "Declared FastAPI manifest dependency".to_string(),
                });
            }
        }

        for (rel_path, parsed, content) in parsed_files {
            for imp in &parsed.imports {
                if imp.source_module == "fastapi" || imp.source_module.starts_with("fastapi.") {
                    has_code_usage = true;
                    let line = imp.line_number;
                    let snippet = content.lines().nth(line.saturating_sub(1)).unwrap_or("").trim().to_string();
                    evidence.push(EvidenceItem {
                        file_path: rel_path.clone(),
                        start_line: line,
                        end_line: line,
                        snippet,
                        signal_type: "import_usage".to_string(),
                        description: "AST import of FastAPI module".to_string(),
                    });
                }
            }

            for (idx, line) in content.lines().enumerate() {
                let trimmed = line.trim();
                if trimmed.contains("FastAPI(") || trimmed.contains("APIRouter(") {
                    has_code_usage = true;
                    evidence.push(EvidenceItem {
                        file_path: rel_path.clone(),
                        start_line: idx + 1,
                        end_line: idx + 1,
                        snippet: trimmed.to_string(),
                        signal_type: "source_pattern".to_string(),
                        description: "FastAPI application or router instance".to_string(),
                    });
                    break;
                }
            }
        }

        if has_code_usage {
            (
                Some(FrameworkDetection {
                    name: "FastAPI".to_string(),
                    version,
                    confidence: Confidence::Static,
                    evidence,
                }),
                None,
            )
        } else if let Some(dep) = manifest_dep_record {
            (
                None,
                Some(DeclaredFramework {
                    name: "FastAPI".to_string(),
                    version,
                    dependency_type: dep.dep_type.as_str().to_string(),
                    file_path: dep.source_file.clone(),
                    line_number: dep.line_number.unwrap_or(1),
                }),
            )
        } else {
            (None, None)
        }
    }

    fn detect_flask(
        manifest_deps: &[ManifestDependency],
        parsed_files: &[(String, &FileParseResult, &str)],
        _all_relative_paths: &[String],
    ) -> (Option<FrameworkDetection>, Option<DeclaredFramework>) {
        let mut evidence = Vec::new();
        let mut has_code_usage = false;
        let mut version = None;
        let mut manifest_dep_record = None;

        for dep in manifest_deps {
            if dep.name.to_lowercase() == "flask" {
                version = dep.version_spec.clone();
                manifest_dep_record = Some(dep);
                evidence.push(EvidenceItem {
                    file_path: dep.source_file.clone(),
                    start_line: dep.line_number.unwrap_or(1),
                    end_line: dep.line_number.unwrap_or(1),
                    snippet: format!("flask{}", dep.version_spec.as_deref().unwrap_or("")),
                    signal_type: "manifest_dependency".to_string(),
                    description: "Declared Flask manifest dependency".to_string(),
                });
            }
        }

        for (rel_path, parsed, content) in parsed_files {
            for imp in &parsed.imports {
                if imp.source_module == "flask" || imp.source_module.starts_with("flask.") {
                    has_code_usage = true;
                    let line = imp.line_number;
                    let snippet = content.lines().nth(line.saturating_sub(1)).unwrap_or("").trim().to_string();
                    evidence.push(EvidenceItem {
                        file_path: rel_path.clone(),
                        start_line: line,
                        end_line: line,
                        snippet,
                        signal_type: "import_usage".to_string(),
                        description: "AST import of Flask module".to_string(),
                    });
                }
            }

            for (idx, line) in content.lines().enumerate() {
                let trimmed = line.trim();
                if trimmed.contains("Flask(__name__)")
                    || trimmed.contains("Flask(")
                    || trimmed.contains("@app.route(")
                {
                    has_code_usage = true;
                    evidence.push(EvidenceItem {
                        file_path: rel_path.clone(),
                        start_line: idx + 1,
                        end_line: idx + 1,
                        snippet: trimmed.to_string(),
                        signal_type: "source_pattern".to_string(),
                        description: "Flask application or route definition".to_string(),
                    });
                    break;
                }
            }
        }

        if has_code_usage {
            (
                Some(FrameworkDetection {
                    name: "Flask".to_string(),
                    version,
                    confidence: Confidence::Static,
                    evidence,
                }),
                None,
            )
        } else if let Some(dep) = manifest_dep_record {
            (
                None,
                Some(DeclaredFramework {
                    name: "Flask".to_string(),
                    version,
                    dependency_type: dep.dep_type.as_str().to_string(),
                    file_path: dep.source_file.clone(),
                    line_number: dep.line_number.unwrap_or(1),
                }),
            )
        } else {
            (None, None)
        }
    }

    fn detect_django(
        manifest_deps: &[ManifestDependency],
        parsed_files: &[(String, &FileParseResult, &str)],
        all_relative_paths: &[String],
    ) -> (Option<FrameworkDetection>, Option<DeclaredFramework>) {
        let mut evidence = Vec::new();
        let mut has_code_usage = false;
        let mut version = None;
        let mut manifest_dep_record = None;

        for dep in manifest_deps {
            if dep.name.to_lowercase() == "django" {
                version = dep.version_spec.clone();
                manifest_dep_record = Some(dep);
                evidence.push(EvidenceItem {
                    file_path: dep.source_file.clone(),
                    start_line: dep.line_number.unwrap_or(1),
                    end_line: dep.line_number.unwrap_or(1),
                    snippet: format!("django{}", dep.version_spec.as_deref().unwrap_or("")),
                    signal_type: "manifest_dependency".to_string(),
                    description: "Declared Django manifest dependency".to_string(),
                });
            }
        }

        for path in all_relative_paths {
            if path.ends_with("manage.py") || path.ends_with("settings.py") {
                has_code_usage = true;
                evidence.push(EvidenceItem {
                    file_path: path.clone(),
                    start_line: 1,
                    end_line: 1,
                    snippet: path.clone(),
                    signal_type: "config_file".to_string(),
                    description: "Django core management or configuration script".to_string(),
                });
            }
        }

        for (rel_path, parsed, content) in parsed_files {
            for imp in &parsed.imports {
                if imp.source_module == "django" || imp.source_module.starts_with("django.") {
                    has_code_usage = true;
                    let line = imp.line_number;
                    let snippet = content.lines().nth(line.saturating_sub(1)).unwrap_or("").trim().to_string();
                    evidence.push(EvidenceItem {
                        file_path: rel_path.clone(),
                        start_line: line,
                        end_line: line,
                        snippet,
                        signal_type: "import_usage".to_string(),
                        description: "AST import of Django module".to_string(),
                    });
                }
            }

            for (idx, line) in content.lines().enumerate() {
                let trimmed = line.trim();
                if trimmed.contains("models.Model")
                    || trimmed.contains("admin.site.register")
                    || trimmed.contains("urlpatterns =")
                {
                    has_code_usage = true;
                    evidence.push(EvidenceItem {
                        file_path: rel_path.clone(),
                        start_line: idx + 1,
                        end_line: idx + 1,
                        snippet: trimmed.to_string(),
                        signal_type: "source_pattern".to_string(),
                        description: "Django model or URL routing pattern".to_string(),
                    });
                    break;
                }
            }
        }

        if has_code_usage {
            (
                Some(FrameworkDetection {
                    name: "Django".to_string(),
                    version,
                    confidence: Confidence::Static,
                    evidence,
                }),
                None,
            )
        } else if let Some(dep) = manifest_dep_record {
            (
                None,
                Some(DeclaredFramework {
                    name: "Django".to_string(),
                    version,
                    dependency_type: dep.dep_type.as_str().to_string(),
                    file_path: dep.source_file.clone(),
                    line_number: dep.line_number.unwrap_or(1),
                }),
            )
        } else {
            (None, None)
        }
    }
}
