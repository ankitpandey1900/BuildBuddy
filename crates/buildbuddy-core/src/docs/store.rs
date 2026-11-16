use rusqlite::{params, Connection, Result};

use crate::docs::model::{DocumentSection, DocumentSectionState, DocumentType, GeneratedDocument};

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
}
