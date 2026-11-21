use rusqlite::{params, Connection, OptionalExtension, Result};
use serde::{Deserialize, Serialize};

use crate::docs::model::{DocumentSection, DocumentSectionState, DocumentType, GeneratedDocument};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredDocumentRevision {
    pub revision_number: i64,
    pub created_at: String,
    pub content_markdown: String,
}

pub struct DocStore;

impl DocStore {
    pub fn save_document(
        conn: &mut Connection,
        project_id: i64,
        doc: &GeneratedDocument,
    ) -> Result<i64> {
        let tx = conn.transaction()?;

        // 1. Insert or update document
        let doc_id: i64 = tx.query_row(
            "INSERT INTO documents (project_id, doc_type, title, created_at, updated_at)
             VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT(project_id, doc_type) DO UPDATE SET
                 title = excluded.title,
                 updated_at = CURRENT_TIMESTAMP
             RETURNING id",
            params![project_id, doc.doc_type.as_str(), doc.title],
            |row| row.get(0),
        )?;

        // 2. Insert or update sections
        {
            let mut sec_stmt = tx.prepare(
                "INSERT INTO document_sections (
                    document_id, section_key, title, sort_order, content,
                    content_hash, state, generated_at, evidence_keys
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP, ?8)
                ON CONFLICT(document_id, section_key) DO UPDATE SET
                    title = excluded.title,
                    sort_order = excluded.sort_order,
                    content = excluded.content,
                    content_hash = excluded.content_hash,
                    state = excluded.state,
                    generated_at = CURRENT_TIMESTAMP,
                    evidence_keys = excluded.evidence_keys",
            )?;

            for section in &doc.sections {
                let ev_json = serde_json::to_string(&section.evidence_keys)
                    .unwrap_or_else(|_| "[]".to_string());

                sec_stmt.execute(params![
                    doc_id,
                    section.section_key,
                    section.title,
                    section.sort_order,
                    section.content,
                    section.content_hash,
                    section.state.as_str(),
                    ev_json,
                ])?;
            }
        }

        // 3. Create document revision
        let next_rev: i64 = tx.query_row(
            "SELECT COALESCE(MAX(revision_number), 0) + 1 FROM document_revisions WHERE document_id = ?1",
            params![doc_id],
            |row| row.get(0),
        )?;

        let full_md = doc.render_markdown();
        tx.execute(
            "INSERT INTO document_revisions (document_id, revision_number, content_markdown, created_at)
             VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)",
            params![doc_id, next_rev, full_md],
        )?;

        tx.commit()?;
        Ok(doc_id)
    }

    pub fn get_document(
        conn: &Connection,
        project_id: i64,
        doc_type: DocumentType,
    ) -> Result<Option<GeneratedDocument>> {
        let doc_row = conn.query_row(
            "SELECT id, title FROM documents WHERE project_id = ?1 AND doc_type = ?2",
            params![project_id, doc_type.as_str()],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
        );

        let (doc_id, title) = match doc_row {
            Ok(pair) => pair,
            Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
            Err(e) => return Err(e),
        };

        let mut sec_stmt = conn.prepare(
            "SELECT section_key, title, sort_order, content, content_hash, state, evidence_keys
             FROM document_sections
             WHERE document_id = ?1
             ORDER BY sort_order ASC, section_key ASC",
        )?;

        let sec_rows = sec_stmt.query_map(params![doc_id], |row| {
            let section_key: String = row.get(0)?;
            let sec_title: String = row.get(1)?;
            let sort_order: i32 = row.get(2)?;
            let content: String = row.get(3)?;
            let content_hash: String = row.get(4)?;
            let state_str: String = row.get(5)?;
            let ev_json: String = row.get(6)?;

            let state = state_str
                .parse::<DocumentSectionState>()
                .unwrap_or(DocumentSectionState::Generated);
            let evidence_keys: Vec<String> = serde_json::from_str(&ev_json).unwrap_or_default();

            Ok(DocumentSection {
                section_key,
                title: sec_title,
                sort_order,
                content,
                content_hash,
                state,
                evidence_keys,
            })
        })?;

        let mut sections = Vec::new();
        for s in sec_rows {
            sections.push(s?);
        }

        Ok(Some(GeneratedDocument {
            doc_type,
            title,
            sections,
        }))
    }

    pub fn get_latest_revision(
        conn: &Connection,
        document_id: i64,
    ) -> Result<Option<(i64, String)>> {
        let rev_row = conn.query_row(
            "SELECT revision_number, content_markdown 
             FROM document_revisions 
             WHERE document_id = ?1 
             ORDER BY revision_number DESC LIMIT 1",
            params![document_id],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
        );

        match rev_row {
            Ok(res) => Ok(Some(res)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn update_section(
        conn: &mut Connection,
        project_id: i64,
        doc_type: DocumentType,
        section_key: &str,
        content: &str,
    ) -> Result<()> {
        Self::upsert_section(conn, project_id, doc_type, section_key, section_key, content)
    }

    pub fn upsert_section(
        conn: &mut Connection,
        project_id: i64,
        doc_type: DocumentType,
        section_key: &str,
        title: &str,
        content: &str,
    ) -> Result<()> {
        let tx = conn.transaction()?;
        let doc_id: i64 = tx.query_row(
            "INSERT INTO documents (project_id, doc_type, title, created_at, updated_at)
             VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT(project_id, doc_type) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
             RETURNING id",
            params![project_id, doc_type.as_str(), format!("{:?}: {}", doc_type, project_id)],
            |r| r.get(0),
        )?;

        let hash = blake3::hash(content.as_bytes()).to_hex().to_string();
        
        let sort_order: i32 = tx.query_row(
            "SELECT COALESCE(MAX(sort_order), 0) + 10 FROM document_sections WHERE document_id = ?1",
            params![doc_id],
            |r| r.get(0),
        ).unwrap_or(10);

        tx.execute(
            "INSERT INTO document_sections (
                document_id, section_key, title, sort_order, content,
                content_hash, state, generated_at, evidence_keys
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'user_edited', CURRENT_TIMESTAMP, '[]')
             ON CONFLICT(document_id, section_key) DO UPDATE SET
                 title = excluded.title,
                 content = excluded.content,
                 content_hash = excluded.content_hash,
                 state = 'user_edited',
                 generated_at = CURRENT_TIMESTAMP",
            params![doc_id, section_key, title, sort_order, content, hash],
        )?;

        let next_rev: i64 = tx.query_row(
            "SELECT COALESCE(MAX(revision_number), 0) + 1 FROM document_revisions WHERE document_id = ?1",
            params![doc_id],
            |row| row.get(0),
        )?;

        let full_md = {
            let mut sec_stmt = tx.prepare(
                "SELECT content FROM document_sections WHERE document_id = ?1 ORDER BY sort_order ASC, section_key ASC",
            )?;
            let contents: Vec<String> = sec_stmt.query_map(params![doc_id], |r| r.get(0))?.collect::<Result<Vec<_>>>()?;
            contents.join("\n\n---\n\n")
        };

        tx.execute(
            "INSERT INTO document_revisions (document_id, revision_number, content_markdown, created_at)
             VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)",
            params![doc_id, next_rev, full_md],
        )?;

        tx.commit()?;
        Ok(())
    }

    pub fn list_revisions(
        conn: &Connection,
        project_id: i64,
        doc_type: DocumentType,
    ) -> Result<Vec<StoredDocumentRevision>> {
        let doc_id: Option<i64> = conn.query_row(
            "SELECT id FROM documents WHERE project_id = ?1 AND doc_type = ?2",
            params![project_id, doc_type.as_str()],
            |r| r.get(0),
        ).optional()?;

        let Some(doc_id) = doc_id else {
            return Ok(Vec::new());
        };

        let mut stmt = conn.prepare(
            "SELECT revision_number, created_at, content_markdown
             FROM document_revisions
             WHERE document_id = ?1
             ORDER BY revision_number DESC",
        )?;

        let rows = stmt.query_map(params![doc_id], |r| {
            Ok(StoredDocumentRevision {
                revision_number: r.get(0)?,
                created_at: r.get(1)?,
                content_markdown: r.get(2)?,
            })
        })?.collect::<Result<Vec<_>>>()?;

        Ok(rows)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::connection::open_in_memory;
    use crate::store::migrations::run_migrations;

    #[test]
    fn test_doc_store_crud_and_revisions() {
        let mut conn = open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn.execute("INSERT INTO projects (id, name, root_path) VALUES (1, 'p', '/p')", []).unwrap();

        let doc = GeneratedDocument {
            doc_type: DocumentType::ProjectOverview,
            title: "Test Overview".into(),
            sections: vec![
                DocumentSection::new("s1", "Section 1", 10, "Original Content", vec![]),
            ],
        };

        let doc_id = DocStore::save_document(&mut conn, 1, &doc).unwrap();
        assert!(doc_id > 0);

        let fetched = DocStore::get_document(&conn, 1, DocumentType::ProjectOverview).unwrap().unwrap();
        assert_eq!(fetched.title, "Test Overview");
        assert_eq!(fetched.sections.len(), 1);
        assert_eq!(fetched.sections[0].content, "Original Content");
        assert_eq!(fetched.sections[0].state, DocumentSectionState::Generated);

        // Update section
        DocStore::update_section(&mut conn, 1, DocumentType::ProjectOverview, "s1", "Edited Content").unwrap();

        let updated = DocStore::get_document(&conn, 1, DocumentType::ProjectOverview).unwrap().unwrap();
        assert_eq!(updated.sections[0].content, "Edited Content");
        assert_eq!(updated.sections[0].state, DocumentSectionState::UserEdited);

        // List revisions
        let revs = DocStore::list_revisions(&conn, 1, DocumentType::ProjectOverview).unwrap();
        assert_eq!(revs.len(), 2);
        assert_eq!(revs[0].revision_number, 2);
        assert_eq!(revs[1].revision_number, 1);
    }
}
