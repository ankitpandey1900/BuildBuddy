use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LanguageInfo {
    pub name: &'static str,
    pub category: &'static str,
}

pub fn classify_file(path: &Path) -> Option<LanguageInfo> {
    let file_name = path.file_name()?.to_str()?.to_lowercase();
    
    // Check exact file names first
    match file_name.as_str() {
        "dockerfile" | "containerfile" => return Some(LanguageInfo { name: "Dockerfile", category: "config" }),
        "makefile" | "gnumakefile" => return Some(LanguageInfo { name: "Makefile", category: "config" }),
        "cmakelists.txt" => return Some(LanguageInfo { name: "CMake", category: "config" }),
        "package.json" | "tsconfig.json" | "composer.json" => {
            return Some(LanguageInfo { name: "JSON", category: "data" })
        }
        "cargo.toml" | "pyproject.toml" => return Some(LanguageInfo { name: "TOML", category: "config" }),
        _ => {}
    }

    let ext = path.extension()?.to_str()?.to_lowercase();
    match ext.as_str() {
        "ts" | "mts" | "cts" => Some(LanguageInfo { name: "TypeScript", category: "programming" }),
        "tsx" => Some(LanguageInfo { name: "React (TSX)", category: "programming" }),
        "js" | "mjs" | "cjs" => Some(LanguageInfo { name: "JavaScript", category: "programming" }),
        "jsx" => Some(LanguageInfo { name: "React (JSX)", category: "programming" }),
        "py" | "pyw" | "pyi" => Some(LanguageInfo { name: "Python", category: "programming" }),
        "rs" => Some(LanguageInfo { name: "Rust", category: "programming" }),
        "go" => Some(LanguageInfo { name: "Go", category: "programming" }),
        "java" => Some(LanguageInfo { name: "Java", category: "programming" }),
        "kt" | "kts" => Some(LanguageInfo { name: "Kotlin", category: "programming" }),
        "c" | "h" => Some(LanguageInfo { name: "C", category: "programming" }),
        "cpp" | "cc" | "cxx" | "hpp" | "hh" => Some(LanguageInfo { name: "C++", category: "programming" }),
        "cs" => Some(LanguageInfo { name: "C#", category: "programming" }),
        "php" => Some(LanguageInfo { name: "PHP", category: "programming" }),
        "rb" => Some(LanguageInfo { name: "Ruby", category: "programming" }),
        "swift" => Some(LanguageInfo { name: "Swift", category: "programming" }),
        "sql" => Some(LanguageInfo { name: "SQL", category: "data" }),
        "prisma" => Some(LanguageInfo { name: "Prisma Schema", category: "data" }),
        "json" => Some(LanguageInfo { name: "JSON", category: "data" }),
        "yaml" | "yml" => Some(LanguageInfo { name: "YAML", category: "data" }),
        "toml" => Some(LanguageInfo { name: "TOML", category: "config" }),
        "xml" => Some(LanguageInfo { name: "XML", category: "markup" }),
        "html" | "htm" => Some(LanguageInfo { name: "HTML", category: "markup" }),
        "css" => Some(LanguageInfo { name: "CSS", category: "markup" }),
        "scss" | "sass" => Some(LanguageInfo { name: "SCSS", category: "markup" }),
        "md" | "markdown" => Some(LanguageInfo { name: "Markdown", category: "markup" }),
        "sh" | "bash" | "zsh" => Some(LanguageInfo { name: "Shell", category: "programming" }),
        "bat" | "cmd" | "ps1" => Some(LanguageInfo { name: "PowerShell", category: "programming" }),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_classify_file() {
        assert_eq!(classify_file(&PathBuf::from("src/main.ts")).unwrap().name, "TypeScript");
        assert_eq!(classify_file(&PathBuf::from("src/App.tsx")).unwrap().name, "React (TSX)");
        assert_eq!(classify_file(&PathBuf::from("api/server.py")).unwrap().name, "Python");
        assert_eq!(classify_file(&PathBuf::from("backend/main.rs")).unwrap().name, "Rust");
        assert_eq!(classify_file(&PathBuf::from("package.json")).unwrap().name, "JSON");
        assert_eq!(classify_file(&PathBuf::from("Dockerfile")).unwrap().name, "Dockerfile");
        assert_eq!(classify_file(&PathBuf::from("unknown.xyz")), None);
    }
}

