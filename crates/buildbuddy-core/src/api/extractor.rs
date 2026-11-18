use super::model::ApiEndpoint;

/// Deterministic, source-pattern API extraction for the initially supported
/// server frameworks. A route is emitted only when its method and literal path
/// appear in source; dynamic paths are deliberately not guessed.
pub struct ApiExtractor;

impl ApiExtractor {
    pub fn extract(files: &[(String, &str)]) -> Vec<ApiEndpoint> {
        let mut endpoints = Vec::new();
        for (path, content) in files {
            let extension = path.rsplit('.').next().unwrap_or_default();
            match extension {
                "ts" | "tsx" | "js" | "jsx" => Self::extract_express(path, content, &mut endpoints),
                "py" => Self::extract_python(path, content, &mut endpoints),
                _ => {}
            }
        }
        endpoints.sort_by(|a, b| (&a.file_path, a.start_line, &a.method, &a.route)
            .cmp(&(&b.file_path, b.start_line, &b.method, &b.route)));
        endpoints
    }

    fn extract_express(path: &str, content: &str, output: &mut Vec<ApiEndpoint>) {
        for (index, line) in content.lines().enumerate() {
            let trimmed = line.trim();
            for method in ["get", "post", "put", "patch", "delete", "head", "options"] {
                let needle = format!(".{}(", method);
                let Some(pos) = trimmed.find(&needle) else { continue };
                let args = &trimmed[pos + needle.len()..];
                let Some(route) = Self::literal_argument(args) else { continue };
                let controller_name = Self::express_handler(args);
                output.push(ApiEndpoint {
                    framework: "Express".to_string(),
                    method: method.to_ascii_uppercase(),
                    route,
                    controller_name,
                    file_path: path.to_string(),
                    start_line: (index + 1) as i64,
                    end_line: (index + 1) as i64,
                    snippet: trimmed.to_string(),
                    confidence: "static".to_string(),
                });
            }
        }
    }

    fn extract_python(path: &str, content: &str, output: &mut Vec<ApiEndpoint>) {
        let lines: Vec<&str> = content.lines().collect();
        for (index, line) in lines.iter().enumerate() {
            let trimmed = line.trim();
            let (framework, method, args) = if let Some(rest) = trimmed.strip_prefix("@app.route(") {
                ("Flask", "GET".to_string(), rest)
            } else if let Some(rest) = trimmed.strip_prefix("@app.") {
                let Some((method, args)) = rest.split_once('(') else { continue };
                if !matches!(method, "get" | "post" | "put" | "patch" | "delete" | "head" | "options") { continue; }
                ("FastAPI", method.to_ascii_uppercase(), args)
            } else if let Some(rest) = trimmed.strip_prefix("@router.") {
                let Some((method, args)) = rest.split_once('(') else { continue };
                if !matches!(method, "get" | "post" | "put" | "patch" | "delete" | "head" | "options") { continue; }
                ("FastAPI", method.to_ascii_uppercase(), args)
            } else { continue };
            let Some(route) = Self::literal_argument(args) else { continue };
            let controller_name = lines[index + 1..].iter().find_map(|next| {
                let next = next.trim();
                next.strip_prefix("def ").or_else(|| next.strip_prefix("async def "))
                    .and_then(|definition| definition.split('(').next())
                    .map(str::to_string)
            });
            output.push(ApiEndpoint {
                framework: framework.to_string(),
                method,
                route,
                controller_name,
                file_path: path.to_string(),
                start_line: (index + 1) as i64,
                end_line: (index + 1) as i64,
                snippet: trimmed.to_string(),
                confidence: "static".to_string(),
            });
        }
    }

    fn literal_argument(input: &str) -> Option<String> {
        let value = input.trim_start();
        let quote = value.chars().next()?;
        if quote != '\'' && quote != '"' { return None; }
        let end = value[1..].find(quote)? + 1;
        Some(value[1..end].to_string())
    }

    fn express_handler(args: &str) -> Option<String> {
        let after_route = args.split_once(',')?.1.trim_start();
        if after_route.starts_with("(") || after_route.starts_with("async (") || after_route.contains("=>") {
            return None;
        }
        let name: String = after_route.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '.').collect();
        (!name.is_empty()).then_some(name)
    }
}

#[cfg(test)]
mod tests {
    use super::ApiExtractor;

    #[test]
    fn extracts_supported_literal_routes_with_provenance() {
        let endpoints = ApiExtractor::extract(&[
            ("server.ts".to_string(), "app.get('/health', healthHandler);\napp.post('/users', (req, res) => res.sendStatus(201));"),
            ("routes.py".to_string(), "@router.get(\"/users\")\ndef list_users():\n    return []\n\n@app.route('/')\ndef index():\n    return 'ok'"),
        ]);
        assert_eq!(endpoints.len(), 4);
        assert!(endpoints.iter().any(|e| e.framework == "Express" && e.method == "GET" && e.route == "/health" && e.controller_name.as_deref() == Some("healthHandler")));
        assert!(endpoints.iter().any(|e| e.framework == "FastAPI" && e.route == "/users" && e.controller_name.as_deref() == Some("list_users")));
        assert!(endpoints.iter().all(|e| e.start_line > 0 && e.confidence == "static"));
    }
}
