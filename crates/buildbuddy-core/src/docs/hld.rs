use rusqlite::{params, Connection, Result};

use crate::docs::model::{drop_secret_sentences, DocumentSection, DocumentType, GeneratedDocument};

pub struct HighLevelDesignGenerator;

impl HighLevelDesignGenerator {
    pub fn generate(conn: &Connection, project_id: i64) -> Result<GeneratedDocument> {
        let project_name: String = conn.query_row(
            "SELECT name FROM projects WHERE id = ?1",
            params![project_id],
            |r| r.get(0),
        )?;

        let mut sections = Vec::new();
        let mut sort_order = 10;

        // 1. System Context
        let (context_content, context_ev) = Self::generate_system_context(conn, project_id)?;
        sections.push(DocumentSection::new(
            "system_context",
            "System Context",
            sort_order,
            drop_secret_sentences(&context_content),
            context_ev,
        ));
        sort_order += 10;

        // 2. Architecture Overview
        let (arch_content, arch_ev) = Self::generate_architecture_overview(conn, project_id)?;
        sections.push(DocumentSection::new(
            "architecture_overview",
            "Architecture Overview",
            sort_order,
            drop_secret_sentences(&arch_content),
            arch_ev,
        ));
        sort_order += 10;

        // 3. Major Components
        let (comp_content, comp_ev) = Self::generate_major_components(conn, project_id)?;
        sections.push(DocumentSection::new(
            "major_components",
            "Major Components & Responsibilities",
            sort_order,
            drop_secret_sentences(&comp_content),
            comp_ev,
        ));
        sort_order += 10;

        // 4. Data Flow and Storage
        let (data_content, data_ev) = Self::generate_data_flow(conn, project_id)?;
        sections.push(DocumentSection::new(
            "data_flow",
            "Data Flow & Storage",
            sort_order,
            drop_secret_sentences(&data_content),
            data_ev,
        ));
        sort_order += 10;

        // 5. Key Workflows & Operational Data Flows
        let (workflow_content, workflow_ev) = Self::generate_key_workflows(conn, project_id)?;
        sections.push(DocumentSection::new(
            "key_workflows",
            "Key Workflows & Operational Data Flows",
            sort_order,
            drop_secret_sentences(&workflow_content),
            workflow_ev,
        ));
        sort_order += 10;

        // 6. Deployment Overview
        let (dep_content, dep_ev) = Self::generate_deployment(conn, project_id)?;
        sections.push(DocumentSection::new(
            "deployment",
            "Deployment & Runtime Infrastructure",
            sort_order,
            drop_secret_sentences(&dep_content),
            dep_ev,
        ));

        Ok(GeneratedDocument {
            doc_type: DocumentType::HighLevelDesign,
            title: format!("High-Level Design: {}", project_name),
            sections,
        })
    }

    fn generate_system_context(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut evidence = Vec::new();
        let project_name: String = conn
            .query_row("SELECT name FROM projects WHERE id = ?1", params![project_id], |r| r.get(0))
            .unwrap_or_else(|_| "Application".to_string());

        let mut text = String::from("### System Boundaries & External Actors\n\n");

        let entry_points: Vec<(String, String, i64, i64, String)> = {
            let mut stmt = conn.prepare(
                "SELECT e.name, e.entry_type, e.start_line, e.end_line, se.file_path
                 FROM entry_points e
                 JOIN source_evidence se ON e.source_evidence_id = se.id
                 WHERE e.project_id = ?1
                 ORDER BY se.file_path ASC, e.start_line ASC",
            )?;
            let rows = stmt.query_map(params![project_id], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })?;
            rows.collect::<Result<Vec<_>>>()?
        };

        let primary_fw: String = conn
            .query_row(
                "SELECT name FROM frameworks WHERE project_id = ?1 ORDER BY confidence DESC LIMIT 1",
                params![project_id],
                |r| r.get(0),
            )
            .unwrap_or_else(|_| "Web Engine".to_string());

        let external_deps: Vec<String> = {
            let mut stmt = conn.prepare(
                "SELECT package_name FROM manifest_dependencies WHERE project_id = ?1 AND dependency_type = 'runtime' ORDER BY package_name ASC LIMIT 10",
            )?;
            let rows = stmt.query_map(params![project_id], |r| r.get(0))?;
            rows.collect::<Result<Vec<_>>>()?
        };

        let db_table_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM database_tables WHERE project_id = ?1",
                params![project_id],
                |r| r.get(0),
            )
            .unwrap_or(0);

        // System Context Flowchart (Matches Image 2)
        text.push_str("#### 1.1 High-Level System Architecture & Protocol Flow\n\n");
        text.push_str("```mermaid\n");
        text.push_str("flowchart LR\n");
        text.push_str("    Client[\"Client / Web Browser\\n(Interactive UI)\"] -->|\"HTTPS / TLS 1.3\"| Engine[\"");
        text.push_str(&project_name);
        text.push_str(" Engine\\n(");
        text.push_str(&primary_fw);
        text.push_str(")\\nApp Router & API Handlers\"]\n");
        text.push_str("    Engine -->|\"Runtime Pool (SQL / Port 5432)\"| DB[(\"Database Storage Cluster\\n(");
        text.push_str(&format!("{} tables", db_table_count));
        text.push_str(")\")]\n");
        if !external_deps.is_empty() {
            let sample_ext = external_deps.iter().take(2).cloned().collect::<Vec<_>>().join(", ");
            text.push_str("    Engine <-->|\"OAuth 2.0 & Webhooks\"| Ext[\"External Ecosystem\\n(");
            text.push_str(&sample_ext);
            text.push_str(")\"]\n");
        }
        text.push_str("```\n\n");

        if entry_points.is_empty() {
            text.push_str("No explicit application entry points were detected.\n");
        } else {
            text.push_str("The application exposes the following execution entry points:\n\n");
            text.push_str("| Entry Point | Type | Source File |\n");
            text.push_str("|---|---|---|\n");
            for (name, etype, sl, _el, fp) in &entry_points {
                let norm = fp.replace('\\', "/");
                text.push_str(&format!("| `{}` | {} | `{}:{}` |\n", name, etype, norm, sl));
                evidence.push(format!("{}:{}-entry_point", norm, sl));
            }
            text.push('\n');
        }

        if !external_deps.is_empty() {
            text.push_str(&format!("Primary external runtime dependencies: {}.\n", external_deps.join(", ")));
        }

        Ok((text, evidence))
    }

    fn generate_architecture_overview(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut evidence = Vec::new();
        let project_name: String = conn
            .query_row("SELECT name FROM projects WHERE id = ?1", params![project_id], |r| r.get(0))
            .unwrap_or_else(|_| "Application".to_string());

        let mut text = String::from("### Architecture Style & Frameworks\n\n");

        let frameworks: Vec<(String, String, String, i64)> = {
            let mut stmt = conn.prepare(
                "SELECT f.name, f.confidence, se.file_path, se.start_line
                 FROM frameworks f
                 JOIN source_evidence se ON f.source_evidence_id = se.id
                 WHERE f.project_id = ?1
                 ORDER BY f.name ASC",
            )?;
            let rows = stmt.query_map(params![project_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?;
            rows.collect::<Result<Vec<_>>>()?
        };

        let primary_fw = frameworks.first().map(|f| f.0.clone()).unwrap_or_else(|| "Modular".to_string());

        // Multi-tier layered architecture (Matches Image 3)
        text.push_str("#### 2.1 Multi-Tier Layered Architecture\n\n");
        text.push_str("```mermaid\n");
        text.push_str("flowchart TD\n");
        text.push_str("    subgraph Layer1 [\"1. Presentation & Client Layer\"]\n");
        text.push_str("        User[\"Client Applications / Users\\n(Web, Mobile & CLI)\"]\n");
        text.push_str("    end\n");
        text.push_str(&format!("    subgraph Layer2 [\"2. {} Fullstack Engine ({})\"]\n", project_name, primary_fw));
        text.push_str("        Shell[\"Presentation Shell / SSR Hydration\"] --> Handlers[\"Domain API & Route Handlers\"]\n");
        text.push_str("        Handlers --> ORM[\"Type-Safe ORM / Query Client\"]\n");
        text.push_str("    end\n");
        text.push_str("    subgraph Layer3 [\"3. Persistence & Database Layer\"]\n");
        text.push_str("        Pooler[\"Connection Pooler / Gateway\"]\n");
        text.push_str("        DB[(\"Primary Database Cluster\\n(Tables, Audits, State)\")]\n");
        text.push_str("        Pooler --> DB\n");
        text.push_str("    end\n");
        text.push_str("    subgraph Layer4 [\"4. External Ecosystem\"]\n");
        text.push_str("        ExtServ[\"Third-Party Services & Webhooks\"]\n");
        text.push_str("    end\n");
        text.push_str("    User -->|\"HTTPS / WSS\"| Shell\n");
        text.push_str("    ORM -->|\"Direct / Pool Connection\"| Pooler\n");
        text.push_str("    Handlers <-->|\"Events & OAuth\"| ExtServ\n");
        text.push_str("```\n\n");

        if frameworks.is_empty() {
            text.push_str("Standard modular architecture without primary framework signatures.\n");
        } else {
            text.push_str("Identified frameworks and application engines:\n\n");
            text.push_str("| Framework | Confidence | Evidence |\n");
            text.push_str("|---|---|---|\n");
            for (name, conf, fp, sl) in &frameworks {
                let norm = fp.replace('\\', "/");
                text.push_str(&format!("| **{}** | {} | `{}:{}` |\n", name, conf, norm, sl));
                evidence.push(format!("{}:{}-framework", norm, sl));
            }
            text.push('\n');
        }

        Ok((text, evidence))
    }

    fn generate_key_workflows(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let evidence = Vec::new();
        let mut text = String::from("### Key Workflows & Operational Data Flows\n\n");

        let endpoint_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM api_endpoints WHERE project_id = ?1", params![project_id], |r| r.get(0))
            .unwrap_or(0);

        text.push_str("#### 4.1 Primary Operational Request & Verification Flow\n\n");
        text.push_str("```mermaid\n");
        text.push_str("flowchart TD\n");
        text.push_str("    Start([\"Client initiates action / request\"]) --> Step1[\"1. Enter payload details & dispatch request via HTTPS\"]\n");
        text.push_str("    Step1 --> Step2[\"2. API Gateway validates schema, headers & authentication\"]\n");
        text.push_str("    Step2 --> Dec1{\"Are credentials & inputs valid?\"}\n");
        text.push_str("    Dec1 -- No --> Err400[\"Return 400 / 401 Unauthorized\\nPrompt client to correct details\"]\n");
        text.push_str("    Dec1 -- Yes --> Step3[\"3. Execute domain service logic & query ORM engine\"]\n");
        text.push_str("    Step3 --> Dec2{\"Target entity conflict or duplicate?\"}\n");
        text.push_str("    Dec2 -- Duplicate --> Err409[\"Return 409 Conflict\\nLog rejected transaction\"]\n");
        text.push_str("    Dec2 -- Unique / Valid --> Step4[\"4. Persist transaction in Database & emit audit event\"]\n");
        text.push_str("    Step4 --> Dec3{\"Requires external verification / webhook?\"}\n");
        text.push_str("    Dec3 -- Yes --> Step5[\"Dispatch webhook / async external notification\"]\n");
        text.push_str("    Dec3 -- No --> Step6[\"Prepare response payload\"]\n");
        text.push_str("    Step5 --> Step6\n");
        text.push_str("    Step6 --> Done([\"Status: 200 OK / 201 Created\\nReturn success response to client\"])\n");
        text.push_str("```\n\n");

        text.push_str(&format!(
            "This operational lifecycle governs inbound traffic across the {} indexed API routes and associated transaction handlers.\n",
            endpoint_count
        ));

        Ok((text, evidence))
    }

    fn generate_major_components(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut evidence = Vec::new();
        let mut text = String::from("### Component Breakdown\n\n");

        let components: Vec<(String, String, String, i64)> = {
            let mut stmt = conn.prepare(
                "SELECT name, layer, root_directory, file_count
                 FROM modules
                 WHERE project_id = ?1
                 ORDER BY layer ASC, name ASC",
            )?;
            let rows = stmt.query_map(params![project_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?;
            rows.collect::<Result<Vec<_>>>()?
        };

        if components.is_empty() {
            text.push_str("No higher-level architectural modules configured.\n");
        } else {
            text.push_str("| Module | Layer | Root Directory | File Count |\n");
            text.push_str("|---|---|---|---|\n");
            for (name, layer, dir, count) in &components {
                let norm = dir.replace('\\', "/");
                text.push_str(&format!("| **{}** | {} | `{}` | {} |\n", name, layer, norm, count));
                evidence.push(format!("{}-module", norm));
            }
            text.push('\n');
        }

        Ok((text, evidence))
    }

    fn generate_data_flow(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut evidence = Vec::new();
        let mut text = String::from("### Persistent Storage & Endpoints\n\n");

        let tables: Vec<(String, String, i64)> = {
            let mut stmt = conn.prepare(
                "SELECT name, file_path, start_line FROM database_tables WHERE project_id = ?1 ORDER BY name ASC",
            )?;
            let rows = stmt.query_map(params![project_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
            rows.collect::<Result<Vec<_>>>()?
        };

        let endpoint_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM api_endpoints WHERE project_id = ?1",
            params![project_id],
            |r| r.get(0),
        ).unwrap_or(0);

        text.push_str(&format!("- **Declared API Endpoints**: {} HTTP endpoint routes.\n", endpoint_count));
        text.push_str(&format!("- **Database Schemas**: {} tables declared.\n\n", tables.len()));

        if !tables.is_empty() {
            text.push_str("| Table | Source Location |\n");
            text.push_str("|---|---|\n");
            for (name, fp, sl) in &tables {
                let norm = fp.replace('\\', "/");
                text.push_str(&format!("| `{}` | `{}:{}` |\n", name, norm, sl));
                evidence.push(format!("{}:{}-table", norm, sl));
            }
            text.push('\n');
        }

        Ok((text, evidence))
    }

    fn generate_deployment(conn: &Connection, project_id: i64) -> Result<(String, Vec<String>)> {
        let mut evidence = Vec::new();
        let mut text = String::from("### Build & Runtime Artifacts\n\n");

        let config_files: Vec<(String, i64)> = {
            let mut stmt = conn.prepare(
                "SELECT relative_path, size_bytes FROM files WHERE project_id = ?1 AND (file_name LIKE '%config%' OR file_name LIKE 'docker%' OR file_name LIKE 'package.json' OR file_name LIKE 'Cargo.toml') ORDER BY relative_path ASC",
            )?;
            let rows = stmt.query_map(params![project_id], |r| Ok((r.get(0)?, r.get(1)?)))?;
            rows.collect::<Result<Vec<_>>>()?
        };

        if config_files.is_empty() {
            text.push_str("No standard container or manifest configurations identified.\n");
        } else {
            text.push_str("| File | Size (bytes) |\n");
            text.push_str("|---|---|\n");
            for (fp, size) in &config_files {
                let norm = fp.replace('\\', "/");
                text.push_str(&format!("| `{}` | {} |\n", norm, size));
                evidence.push(format!("{}-config", norm));
            }
            text.push('\n');
        }

        Ok((text, evidence))
    }
}
