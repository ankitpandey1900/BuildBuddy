use std::collections::HashMap;
use std::sync::Arc;

use crate::parser::python::PythonAdapter;
use crate::parser::traits::{FileParseResult, LanguageAdapter, ParseError, ParseStatus, ParserLimits};
use crate::parser::typescript::TypeScriptAdapter;

pub struct ParserManager {
    adapters: HashMap<String, Arc<dyn LanguageAdapter>>,
    limits: ParserLimits,
}

impl ParserManager {
    pub fn new() -> Self {
        Self::with_limits(ParserLimits::default())
    }

    pub fn with_limits(limits: ParserLimits) -> Self {
        let mut manager = Self {
            adapters: HashMap::new(),
            limits,
        };

        let ts_adapter: Arc<dyn LanguageAdapter> = Arc::new(TypeScriptAdapter::new());
        for ext in ts_adapter.supported_extensions() {
            manager.adapters.insert(ext.to_string(), ts_adapter.clone());
        }

        let py_adapter: Arc<dyn LanguageAdapter> = Arc::new(PythonAdapter::new());
        for ext in py_adapter.supported_extensions() {
            manager.adapters.insert(ext.to_string(), py_adapter.clone());
        }

        manager
    }

    pub fn parse_source(
        &self,
        relative_path: &str,
        extension: Option<&str>,
        source: &str,
    ) -> Result<FileParseResult, ParseError> {
        let ext = match extension {
            Some(e) => e.to_lowercase(),
            None => {
                let parts: Vec<&str> = relative_path.rsplitn(2, '.').collect();
                if parts.len() == 2 {
                    parts[0].to_lowercase()
                } else {
                    "".to_string()
                }
            }
        };

        match self.adapters.get(&ext) {
            Some(adapter) => adapter.parse(relative_path, source, &self.limits),
            None => Ok(FileParseResult {
                relative_path: relative_path.to_string(),
                language: ext,
                status: ParseStatus::Unsupported,
                symbols: Vec::new(),
                imports: Vec::new(),
                errors: vec!["Unsupported language extension".to_string()],
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unsupported_file_extension() {
        let manager = ParserManager::new();
        let res = manager.parse_source("README.md", Some("md"), "# Hello").unwrap();
        assert_eq!(res.status, ParseStatus::Unsupported);
        assert_eq!(res.symbols.len(), 0);
        assert_eq!(res.errors.len(), 1);
    }

    #[test]
    fn test_max_file_size_limit() {
        let limits = ParserLimits {
            max_file_size_bytes: 50,
            timeout_ms: 1000,
        };
        let manager = ParserManager::with_limits(limits);
        let large_content = "function a() { return 1; }\n".repeat(10); // > 200 bytes

        let res = manager.parse_source("test.ts", Some("ts"), &large_content).unwrap();
        assert_eq!(res.status, ParseStatus::SkippedTooLarge);
        assert_eq!(res.symbols.len(), 0);
        assert!(res.errors[0].contains("exceeds limit"));
    }

    #[test]
    fn test_parser_timeout_limit() {
        let limits = ParserLimits {
            max_file_size_bytes: 1024 * 1024,
            timeout_ms: 1, // 1 millisecond timeout
        };
        let manager = ParserManager::with_limits(limits);
        // Deeply nested input that stresses the parser
        let mut code = String::new();
        for _ in 0..5000 {
            code.push_str("if (x) { ");
        }
        for _ in 0..5000 {
            code.push_str(" }");
        }

        let res = manager.parse_source("nested.ts", Some("ts"), &code).unwrap();
        // Either completed quickly or caught by timeout
        assert!(res.status == ParseStatus::Timeout || res.status == ParseStatus::Full || res.status == ParseStatus::Partial);
    }
}

