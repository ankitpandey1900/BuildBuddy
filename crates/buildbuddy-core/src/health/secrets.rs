use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HealthFinding {
    pub file_path: String,
    pub line_number: usize,
    pub category: &'static str,
    pub rule: &'static str,
    pub severity: &'static str,
    pub confidence: &'static str,
    pub title: &'static str,
    pub description: &'static str,
    pub evidence_snippet: &'static str,
}

pub struct SecretDetector;

impl SecretDetector {
    /// Runs deterministic source rules. Credential values are never returned.
    pub fn scan(files: &[(String, &str)]) -> Vec<HealthFinding> {
        let paths: HashSet<&str> = files.iter().map(|(path, _)| path.as_str()).collect();
        let mut findings = Vec::new();
        let mut duplicate_lines: HashMap<String, (String, usize)> = HashMap::new();

        for (file_path, content) in files {
            let lines: Vec<&str> = content.lines().collect();
            for (index, line) in lines.iter().enumerate() {
                let line_number = index + 1;
                if let Some(finding) = Self::credential_finding(file_path, line, line_number) {
                    findings.push(finding);
                }
                if let Some(finding) = Self::unsafe_pattern_finding(file_path, line, line_number) {
                    findings.push(finding);
                }
                if Self::is_unhandled_async_operation(&lines, index) {
                    findings.push(Self::finding(file_path, line_number, "dead_code", "missing_error_handling", "low", "inferred", "Async operation without nearby error handling", "An async network or file operation has no nearby try/catch marker. Review whether failures are handled by this function or its caller.", "Async operation pattern"));
                }
                if Self::is_unreachable_after(&lines, index) {
                    findings.push(Self::finding(file_path, line_number + 1, "dead_code", "unreachable_after_terminator", "medium", "static", "Potential unreachable statement", "A statement follows a terminating control-flow statement in the same block. Confirm it is not intentionally guarded.", "Control-flow statement"));
                }

                let normalized = Self::normalize_statement(line);
                if let Some(normalized) = normalized {
                    if let Some((first_file, first_line)) = duplicate_lines.get(&normalized) {
                        if first_file != file_path || *first_line != line_number {
                            findings.push(Self::finding(file_path, line_number, "dead_code", "duplicate_statement", "low", "inferred", "Potential duplicate statement", "This normalized statement also appears elsewhere. Compare the surrounding logic before consolidating it.", "Duplicate statement candidate"));
                        }
                    } else {
                        duplicate_lines.insert(normalized, (file_path.clone(), line_number));
                    }
                }
            }

            if Self::is_source_file(file_path) && Self::appears_to_define_code(content) && !Self::has_matching_test(file_path, &paths) {
                findings.push(Self::finding(file_path, 1, "dead_code", "missing_matching_test", "low", "inferred", "No matching test file", "No conventionally named test file was found for this source file. This is a coverage signal, not proof that the code is untested.", "Test-file naming check"));
            }
        }
        findings
    }

    fn finding(file_path: &str, line_number: usize, category: &'static str, rule: &'static str, severity: &'static str, confidence: &'static str, title: &'static str, description: &'static str, evidence_snippet: &'static str) -> HealthFinding {
        HealthFinding { file_path: file_path.to_string(), line_number, category, rule, severity, confidence, title, description, evidence_snippet }
    }

    fn credential_finding(file_path: &str, line: &str, line_number: usize) -> Option<HealthFinding> {
        let lower = line.to_ascii_lowercase();
        if lower.contains("-----begin") && lower.contains("private key-----") { return Some(Self::finding(file_path, line_number, "security", "private_key_header", "high", "static", "Potential hardcoded private key", "A private-key header is present in source. Review the source and move active key material to an approved secret store.", "Sensitive value redacted")); }
        if lower.contains("sk_live_") || lower.contains("ghp_") || lower.contains("github_pat_") || lower.contains("xoxb-") || line.contains("AKIA") { return Some(Self::finding(file_path, line_number, "security", "known_credential_prefix", "high", "static", "Potential hardcoded credential", "A known credential-shaped prefix is present in source. Review the source and revoke or rotate an active credential.", "Sensitive value redacted")); }
        let sensitive = ["api_key", "apikey", "secret", "password", "access_token", "auth_token", "client_secret"].iter().any(|key| lower.contains(key));
        let literal = (line.contains('=') || line.contains(':')) && (line.contains('\"') || line.contains('\''));
        let environment = lower.contains("process.env") || lower.contains("os.getenv") || lower.contains("getenv(") || lower.contains("env[") || lower.contains("${");
        (sensitive && literal && !environment).then(|| Self::finding(file_path, line_number, "security", "literal_sensitive_assignment", "medium", "static", "Potential literal sensitive assignment", "A sensitive variable appears to receive a literal value. Review the source and use an approved secret store if the value is active.", "Sensitive value redacted"))
    }

    fn unsafe_pattern_finding(file_path: &str, line: &str, line_number: usize) -> Option<HealthFinding> {
        let lower = line.to_ascii_lowercase();
        if lower.contains("eval(") || lower.contains("new function(") { return Some(Self::finding(file_path, line_number, "security", "dynamic_code_execution", "high", "static", "Dynamic code execution", "Dynamic code execution is present. Verify that untrusted input cannot reach this operation.", "Dynamic code execution pattern")); }
        if lower.contains("dangerouslysetinnerhtml") || lower.contains(".innerhtml =") { return Some(Self::finding(file_path, line_number, "security", "unsafe_html_sink", "medium", "static", "Unsafe HTML rendering sink", "An HTML rendering sink is present. Verify that its input is trusted or sanitized.", "HTML rendering sink")); }
        if lower.contains("verify=false") || lower.contains("ssl_verify=false") || lower.contains("rejectunauthorized: false") { return Some(Self::finding(file_path, line_number, "security", "tls_verification_disabled", "high", "static", "TLS verification disabled", "TLS certificate verification appears disabled. Do not use this setting for production traffic.", "TLS verification setting")); }
        None
    }

    fn is_unreachable_after(lines: &[&str], index: usize) -> bool {
        let current = lines[index].trim();
        let terminates = current.starts_with("return ") || current == "return;" || current.starts_with("throw ") || current.starts_with("panic!(");
        let Some(next) = lines.get(index + 1).map(|line| line.trim()) else { return false };
        terminates && !next.is_empty() && !next.starts_with("//") && !next.starts_with('#') && !next.starts_with('}') && !next.starts_with("else")
    }

    fn is_unhandled_async_operation(lines: &[&str], index: usize) -> bool {
        let line = lines[index].to_ascii_lowercase();
        if !line.contains("await ") || !(line.contains("fetch(") || line.contains("axios.") || line.contains("read_to_string") || line.contains("readfile(")) { return false; }
        let start = index.saturating_sub(5);
        !lines[start..=index].iter().any(|candidate| candidate.contains("try {") || candidate.contains(".catch("))
    }

    fn normalize_statement(line: &str) -> Option<String> {
        let trimmed = line.trim();
        if trimmed.len() < 32 || trimmed.starts_with("import ") || trimmed.starts_with("use ") || trimmed.starts_with("//") || trimmed.starts_with('#') { return None; }
        Some(trimmed.split_whitespace().collect::<Vec<_>>().join(" "))
    }

    fn is_source_file(path: &str) -> bool { matches!(path.rsplit('.').next(), Some("ts" | "tsx" | "js" | "jsx" | "py" | "rs")) && !path.contains(".test.") && !path.contains(".spec.") && !path.contains("__tests__") }
    fn appears_to_define_code(content: &str) -> bool { content.contains("function ") || content.contains("class ") || content.contains("def ") || content.contains("fn ") }
    fn has_matching_test(path: &str, paths: &HashSet<&str>) -> bool {
        let stem = path.rsplit_once('.').map(|(name, _)| name).unwrap_or(path);
        [format!("{}.test.ts", stem), format!("{}.test.tsx", stem), format!("{}.spec.ts", stem), format!("{}.spec.tsx", stem), format!("{}_test.py", stem), format!("test_{}.py", stem.rsplit('/').next().unwrap_or(stem))].iter().any(|candidate| paths.contains(candidate.as_str()))
    }
}

#[cfg(test)]
mod tests { use super::SecretDetector;
    #[test] fn finds_rules_without_returning_credential_values() { let f = SecretDetector::scan(&[("src/config.ts".to_string(), "const api_key = 'not-for-output';\neval(input);\nawait fetch('/orders');\nreturn result;\nconsole.log('never');")]); assert!(f.iter().any(|item| item.rule == "literal_sensitive_assignment" && item.evidence_snippet == "Sensitive value redacted")); assert!(f.iter().any(|item| item.rule == "dynamic_code_execution")); assert!(f.iter().any(|item| item.rule == "missing_error_handling")); assert!(f.iter().any(|item| item.rule == "unreachable_after_terminator")); }
    #[test] fn excludes_environment_references_and_certificates() { let f = SecretDetector::scan(&[("src/config.ts".to_string(), "const password = process.env.PASSWORD;\n-----BEGIN CERTIFICATE-----")]); assert!(!f.iter().any(|item| item.category == "security")); }
}
