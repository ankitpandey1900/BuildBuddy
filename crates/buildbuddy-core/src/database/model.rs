use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DatabaseEngine {
    pub name: String,
    pub file_path: String,
    pub line: i64,
    pub snippet: String,
    pub confidence: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DatabaseField {
    pub name: String,
    pub declared_type: String,
    pub is_primary_key: bool,
    pub is_foreign_key: bool,
    pub line: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DatabaseSchema {
    pub table_name: String,
    pub file_path: String,
    pub start_line: i64,
    pub end_line: i64,
    pub snippet: String,
    pub confidence: String,
    pub fields: Vec<DatabaseField>,
}
