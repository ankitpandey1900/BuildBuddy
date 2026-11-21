use super::model::{ApiEndpoint, ClientApiCall};

/// Deterministic, source-pattern API extraction for supported server frameworks.
/// Supports Express, Next.js (App Router & Pages Router), Flask, and FastAPI.
pub struct ApiExtractor;

impl ApiExtractor {
    pub fn extract(files: &[(String, &str)]) -> Vec<ApiEndpoint> {
        let mut endpoints = Vec::new();
        for (path, content) in files {
            let extension = path.rsplit('.').next().unwrap_or_default();
            match extension {
                "ts" | "tsx" | "js" | "jsx" => {
                    Self::extract_express(path, content, &mut endpoints);
                    Self::extract_nextjs(path, content, &mut endpoints);
                }
                "py" => Self::extract_python(path, content, &mut endpoints),
                _ => {}
            }
        }
        endpoints.sort_by(|a, b| (&a.file_path, a.start_line, &a.method, &a.route)
            .cmp(&(&b.file_path, b.start_line, &b.method, &b.route)));
        endpoints.dedup_by(|a, b| a.file_path == b.file_path && a.start_line == b.start_line && a.method == b.method && a.route == b.route);
        endpoints
    }

    fn extract_nextjs(path: &str, content: &str, output: &mut Vec<ApiEndpoint>) {
        let normalized = path.replace('\\', "/");

        // 1. App Router: .../app/**/route.(ts|js|tsx|jsx)
        if normalized.ends_with("/route.ts")
            || normalized.ends_with("/route.js")
            || normalized.ends_with("/route.tsx")
            || normalized.ends_with("/route.jsx")
            || normalized == "route.ts"
            || normalized == "route.js"
        {
            let route = if let Some(app_idx) = normalized.find("/app/") {
                let after_app = &normalized[app_idx + "/app/".len()..];
                let without_route = if let Some(idx) = after_app.rfind("/route.") {
                    &after_app[..idx]
                } else {
                    ""
                };
                if without_route.is_empty() {
                    "/".to_string()
                } else if without_route.starts_with('/') {
                    without_route.to_string()
                } else {
                    format!("/{}", without_route)
                }
            } else if let Some(api_idx) = normalized.find("api/") {
                let after_api = &normalized[api_idx..];
                let without_route = if let Some(idx) = after_api.rfind("/route.") {
                    &after_api[..idx]
                } else {
                    ""
                };
                format!("/{}", without_route)
            } else {
                "/api".to_string()
            };

            for (index, line) in content.lines().enumerate() {
                let trimmed = line.trim();
                for method in ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] {
                    let fn_needle = format!("export async function {}", method);
                    let sync_needle = format!("export function {}", method);
                    let const_needle = format!("export const {} =", method);
                    let const_space_needle = format!("export const {}=", method);
                    let let_needle = format!("export let {} =", method);
                    if trimmed.starts_with(&fn_needle)
                        || trimmed.starts_with(&sync_needle)
                        || trimmed.starts_with(&const_needle)
                        || trimmed.starts_with(&const_space_needle)
                        || trimmed.starts_with(&let_needle)
                    {
                        output.push(ApiEndpoint {
                            framework: "Next.js (App Router)".to_string(),
                            method: method.to_string(),
                            route: route.clone(),
                            controller_name: Some(format!("{} handler", method)),
                            file_path: path.to_string(),
                            start_line: (index + 1) as i64,
                            end_line: (index + 1) as i64,
                            snippet: trimmed.to_string(),
                            confidence: "confirmed".to_string(),
                        });
                    }
                }
            }
        }
        // 2. Pages Router: .../pages/api/**/*.ts|js
        else if normalized.contains("/pages/api/") || normalized.starts_with("pages/api/") {
            let after_api = if let Some(idx) = normalized.find("/pages/api/") {
                &normalized[idx + "/pages/api/".len()..]
            } else if let Some(stripped) = normalized.strip_prefix("pages/api/") {
                stripped
            } else {
                ""
            };

            let without_ext = after_api.split('.').next().unwrap_or(after_api);
            let route = if without_ext == "index" || without_ext.is_empty() {
                "/api".to_string()
            } else {
                format!("/api/{}", without_ext)
            };

            let mut found_export = false;
            for (index, line) in content.lines().enumerate() {
                let trimmed = line.trim();
                if trimmed.starts_with("export default") {
                    found_export = true;
                    output.push(ApiEndpoint {
                        framework: "Next.js (Pages Router)".to_string(),
                        method: "ALL".to_string(),
                        route: route.clone(),
                        controller_name: Some("default handler".to_string()),
                        file_path: path.to_string(),
                        start_line: (index + 1) as i64,
                        end_line: (index + 1) as i64,
                        snippet: trimmed.to_string(),
                        confidence: "confirmed".to_string(),
                    });
                    break;
                }
            }
            if !found_export {
                output.push(ApiEndpoint {
                    framework: "Next.js (Pages Router)".to_string(),
                    method: "ALL".to_string(),
                    route,
                    controller_name: None,
                    file_path: path.to_string(),
                    start_line: 1,
                    end_line: 1,
                    snippet: "API Route".to_string(),
                    confidence: "static".to_string(),
                });
            }
        }
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

    pub fn extract_client_calls(files: &[(String, &str)]) -> Vec<ClientApiCall> {
        let mut calls = Vec::new();
        for (path, content) in files {
            let normalized = path.replace('\\', "/");
            // Skip route definitions themselves so we only get callers
            if normalized.ends_with("/route.ts")
                || normalized.ends_with("/route.js")
                || normalized.ends_with("/route.tsx")
                || normalized.ends_with("/route.jsx")
                || normalized.contains("/pages/api/")
                || normalized.contains("/app/api/")
            {
                continue;
            }

            let ext = normalized.rsplit('.').next().unwrap_or_default();
            if !matches!(ext, "ts" | "tsx" | "js" | "jsx" | "vue" | "svelte" | "py") {
                continue;
            }

            for (index, line) in content.lines().enumerate() {
                let trimmed = line.trim();
                let line_num = (index + 1) as i64;

                // 1. fetch("...", ...) or fetch('...', ...) or fetch(`...`, ...)
                if let Some(pos) = trimmed.find("fetch(") {
                    let after = &trimmed[pos + 6..];
                    if let Some(route) = Self::extract_url_literal(after) {
                        if route.starts_with("/api") || route.starts_with('/') {
                            let upper = trimmed.to_uppercase();
                            let method = if upper.contains("METHOD: 'POST'")
                                || upper.contains("METHOD: \"POST\"")
                                || upper.contains("METHOD:'POST'")
                            {
                                Some("POST".to_string())
                            } else if upper.contains("METHOD: 'DELETE'")
                                || upper.contains("METHOD: \"DELETE\"")
                            {
                                Some("DELETE".to_string())
                            } else if upper.contains("METHOD: 'PUT'")
                                || upper.contains("METHOD: \"PUT\"")
                            {
                                Some("PUT".to_string())
                            } else if upper.contains("METHOD: 'PATCH'")
                                || upper.contains("METHOD: \"PATCH\"")
                            {
                                Some("PATCH".to_string())
                            } else {
                                Some("GET".to_string())
                            };
                            calls.push(ClientApiCall {
                                caller_file: path.clone(),
                                line_number: line_num,
                                route,
                                method,
                                snippet: trimmed.to_string(),
                            });
                        }
                    }
                }
                // 2. axios.get / post / put / delete / patch
                for verb in ["get", "post", "put", "delete", "patch"] {
                    let needle = format!("axios.{}(", verb);
                    if let Some(pos) = trimmed.find(&needle) {
                        let after = &trimmed[pos + needle.len()..];
                        if let Some(route) = Self::extract_url_literal(after) {
                            if route.starts_with("/api") || route.starts_with('/') {
                                calls.push(ClientApiCall {
                                    caller_file: path.clone(),
                                    line_number: line_num,
                                    route,
                                    method: Some(verb.to_ascii_uppercase()),
                                    snippet: trimmed.to_string(),
                                });
                            }
                        }
                    }
                }
                // 3. apiClient / api.get / post
                for prefix in ["apiClient.", "api.", "client."] {
                    for verb in ["get", "post", "put", "delete", "patch"] {
                        let needle = format!("{}{}(", prefix, verb);
                        if let Some(pos) = trimmed.find(&needle) {
                            let after = &trimmed[pos + needle.len()..];
                            if let Some(route) = Self::extract_url_literal(after) {
                                if route.starts_with("/api") || route.starts_with('/') {
                                    calls.push(ClientApiCall {
                                        caller_file: path.clone(),
                                        line_number: line_num,
                                        route,
                                        method: Some(verb.to_ascii_uppercase()),
                                        snippet: trimmed.to_string(),
                                    });
                                }
                            }
                        }
                    }
                }
                // 4. useSWR / useQuery
                if let Some(pos) = trimmed.find("useSWR(") {
                    let after = &trimmed[pos + 7..];
                    if let Some(route) = Self::extract_url_literal(after) {
                        if route.starts_with("/api") || route.starts_with('/') {
                            calls.push(ClientApiCall {
                                caller_file: path.clone(),
                                line_number: line_num,
                                route,
                                method: Some("GET".to_string()),
                                snippet: trimmed.to_string(),
                            });
                        }
                    }
                }
            }
        }
        calls
    }

    fn extract_url_literal(input: &str) -> Option<String> {
        let trimmed = input.trim_start();
        let quote = trimmed.chars().next()?;
        if quote != '\'' && quote != '"' && quote != '`' {
            return None;
        }
        let rest = &trimmed[1..];
        let end = rest.find(quote)?;
        let mut raw = rest[..end].to_string();
        if let Some(idx) = raw.find("${") {
            raw = raw[..idx].trim_end_matches('/').to_string();
        }
        if let Some(idx) = raw.find('?') {
            raw = raw[..idx].to_string();
        }
        if raw.is_empty() {
            None
        } else {
            Some(raw)
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
            ("apps/web/src/app/api/strikes/route.ts".to_string(), "export async function GET(req: Request) {\n  return Response.json([]);\n}\n\nexport async function POST(req: Request) {\n  return Response.json({});\n}"),
            ("pages/api/checkout.ts".to_string(), "export default function handler(req, res) {\n  res.json({ ok: true });\n}"),
        ]);
        assert_eq!(endpoints.len(), 7);
        assert!(endpoints.iter().any(|e| e.framework == "Express" && e.method == "GET" && e.route == "/health"));
        assert!(endpoints.iter().any(|e| e.framework == "FastAPI" && e.route == "/users" && e.controller_name.as_deref() == Some("list_users")));
        assert!(endpoints.iter().any(|e| e.framework == "Next.js (App Router)" && e.method == "GET" && e.route == "/api/strikes"));
        assert!(endpoints.iter().any(|e| e.framework == "Next.js (App Router)" && e.method == "POST" && e.route == "/api/strikes"));
        assert!(endpoints.iter().any(|e| e.framework == "Next.js (Pages Router)" && e.route == "/api/checkout"));
    }

    #[test]
    fn extracts_client_calls_from_frontend_components() {
        let calls = ApiExtractor::extract_client_calls(&[
            ("apps/web/src/components/LoginForm.tsx".to_string(), "const res = await fetch('/api/auth/login', { method: 'POST' });"),
            ("apps/web/src/components/UserList.tsx".to_string(), "const { data } = useSWR('/api/users', fetcher);"),
            ("apps/web/src/components/DeletePost.tsx".to_string(), "await axios.delete(`/api/posts/${id}`);"),
        ]);
        assert_eq!(calls.len(), 3);
        assert!(calls.iter().any(|c| c.caller_file == "apps/web/src/components/LoginForm.tsx" && c.route == "/api/auth/login" && c.method.as_deref() == Some("POST")));
        assert!(calls.iter().any(|c| c.caller_file == "apps/web/src/components/UserList.tsx" && c.route == "/api/users" && c.method.as_deref() == Some("GET")));
        assert!(calls.iter().any(|c| c.caller_file == "apps/web/src/components/DeletePost.tsx" && c.route == "/api/posts" && c.method.as_deref() == Some("DELETE")));
    }
}
