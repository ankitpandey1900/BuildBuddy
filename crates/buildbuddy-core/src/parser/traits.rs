use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::symbols::model::{ExtractedExport, ExtractedImport, ExtractedSymbol};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParserLimits {
    pub max_file_size_bytes: usize,
    pub timeout_ms: u64,
}

impl Default for ParserLimits {
    fn default() -> Self {
        Self {
            max_file_size_bytes: 2 * 1024 * 1024, // 2MB
            timeout_ms: 5000,                      // 5 seconds
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParseStatus {
    Full,
    Partial,
    Unsupported,
    SkippedTooLarge,
    Timeout,
    Error,
}

impl ParseStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            ParseStatus::Full => "parsed",
            ParseStatus::Partial => "partial",
            ParseStatus::Unsupported => "unsupported",
            ParseStatus::SkippedTooLarge => "skipped_too_large",
            ParseStatus::Timeout => "timeout",
            ParseStatus::Error => "error",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FileParseResult {
    pub relative_path: String,
    pub language: String,
    pub status: ParseStatus,
    pub symbols: Vec<ExtractedSymbol>,
    pub imports: Vec<ExtractedImport>,
    pub exports: Vec<ExtractedExport>,
    pub errors: Vec<String>,
}

#[derive(Error, Debug, PartialEq, Eq)]
pub enum ParseError {
    #[error("File exceeds maximum parser size limit ({actual} > {limit} bytes)")]
    FileSizeExceeded { actual: usize, limit: usize },
    #[error("Parser timed out after {0} ms")]
    Timeout(u64),
    #[error("Unsupported language for file: {0}")]
    UnsupportedLanguage(String),
    #[error("Internal parsing error: {0}")]
    Internal(String),
}

pub trait LanguageAdapter: Send + Sync {
    fn name(&self) -> &'static str;
    fn supported_extensions(&self) -> &'static [&'static str];
    fn parse(
        &self,
        relative_path: &str,
        source: &str,
        limits: &ParserLimits,
    ) -> Result<FileParseResult, ParseError>;
}

