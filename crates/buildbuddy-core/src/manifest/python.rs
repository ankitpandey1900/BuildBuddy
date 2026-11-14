use super::{DependencyType, ManifestDependency};
use toml::Value;

pub fn parse_requirements_txt(
    content: &str,
    file_path: &str,
) -> Result<Vec<ManifestDependency>, String> {
    let mut results = Vec::new();
    let is_dev_file = file_path.to_lowercase().contains("dev")
        || file_path.to_lowercase().contains("test");

    let dep_type = if is_dev_file {
        DependencyType::Dev
    } else {
        DependencyType::Direct
    };

    for (line_idx, raw_line) in content.lines().enumerate() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        // Skip flags like -r, -i, --extra-index-url
        if line.starts_with('-') {
            continue;
        }

        // Strip inline comments
        let cleaned = if let Some((before_comment, _)) = line.split_once('#') {
            before_comment.trim()
        } else {
            line
        };

        if cleaned.is_empty() {
            continue;
        }

        // Parse package name and version specifier
        let (raw_pkg, version_spec) = extract_python_dep_spec(cleaned);
        let pkg_name = normalize_python_pkg_name(&raw_pkg);

        if !pkg_name.is_empty() {
            results.push(ManifestDependency {
                name: pkg_name,
                version_spec,
                dep_type: dep_type.clone(),
                source_file: file_path.to_string(),
                line_number: Some(line_idx + 1),
            });
        }
    }

    Ok(results)
}

pub fn parse_pyproject_toml(
    content: &str,
    file_path: &str,
) -> Result<Vec<ManifestDependency>, String> {
    let parsed: Value =
        toml::from_str(content).map_err(|e| format!("Invalid pyproject.toml: {}", e))?;

    let lines: Vec<&str> = content.lines().collect();
    let find_line = |pkg: &str| -> Option<usize> {
        for (idx, line) in lines.iter().enumerate() {
            if line.contains(pkg) {
                return Some(idx + 1);
            }
        }
        None
    };

    let mut results = Vec::new();

    // 1. PEP 621: [project.dependencies]
    if let Some(deps) = parsed
        .get("project")
        .and_then(|p| p.get("dependencies"))
        .and_then(|d| d.as_array())
    {
        for item in deps {
            if let Some(dep_str) = item.as_str() {
                let (raw_pkg, version_spec) = extract_python_dep_spec(dep_str);
                let pkg_name = normalize_python_pkg_name(&raw_pkg);
                let line_number = find_line(&pkg_name);
                results.push(ManifestDependency {
                    name: pkg_name,
                    version_spec,
                    dep_type: DependencyType::Direct,
                    source_file: file_path.to_string(),
                    line_number,
                });
            }
        }
    }

    // 2. PEP 621: [project.optional-dependencies]
    if let Some(opt_groups) = parsed
        .get("project")
        .and_then(|p| p.get("optional-dependencies"))
        .and_then(|o| o.as_table())
    {
        for (group_name, list) in opt_groups {
            let dep_type = if group_name.to_lowercase().contains("dev")
                || group_name.to_lowercase().contains("test")
            {
                DependencyType::Dev
            } else {
                DependencyType::Optional
            };

            if let Some(arr) = list.as_array() {
                for item in arr {
                    if let Some(dep_str) = item.as_str() {
                        let (raw_pkg, version_spec) = extract_python_dep_spec(dep_str);
                        let pkg_name = normalize_python_pkg_name(&raw_pkg);
                        let line_number = find_line(&pkg_name);
                        results.push(ManifestDependency {
                            name: pkg_name,
                            version_spec,
                            dep_type: dep_type.clone(),
                            source_file: file_path.to_string(),
                            line_number,
                        });
                    }
                }
            }
        }
    }

    // 3. Poetry: [tool.poetry.dependencies]
    if let Some(deps) = parsed
        .get("tool")
        .and_then(|t| t.get("poetry"))
        .and_then(|p| p.get("dependencies"))
        .and_then(|d| d.as_table())
    {
        for (pkg_name, val) in deps {
            if pkg_name == "python" {
                continue; // Skip runtime python engine specification
            }
            let version_spec = match val {
                Value::String(s) => Some(s.clone()),
                Value::Table(t) => t.get("version").and_then(|v| v.as_str()).map(|s| s.to_string()),
                _ => None,
            };
            let line_number = find_line(pkg_name);
            results.push(ManifestDependency {
                name: pkg_name.clone(),
                version_spec,
                dep_type: DependencyType::Direct,
                source_file: file_path.to_string(),
                line_number,
            });
        }
    }

    // 4. Poetry: [tool.poetry.group.<group>.dependencies] or [tool.poetry.dev-dependencies]
    if let Some(groups) = parsed
        .get("tool")
        .and_then(|t| t.get("poetry"))
        .and_then(|p| p.get("group"))
        .and_then(|g| g.as_table())
    {
        for (group_name, group_val) in groups {
            let is_dev = group_name.to_lowercase().contains("dev")
                || group_name.to_lowercase().contains("test");
            let dep_type = if is_dev {
                DependencyType::Dev
            } else {
                DependencyType::Optional
            };

            if let Some(deps) = group_val.get("dependencies").and_then(|d| d.as_table()) {
                for (pkg_name, val) in deps {
                    let version_spec = match val {
                        Value::String(s) => Some(s.clone()),
                        Value::Table(t) => {
                            t.get("version").and_then(|v| v.as_str()).map(|s| s.to_string())
                        }
                        _ => None,
                    };
                    let line_number = find_line(pkg_name);
                    results.push(ManifestDependency {
                        name: pkg_name.clone(),
                        version_spec,
                        dep_type: dep_type.clone(),
                        source_file: file_path.to_string(),
                        line_number,
                    });
                }
            }
        }
    }

    // Legacy Poetry dev-dependencies: [tool.poetry.dev-dependencies]
    if let Some(dev_deps) = parsed
        .get("tool")
        .and_then(|t| t.get("poetry"))
        .and_then(|p| p.get("dev-dependencies"))
        .and_then(|d| d.as_table())
    {
        for (pkg_name, val) in dev_deps {
            let version_spec = match val {
                Value::String(s) => Some(s.clone()),
                Value::Table(t) => t.get("version").and_then(|v| v.as_str()).map(|s| s.to_string()),
                _ => None,
            };
            let line_number = find_line(pkg_name);
            results.push(ManifestDependency {
                name: pkg_name.clone(),
                version_spec,
                dep_type: DependencyType::Dev,
                source_file: file_path.to_string(),
                line_number,
            });
        }
    }

    Ok(results)
}

fn extract_python_dep_spec(input: &str) -> (String, Option<String>) {
    let spec_delimiters = ["==", ">=", "<=", "~=", "!=", ">", "<", "==="];
    let mut earliest_split: Option<(usize, &str)> = None;

    for &delim in &spec_delimiters {
        if let Some(idx) = input.find(delim) {
            match earliest_split {
                Some((prev_idx, _)) if idx < prev_idx => {
                    earliest_split = Some((idx, delim));
                }
                None => {
                    earliest_split = Some((idx, delim));
                }
                _ => {}
            }
        }
    }

    if let Some((idx, _delim)) = earliest_split {
        let pkg_part = input[..idx].trim();
        let ver_part = input[idx..].trim();
        (pkg_part.to_string(), Some(ver_part.to_string()))
    } else {
        (input.trim().to_string(), None)
    }
}

fn normalize_python_pkg_name(name: &str) -> String {
    // Strip extras, e.g. "requests[security]" -> "requests"
    if let Some((base, _)) = name.split_once('[') {
        base.trim().to_string()
    } else {
        name.trim().to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_requirements_txt() {
        let reqs = r#"
# Core requirements
requests>=2.28.0
Flask==2.3.2 # Web framework
black[d]~=22.0
gunicorn
-r other-requirements.txt
--extra-index-url https://example.com
"#;

        let deps = parse_requirements_txt(reqs, "requirements.txt").unwrap();
        assert_eq!(deps.len(), 4);

        let req = deps.iter().find(|d| d.name == "requests").unwrap();
        assert_eq!(req.version_spec.as_deref(), Some(">=2.28.0"));
        assert_eq!(req.dep_type, DependencyType::Direct);
        assert_eq!(req.line_number, Some(3));

        let flask = deps.iter().find(|d| d.name == "Flask").unwrap();
        assert_eq!(flask.version_spec.as_deref(), Some("==2.3.2"));

        let black = deps.iter().find(|d| d.name == "black").unwrap();
        assert_eq!(black.version_spec.as_deref(), Some("~=22.0"));

        let gunicorn = deps.iter().find(|d| d.name == "gunicorn").unwrap();
        assert_eq!(gunicorn.version_spec, None);
    }

    #[test]
    fn test_parse_requirements_dev_txt() {
        let reqs = "pytest>=7.0.0\nmypy==1.4.0\n";
        let deps = parse_requirements_txt(reqs, "requirements-dev.txt").unwrap();
        assert_eq!(deps.len(), 2);
        assert_eq!(deps[0].dep_type, DependencyType::Dev);
    }

    #[test]
    fn test_parse_pyproject_toml_pep621() {
        let toml_str = r#"
[project]
name = "demo"
version = "0.1.0"
dependencies = [
    "httpx>=0.24.0",
    "pydantic"
]

[project.optional-dependencies]
dev = [
    "pytest>=7.2.0"
]
"#;

        let deps = parse_pyproject_toml(toml_str, "pyproject.toml").unwrap();
        assert_eq!(deps.len(), 3);

        let httpx = deps.iter().find(|d| d.name == "httpx").unwrap();
        assert_eq!(httpx.version_spec.as_deref(), Some(">=0.24.0"));
        assert_eq!(httpx.dep_type, DependencyType::Direct);

        let pytest = deps.iter().find(|d| d.name == "pytest").unwrap();
        assert_eq!(pytest.dep_type, DependencyType::Dev);
    }

    #[test]
    fn test_parse_pyproject_toml_poetry() {
        let toml_str = r#"
[tool.poetry]
name = "poetry-demo"
version = "0.1.0"

[tool.poetry.dependencies]
python = "^3.11"
fastapi = "^0.100.0"
uvicorn = { version = ">=0.22.0", optional = true }

[tool.poetry.group.dev.dependencies]
black = "^23.7.0"
"#;

        let deps = parse_pyproject_toml(toml_str, "pyproject.toml").unwrap();
        assert_eq!(deps.len(), 3);

        let fastapi = deps.iter().find(|d| d.name == "fastapi").unwrap();
        assert_eq!(fastapi.dep_type, DependencyType::Direct);
        assert_eq!(fastapi.version_spec.as_deref(), Some("^0.100.0"));

        let black = deps.iter().find(|d| d.name == "black").unwrap();
        assert_eq!(black.dep_type, DependencyType::Dev);
    }
}
