pub mod scanner;
pub mod store;
pub mod parser;
pub mod symbols;
pub mod manifest;
pub mod graph;
pub mod vcs;
pub mod arch;
pub mod diagram;
pub mod docs;
pub mod pipeline;
pub mod api;
pub mod database;
pub mod health;

pub fn verify_tree_sitter_compatibility() -> bool {
    let mut parser = tree_sitter::Parser::new();
    let ts_lang = tree_sitter_typescript::language_typescript();
    let tsx_lang = tree_sitter_typescript::language_tsx();
    let py_lang = tree_sitter_python::language();

    parser.set_language(&ts_lang).is_ok()
        && parser.set_language(&tsx_lang).is_ok()
        && parser.set_language(&py_lang).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tree_sitter_grammars_load() {
        assert!(verify_tree_sitter_compatibility());
    }
}
