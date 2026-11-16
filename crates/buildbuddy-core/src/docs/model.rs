use serde::{Deserialize, Serialize};

use crate::docs::lint::{check_banned_phrases, BannedPhraseViolation};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DocumentType {
    ProjectOverview,
    DependencyInventory,
}

impl DocumentType {
    pub fn as_str(&self) -> &'static str {
        match self {
            DocumentType::ProjectOverview => "project_overview",
            DocumentType::DependencyInventory => "dependency_inventory",
        }
    }

    pub fn default_title(&self) -> &'static str {
        match self {
            DocumentType::ProjectOverview => "Project Overview",
            DocumentType::DependencyInventory => "Dependency Inventory",
        }
    }
}

impl std::str::FromStr for DocumentType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "project_overview" => Ok(DocumentType::ProjectOverview),
            "dependency_inventory" => Ok(DocumentType::DependencyInventory),
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

    // 2. Private key headers
    if sentence.contains("-----BEGIN") && (sentence.contains("PRIVATE KEY") || sentence.contains("CERTIFICATE")) {
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
    for word in sentence.split(|c: char| !c.is_alphanumeric() && c != '+' && c != '/' && c != '=' && c != '_' && c != '-') {
        let clean_word = word.trim_matches(|c: char| !c.is_alphanumeric());
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
pub fn drop_secret_sentences(text: &str) -> String {
    let sentences = split_into_sentences(text);
    let clean_sentences: Vec<String> = sentences
        .into_iter()
        .filter(|s| !sentence_contains_secret(s))
        .collect();

    clean_sentences.join(" ")
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

        // Shape 5: Long hex / base64 string
        let s5 = "Access hash is 4f8a3b1c9d2e7f60a5b4c3d2e1f0a9b8c7d6e5f4.";
        assert!(sentence_contains_secret(s5), "Shape 5: long hex string must be detected");
    }

    #[test]
    fn test_drop_whole_sentence_containing_secret() {
        let input = "BuildBuddy parses code offline. Secret key is sk_test_MOCK_API_KEY_FOR_TESTS. Generates markdown reports.";
        let cleaned = drop_secret_sentences(input);
        assert!(!cleaned.contains("sk_live_"));
        assert!(!cleaned.contains("Secret key is"));
        assert_eq!(cleaned, "BuildBuddy parses code offline. Generates markdown reports.");
    }
}
