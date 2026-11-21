use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApiEndpoint {
    pub framework: String,
    pub method: String,
    pub route: String,
    pub controller_name: Option<String>,
    pub file_path: String,
    pub start_line: i64,
    pub end_line: i64,
    pub snippet: String,
    pub confidence: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClientApiCall {
    pub caller_file: String,
    pub line_number: i64,
    pub route: String,
    pub method: Option<String>,
    pub snippet: String,
}
