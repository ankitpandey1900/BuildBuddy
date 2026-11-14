use super::{DependencyType, ManifestDependency};
use serde_json::Value;

pub fn parse_package_json(
    content: &str,
    file_path: &str,
) -> Result<Vec<ManifestDependency>, String> {
    let parsed: Value =
        serde_json::from_str(content).map_err(|e| format!("Invalid package.json: {}", e))?;

    let lines: Vec<&str> = content.lines().collect();

    let find_line = |pkg: &str| -> Option<usize> {
        let needle = format!("\"{}\"", pkg);
        for (idx, line) in lines.iter().enumerate() {
            if line.contains(&needle) {
                return Some(idx + 1);
            }
        }
        None
    };

    let mut results = Vec::new();

    let sections = [
        ("dependencies", DependencyType::Direct),
        ("devDependencies", DependencyType::Dev),
        ("peerDependencies", DependencyType::Peer),
        ("optionalDependencies", DependencyType::Optional),
    ];

    for (section_name, dep_type) in sections {
        if let Some(obj) = parsed.get(section_name).and_then(|v| v.as_object()) {
            for (pkg_name, version_val) in obj {
                let version_spec = version_val.as_str().map(|s| s.to_string());
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

    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_package_json_basic() {
        let json = r#"{
  "name": "my-app",
  "dependencies": {
    "react": "^18.2.0",
    "axios": "~1.6.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  },
  "peerDependencies": {
    "react-dom": "^18.2.0"
  }
}"#;

        let deps = parse_package_json(json, "package.json").unwrap();
        assert_eq!(deps.len(), 5);

        let react = deps.iter().find(|d| d.name == "react").unwrap();
        assert_eq!(react.version_spec.as_deref(), Some("^18.2.0"));
        assert_eq!(react.dep_type, DependencyType::Direct);
        assert_eq!(react.line_number, Some(4));

        let ts = deps.iter().find(|d| d.name == "typescript").unwrap();
        assert_eq!(ts.dep_type, DependencyType::Dev);

        let react_dom = deps.iter().find(|d| d.name == "react-dom").unwrap();
        assert_eq!(react_dom.dep_type, DependencyType::Peer);
    }

    #[test]
    fn test_parse_package_json_invalid() {
        let json = "{ not valid json";
        assert!(parse_package_json(json, "package.json").is_err());
    }
}

