pub mod dependencies;
pub mod lint;
pub mod model;
pub mod overview;
pub mod hld;
pub mod lld;
pub mod api_docs;
pub mod database_docs;
pub mod adrs;
pub mod security_report;
pub mod tech_debt_report;
pub mod store;

pub use dependencies::{DependencyInventoryGenerator, TOOLING_PACKAGES};
pub use lint::{check_banned_phrases, BannedPhraseViolation, BANNED_PHRASES};
pub use model::{
    drop_secret_sentences, sentence_contains_secret, split_into_sentences, DocumentSection,
    DocumentSectionState, DocumentType, GeneratedDocument,
};
pub use overview::ProjectOverviewGenerator;
pub use hld::HighLevelDesignGenerator;
pub use lld::LowLevelDesignGenerator;
pub use api_docs::ApiDocGenerator;
pub use database_docs::DatabaseDocGenerator;
pub use adrs::AdrGenerator;
pub use security_report::SecurityReportGenerator;
pub use tech_debt_report::TechDebtReportGenerator;
pub use store::DocStore;

use rusqlite::{Connection, Result};

pub fn generate_document_by_type(
    conn: &Connection,
    project_id: i64,
    doc_type: DocumentType,
) -> Result<GeneratedDocument> {
    match doc_type {
        DocumentType::ProjectOverview => ProjectOverviewGenerator::generate(conn, project_id),
        DocumentType::HighLevelDesign => HighLevelDesignGenerator::generate(conn, project_id),
        DocumentType::LowLevelDesign => LowLevelDesignGenerator::generate(conn, project_id),
        DocumentType::ApiDocumentation => ApiDocGenerator::generate(conn, project_id),
        DocumentType::DatabaseDocumentation => DatabaseDocGenerator::generate(conn, project_id),
        DocumentType::DependencyInventory => DependencyInventoryGenerator::generate(conn, project_id),
        DocumentType::ArchitectureDecisionRecords => AdrGenerator::generate(conn, project_id),
        DocumentType::SecurityReport => SecurityReportGenerator::generate(conn, project_id),
        DocumentType::TechnicalDebtReport => TechDebtReportGenerator::generate(conn, project_id),
    }
}
