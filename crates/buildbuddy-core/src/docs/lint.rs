use std::fmt;

pub const BANNED_PHRASES: &[&str] = &[
    "dive into",
    "it is worth noting",
    "comprehensive",
    "in today's",
    "rapidly evolving",
    "robust",
    "seamless",
    "leverage",
    "delve",
    "this document aims",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BannedPhraseViolation {
    pub phrase: String,
    pub line: usize,
    pub column: usize,
}

impl fmt::Display for BannedPhraseViolation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Banned phrase '{}' found at line {}, col {}",
            self.phrase, self.line, self.column
        )
    }
}

/// Checks the given text for any prohibited marketing / filler phrases.
/// Comparison is case-insensitive.
pub fn check_banned_phrases(text: &str) -> Result<(), Vec<BannedPhraseViolation>> {
    let mut violations = Vec::new();

    for (line_idx, line) in text.lines().enumerate() {
        let line_num = line_idx + 1;
        let line_lower = line.to_lowercase();

        for &phrase in BANNED_PHRASES {
            let mut search_from = 0;
            while let Some(byte_pos) = line_lower[search_from..].find(phrase) {
                let actual_pos = search_from + byte_pos;
                let col = line[..actual_pos].chars().count() + 1;
                violations.push(BannedPhraseViolation {
                    phrase: phrase.to_string(),
                    line: line_num,
                    column: col,
                });
                search_from = actual_pos + phrase.len();
            }
        }
    }

    if violations.is_empty() {
        Ok(())
    } else {
        Err(violations)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_text_passes() {
        let input = "# Project Overview\n\nThis system provides static code analysis.\nFiles are parsed into ASTs.\n";
        assert!(check_banned_phrases(input).is_ok());
    }

    #[test]
    fn test_each_banned_phrase_detected() {
        for phrase in BANNED_PHRASES {
            let input = format!("Here we {} when running the code.", phrase);
            let res = check_banned_phrases(&input);
            assert!(res.is_err(), "Expected failure for phrase: {}", phrase);
            let errs = res.unwrap_err();
            assert_eq!(errs.len(), 1);
            assert_eq!(errs[0].phrase, *phrase);
            assert_eq!(errs[0].line, 1);
        }
    }

    #[test]
    fn test_case_insensitivity() {
        let input = "We have a RoBuSt architecture with SeAmLeSs integration.";
        let res = check_banned_phrases(input);
        assert!(res.is_err());
        let errs = res.unwrap_err();
        assert_eq!(errs.len(), 2);
        let phrases: Vec<_> = errs.iter().map(|e| e.phrase.as_str()).collect();
        assert!(phrases.contains(&"robust"));
        assert!(phrases.contains(&"seamless"));
    }

    #[test]
    fn test_line_and_col_reporting() {
        let input = "Line one is fine.\nLine two will dive into details.\nLine three is clean.";
        let res = check_banned_phrases(input);
        assert!(res.is_err());
        let errs = res.unwrap_err();
        assert_eq!(errs.len(), 1);
        assert_eq!(errs[0].phrase, "dive into");
        assert_eq!(errs[0].line, 2);
        assert_eq!(errs[0].column, 15);
    }
}
