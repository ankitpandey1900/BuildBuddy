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
            // Deduplicate if already present
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

/// Redacts sensitive secret tokens (e.g. Stripe, AWS, GitHub tokens) from text.
pub fn redact_secrets(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let chars: Vec<char> = input.chars().collect();
    let n = chars.len();
    let mut i = 0;

    while i < n {
        // sk_live_ / sk_test_ / pk_live_ / pk_test_
        if i + 8 <= n {
            let pfx: String = chars[i..i + 8].iter().collect();
            if pfx == "sk_live_" || pfx == "sk_test_" || pfx == "pk_live_" || pfx == "pk_test_" {
                let mut j = i + 8;
                while j < n && (chars[j].is_alphanumeric() || chars[j] == '_') {
                    j += 1;
                }
                result.push_str("[REDACTED SECRET]");
                i = j;
                continue;
            }
        }

        // ghp_ (GitHub personal access token)
        if i + 4 <= n {
            let pfx: String = chars[i..i + 4].iter().collect();
            if pfx == "ghp_" {
                let mut j = i + 4;
                while j < n && (chars[j].is_alphanumeric() || chars[j] == '_') {
                    j += 1;
                }
                result.push_str("[REDACTED SECRET]");
                i = j;
                continue;
            }
        }

        // AKIA (AWS access key ID, 20 chars total)
        if i + 20 <= n {
            let pfx: String = chars[i..i + 4].iter().collect();
            if pfx == "AKIA" {
                let rest: Vec<char> = chars[i + 4..i + 20].to_vec();
                if rest.iter().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()) {
                    result.push_str("[REDACTED SECRET]");
                    i += 20;
                    continue;
                }
            }
        }

        result.push(chars[i]);
        i += 1;
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secret_redaction_sk_live() {
        let text = "Stripe secret is sk_test_MOCK_API_KEY_FOR_TESTS in config.";
        let redacted = redact_secrets(text);
        assert!(!redacted.contains("sk_test_MOCK_API_KEY_FOR_TESTS"));
        assert!(redacted.contains("[REDACTED SECRET]"));
        assert_eq!(redacted, "Stripe secret is [REDACTED SECRET] in config.");
    }

    #[test]
    fn test_secret_redaction_aws() {
        let text = "AWS_KEY=AKIAIOSFODNN7EXAMPLE";
        let redacted = redact_secrets(text);
        assert_eq!(redacted, "AWS_KEY=[REDACTED SECRET]");
    }
}
