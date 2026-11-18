use serde::{Deserialize, Serialize};

use crate::docs::lint::{check_banned_phrases, BannedPhraseViolation};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DocumentType {
    ProjectOverview,
    HighLevelDesign,
    LowLevelDesign,
    ApiDocumentation,
    DatabaseDocumentation,
    DependencyInventory,
    ArchitectureDecisionRecords,
    SecurityReport,
    TechnicalDebtReport,
}

impl DocumentType {
    pub fn as_str(&self) -> &'static str {
        match self {
            DocumentType::ProjectOverview => "project_overview",
            DocumentType::HighLevelDesign => "hld",
            DocumentType::LowLevelDesign => "lld",
            DocumentType::ApiDocumentation => "api_documentation",
            DocumentType::DatabaseDocumentation => "database_documentation",
            DocumentType::DependencyInventory => "dependency_inventory",
            DocumentType::ArchitectureDecisionRecords => "adrs",
            DocumentType::SecurityReport => "security_report",
            DocumentType::TechnicalDebtReport => "tech_debt_report",
        }
    }

    pub fn default_title(&self) -> &'static str {
        match self {
            DocumentType::ProjectOverview => "Project Overview",
            DocumentType::HighLevelDesign => "High-Level Design (HLD)",
            DocumentType::LowLevelDesign => "Low-Level Design (LLD)",
            DocumentType::ApiDocumentation => "API Documentation",
            DocumentType::DatabaseDocumentation => "Database Documentation",
            DocumentType::DependencyInventory => "Dependency Inventory",
            DocumentType::ArchitectureDecisionRecords => "Architecture Decision Records (ADRs)",
            DocumentType::SecurityReport => "Security Audit Report",
            DocumentType::TechnicalDebtReport => "Technical Debt Report",
        }
    }
}

impl std::str::FromStr for DocumentType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "project_overview" => Ok(DocumentType::ProjectOverview),
            "hld" => Ok(DocumentType::HighLevelDesign),
            "lld" => Ok(DocumentType::LowLevelDesign),
            "api_documentation" => Ok(DocumentType::ApiDocumentation),
            "database_documentation" => Ok(DocumentType::DatabaseDocumentation),
            "dependency_inventory" => Ok(DocumentType::DependencyInventory),
            "adrs" => Ok(DocumentType::ArchitectureDecisionRecords),
            "security_report" => Ok(DocumentType::SecurityReport),
            "tech_debt_report" => Ok(DocumentType::TechnicalDebtReport),
            other => Err(format!("Unknown document type: {}", other)),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DocumentSectionState {
    Generated,
    UserEdited,
    Stale,
}

impl DocumentSectionState {
    pub fn as_str(&self) -> &'static str {
        match self {
            DocumentSectionState::Generated => "generated",
            DocumentSectionState::UserEdited => "user_edited",
            DocumentSectionState::Stale => "stale",
        }
    }
}

impl std::str::FromStr for DocumentSectionState {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "generated" => Ok(DocumentSectionState::Generated),
            "user_edited" => Ok(DocumentSectionState::UserEdited),
            "stale" => Ok(DocumentSectionState::Stale),
            other => Err(format!("Unknown section state: {}", other)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DocumentSection {
    pub section_key: String,
    pub title: String,
    pub sort_order: i32,
    pub content: String,
    pub content_hash: String,
    pub state: DocumentSectionState,
    pub evidence_keys: Vec<String>,
}

impl DocumentSection {
    pub fn new(
        section_key: impl Into<String>,
        title: impl Into<String>,
        sort_order: i32,
        content: impl Into<String>,
        evidence_keys: Vec<String>,
    ) -> Self {
        let content_str = content.into();
        let hash = blake3::hash(content_str.as_bytes()).to_hex().to_string();
        Self {
            section_key: section_key.into(),
            title: title.into(),
            sort_order,
            content: content_str,
            content_hash: hash,
            state: DocumentSectionState::Generated,
            evidence_keys,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GeneratedDocument {
    pub doc_type: DocumentType,
    pub title: String,
    pub sections: Vec<DocumentSection>,
}

impl GeneratedDocument {
    pub fn render_markdown(&self) -> String {
        let mut md = String::new();
        md.push_str(&format!("# {}\n\n", self.title));
        for section in &self.sections {
            md.push_str(&format!("## {}\n\n", section.title));
            let trimmed = section.content.trim();
            if !trimmed.is_empty() {
                md.push_str(trimmed);
                md.push_str("\n\n");
            }
        }
        md
    }

    pub fn validate_lint(&self) -> Result<(), Vec<BannedPhraseViolation>> {
        let mut violations = Vec::new();

        // Check each section
        for section in &self.sections {
            if let Err(mut v) = check_banned_phrases(&section.content) {
                violations.append(&mut v);
            }
        }

        // Check assembled document
        let full_md = self.render_markdown();
        if let Err(v) = check_banned_phrases(&full_md) {
            for item in v {
                if !violations.contains(&item) {
                    violations.push(item);
                }
            }
        }

        if violations.is_empty() {
            Ok(())
        } else {
            Err(violations)
        }
    }
}

/// Generic detection of credentials and sensitive secrets.
/// Covers:
/// 1. Known key/token prefixes (sk_live_, sk_test_, pk_live_, pk_test_, ghp_, gho_, xoxb-, xoxp-, AKIA...)
/// 2. Key/token/secret/password variable or JSON property assignments
/// 3. Bearer authorization tokens
/// 4. Private key headers (PEM blocks)
/// 5. Long hex strings (>= 32 chars) and long base64 strings (>= 40 chars)
pub fn sentence_contains_secret(sentence: &str) -> bool {
    let lower = sentence.to_lowercase();

    // 1. Known prefix keys
    let prefixes = [
        "sk_live_",
        "sk_test_",
        "pk_live_",
        "pk_test_",
        "ghp_",
        "gho_",
        "ghu_",
        "ghs_",
        "ghr_",
        "github_pat_",
        "xoxb-",
        "xoxp-",
        "xoxa-",
        "xoxr-",
    ];
    for pfx in prefixes {
        if lower.contains(pfx) {
            return true;
        }
    }

    // AWS Access Key ID (AKIA followed by 16 uppercase alphanumeric chars)
    if let Some(pos) = sentence.find("AKIA") {
        if sentence.len() >= pos + 20 {
            let candidate = &sentence[pos + 4..pos + 20];
            if candidate.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()) {
                return true;
            }
        }
    }

    // 2. Private key headers (certificates are public metadata, not secrets)
    if sentence.contains("-----BEGIN") && sentence.contains("PRIVATE KEY") {
        return true;
    }

    // 3. Bearer token
    if let Some(pos) = lower.find("bearer ") {
        let rest = sentence[pos + 7..].trim_start();
        let token: String = rest
            .chars()
            .take_while(|c| c.is_alphanumeric() || *c == '.' || *c == '_' || *c == '-')
            .collect();
        if token.len() >= 16 {
            return true;
        }
    }

    // 4. Assignments: key/token/secret/password = "..."
    let sensitive_keywords = [
        "api_key",
        "apikey",
        "secret",
        "password",
        "auth_token",
        "access_token",
        "client_secret",
        "private_key",
    ];
    for kw in sensitive_keywords {
        if let Some(pos) = lower.find(kw) {
            let after_kw = sentence[pos + kw.len()..].trim_start();
            if after_kw.starts_with('=') || after_kw.starts_with(':') {
                let value_part = after_kw[1..].trim();
                let val_token = if value_part.starts_with('"') || value_part.starts_with('\'') {
                    let quote = value_part.chars().next().unwrap();
                    value_part[1..].split(quote).next().unwrap_or("")
                } else {
                    value_part.split_whitespace().next().unwrap_or("")
                };
                if val_token.len() >= 8 && !val_token.contains(' ') {
                    return true;
                }
            }
        }
    }

    // 5. Long hex (>= 32 chars) and long base64 (>= 40 chars)
    // Exclude:
    // - 40-character hexadecimal strings (standard Git commit SHAs)
    // - Lockfile integrity strings (starting with sha512-, sha384-, sha256-, sha1-)
    for word in sentence.split(|c: char| !c.is_alphanumeric() && c != '+' && c != '/' && c != '=' && c != '_' && c != '-') {
        // Exclude lockfile integrity strings
        if word.starts_with("sha512-")
            || word.starts_with("sha384-")
            || word.starts_with("sha256-")
            || word.starts_with("sha1-")
        {
            continue;
        }

        let clean_word = word.trim_matches(|c: char| !c.is_alphanumeric());

        // Exclude 40-character Git commit SHAs
        if clean_word.len() == 40 && clean_word.chars().all(|c| c.is_ascii_hexdigit()) {
            continue;
        }

        if clean_word.len() >= 32 && clean_word.chars().all(|c| c.is_ascii_hexdigit()) {
            return true;
        }
        if clean_word.len() >= 40 && clean_word.chars().all(|c| c.is_alphanumeric() || c == '+' || c == '/' || c == '=' || c == '_' || c == '-') {
            let has_upper = clean_word.chars().any(|c| c.is_ascii_uppercase());
            let has_lower = clean_word.chars().any(|c| c.is_ascii_lowercase());
            let has_digit = clean_word.chars().any(|c| c.is_ascii_digit());
            if (has_upper && has_lower && has_digit) || clean_word.contains('+') || clean_word.contains('/') || clean_word.contains('=') {
                return true;
            }
        }
    }

    false
}

/// Splits text into individual sentences based on standard sentence delimiters.
pub fn split_into_sentences(text: &str) -> Vec<String> {
    let mut sentences = Vec::new();
    let mut current = String::new();
    let chars: Vec<char> = text.chars().collect();
    let n = chars.len();
    let mut i = 0;

    while i < n {
        current.push(chars[i]);
        if chars[i] == '.' || chars[i] == '!' || chars[i] == '?' {
            if i + 1 == n || chars[i + 1].is_whitespace() {
                let trimmed = current.trim();
                if !trimmed.is_empty() {
                    sentences.push(trimmed.to_string());
                }
                current.clear();
            }
        } else if chars[i] == '\n' {
            let trimmed = current.trim();
            if !trimmed.is_empty() {
                sentences.push(trimmed.to_string());
            }
            current.clear();
        }
        i += 1;
    }

    let trimmed = current.trim();
    if !trimmed.is_empty() {
        sentences.push(trimmed.to_string());
    }

    sentences
}

/// If a sentence contains a detected secret, drops the entire sentence from the text.
/// Preserves markdown formatting, line breaks, code fences, tables, and paragraphs.
pub fn drop_secret_sentences(text: &str) -> String {
    let mut in_code_block = false;
    let mut result_lines = Vec::new();

    for line in text.lines() {
        let trimmed_line = line.trim();
        if trimmed_line.starts_with("```") {
            in_code_block = !in_code_block;
            result_lines.push(line.to_string());
            continue;
        }

        if in_code_block {
            if !sentence_contains_secret(line) {
                result_lines.push(line.to_string());
            }
            continue;
        }

        if trimmed_line.starts_with('#')
            || trimmed_line.starts_with('|')
            || trimmed_line.starts_with('-')
            || trimmed_line.starts_with('*')
        {
            if !sentence_contains_secret(line) {
                result_lines.push(line.to_string());
            }
            continue;
        }

        if trimmed_line.is_empty() {
            result_lines.push(String::new());
            continue;
        }

        let sentences = split_into_sentences(line);
        let clean: Vec<String> = sentences
            .into_iter()
            .filter(|s| !sentence_contains_secret(s))
            .collect();

        if !clean.is_empty() {
            result_lines.push(clean.join(" "));
        }
    }

    result_lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secret_detection_5_shapes() {
        // Shape 1: Prefix key
        let s1 = "Configured with stripe key sk_test_MOCK_API_KEY_FOR_TESTS.";
        assert!(sentence_contains_secret(s1), "Shape 1: prefix key must be detected");

        // Shape 2: Keyword assignment
        let s2 = "Database authentication password: \"super_secret_pwd_999\".";
        assert!(sentence_contains_secret(s2), "Shape 2: assignment must be detected");

        // Shape 3: Bearer token
        let s3 = "Use Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token.";
        assert!(sentence_contains_secret(s3), "Shape 3: bearer token must be detected");

        // Shape 4: Private key header
        let s4 = "-----BEGIN RSA PRIVATE KEY----- MIIEowIBAAKCAQEA0 -----END RSA PRIVATE KEY-----";
        assert!(sentence_contains_secret(s4), "Shape 4: private key header must be detected");

        // Shape 5: Long hex (32 chars) / base64 string
        let s5 = "Access hash is 4f8a3b1c9d2e7f60a5b4c3d2e1f0a9b8.";
        assert!(sentence_contains_secret(s5), "Shape 5: 32-char hex secret must be detected");
    }

    #[test]
    fn test_git_sha_lockfile_integrity_and_certificate_not_flagged() {
        // 40-hex git commit SHA should NOT be flagged
        let git_commit = "Merge commit 6243ea84428052d3d7d3a4db4ea4cf58a57d8485 into master.";
        assert!(!sentence_contains_secret(git_commit), "40-hex git commit SHA must not be flagged as secret");

        // Lockfile integrity string (sha512-...) should NOT be flagged
        let lockfile_integrity = "\"integrity\": \"sha512-v3bZ1+K2o8d4mN5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2q3r4s5t6u7v8w9x0==\"";
        assert!(!sentence_contains_secret(lockfile_integrity), "sha512 lockfile integrity must not be flagged as secret");

        // Certificate header should NOT be flagged
        let cert_header = "-----BEGIN CERTIFICATE-----\nMIIDXTCCAkWgAwIBAgIJAL0...\n-----END CERTIFICATE-----";
        assert!(!sentence_contains_secret(cert_header), "Certificate header must not be flagged as secret");

        // But private key MUST be flagged
        let priv_key = "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkq...\n-----END PRIVATE KEY-----";
        assert!(sentence_contains_secret(priv_key), "Private key header must be flagged as secret");
    }

    #[test]
    fn test_drop_whole_sentence_containing_secret() {
        let input = "BuildBuddy parses code offline. Secret key is sk_test_MOCK_API_KEY_FOR_TESTS. Generates markdown reports.";
        let cleaned = drop_secret_sentences(input);
        assert!(!cleaned.contains("sk_live_"));
        assert!(!cleaned.contains("Secret key is"));
        assert_eq!(cleaned, "BuildBuddy parses code offline. Generates markdown reports.");
    }

    #[test]
    fn test_document_type_roundtrip() {
        let types = [
            DocumentType::ProjectOverview,
            DocumentType::HighLevelDesign,
            DocumentType::LowLevelDesign,
            DocumentType::ApiDocumentation,
            DocumentType::DatabaseDocumentation,
            DocumentType::DependencyInventory,
            DocumentType::ArchitectureDecisionRecords,
        ];
        for t in types {
            let s = t.as_str();
            assert_eq!(s.parse::<DocumentType>(), Ok(t));
            assert!(!t.default_title().is_empty());
        }
    }
}
