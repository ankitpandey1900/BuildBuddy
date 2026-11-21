use super::{DatabaseEngine, DatabaseField, DatabaseSchema};

pub struct DatabaseExtractor;

impl DatabaseExtractor {
    pub fn extract(files: &[(String, &str)]) -> (Vec<DatabaseEngine>, Vec<DatabaseSchema>) {
        let mut engines = Vec::new();
        let mut schemas = Vec::new();
        for (path, content) in files {
            // Check raw sql engine mentions
            for (index, line) in content.lines().enumerate() {
                let lower = line.to_ascii_lowercase();
                for (needle, name) in [("sqlite", "SQLite"), ("postgres", "PostgreSQL"), ("mysql", "MySQL")] {
                    if lower.contains(needle) {
                        engines.push(DatabaseEngine { name: name.into(), file_path: path.clone(), line: (index + 1) as i64, snippet: line.trim().into(), confidence: "static".into() });
                        break;
                    }
                }
            }
            schemas.extend(Self::extract_sql(path, content));
            Self::extract_prisma(path, content, &mut engines, &mut schemas);
        }
        engines.sort_by(|a, b| (&a.file_path, a.line, &a.name).cmp(&(&b.file_path, b.line, &b.name)));
        engines.dedup_by(|a, b| a.file_path == b.file_path && a.line == b.line && a.name == b.name);
        schemas.sort_by(|a, b| (&a.file_path, a.start_line, &a.table_name).cmp(&(&b.file_path, b.start_line, &b.table_name)));
        (engines, schemas)
    }

    fn extract_prisma(
        path: &str,
        content: &str,
        engines: &mut Vec<DatabaseEngine>,
        schemas: &mut Vec<DatabaseSchema>,
    ) {
        if !path.ends_with(".prisma") { return; }

        let lines: Vec<&str> = content.lines().collect();
        let mut index = 0;

        while index < lines.len() {
            let trimmed = lines[index].trim();

            if trimmed.starts_with("datasource") {
                index += 1;
                while index < lines.len() {
                    let ds_line = lines[index].trim();
                    if ds_line.contains('}') { break; }
                    if ds_line.starts_with("provider") {
                        let lower = ds_line.to_ascii_lowercase();
                        let name = if lower.contains("postgres") {
                            "PostgreSQL"
                        } else if lower.contains("mysql") {
                            "MySQL"
                        } else if lower.contains("sqlite") {
                            "SQLite"
                        } else if lower.contains("mongo") {
                            "MongoDB"
                        } else if lower.contains("sqlserver") {
                            "SQL Server"
                        } else {
                            "Relational Database"
                        };
                        engines.push(DatabaseEngine {
                            name: name.into(),
                            file_path: path.into(),
                            line: (index + 1) as i64,
                            snippet: ds_line.into(),
                            confidence: "confirmed".into(),
                        });
                    }
                    index += 1;
                }
            } else if trimmed.starts_with("model ") {
                let model_name: String = trimmed["model ".len()..]
                    .trim_start()
                    .chars()
                    .take_while(|c| c.is_ascii_alphanumeric() || *c == '_')
                    .collect();

                if !model_name.is_empty() {
                    let start = index;
                    let mut fields = Vec::new();
                    index += 1;

                    while index < lines.len() {
                        let field_line = lines[index].trim();
                        if field_line.starts_with('}') { break; }

                        if !field_line.is_empty()
                            && !field_line.starts_with("//")
                            && !field_line.starts_with("@@")
                        {
                            let mut parts = field_line.split_whitespace();
                            if let (Some(field_name), Some(field_type)) = (parts.next(), parts.next()) {
                                if !field_name.starts_with("//") {
                                    fields.push(DatabaseField {
                                        name: field_name.into(),
                                        declared_type: field_type.into(),
                                        is_primary_key: field_line.contains("@id"),
                                        is_foreign_key: field_line.contains("@relation"),
                                        line: (index + 1) as i64,
                                    });
                                }
                            }
                        }
                        index += 1;
                    }

                    let end = index.min(lines.len().saturating_sub(1));
                    schemas.push(DatabaseSchema {
                        table_name: model_name,
                        file_path: path.into(),
                        start_line: (start + 1) as i64,
                        end_line: (end + 1) as i64,
                        snippet: lines[start..=end].join("\n"),
                        confidence: "confirmed".into(),
                        fields,
                    });
                }
            }
            index += 1;
        }
    }

    fn extract_sql(path: &str, content: &str) -> Vec<DatabaseSchema> {
        let lines: Vec<&str> = content.lines().collect();
        let mut schemas = Vec::new();
        let mut index = 0;
        while index < lines.len() {
            let trimmed = lines[index].trim();
            let upper = trimmed.to_ascii_uppercase();
            if !upper.starts_with("CREATE TABLE") { index += 1; continue; }
            let rest = trimmed["CREATE TABLE".len()..].trim_start();
            let rest = rest.strip_prefix("IF NOT EXISTS").unwrap_or(rest).trim_start();
            let table_name: String = rest.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '"' || *c == '`').collect();
            if table_name.is_empty() { index += 1; continue; }
            let start = index;
            let mut fields = Vec::new();
            index += 1;
            while index < lines.len() {
                let field_line = lines[index].trim().trim_end_matches(',').trim();
                if field_line.contains(");") || field_line == ")" { break; }
                let upper_field = field_line.to_ascii_uppercase();
                if !field_line.is_empty() && !upper_field.starts_with("PRIMARY KEY") && !upper_field.starts_with("FOREIGN KEY") && !upper_field.starts_with("CONSTRAINT") {
                    let mut parts = field_line.split_whitespace();
                    if let (Some(name), Some(declared_type)) = (parts.next(), parts.next()) {
                        fields.push(DatabaseField { name: name.trim_matches(|c| c == '"' || c == '`').into(), declared_type: declared_type.into(), is_primary_key: upper_field.contains("PRIMARY KEY"), is_foreign_key: upper_field.contains("REFERENCES"), line: (index + 1) as i64 });
                    }
                }
                index += 1;
            }
            let end = index.min(lines.len().saturating_sub(1));
            schemas.push(DatabaseSchema { table_name: table_name.trim_matches(|c| c == '"' || c == '`').into(), file_path: path.into(), start_line: (start + 1) as i64, end_line: (end + 1) as i64, snippet: lines[start..=end].join("\n"), confidence: "static".into(), fields });
            index += 1;
        }
        schemas
    }
}

#[cfg(test)]
mod tests {
    use super::DatabaseExtractor;

    #[test]
    fn extracts_explicit_schema_and_declared_engine() {
        let (_, schemas) = DatabaseExtractor::extract(&[("schema.sql".into(), "CREATE TABLE users (\n id INTEGER PRIMARY KEY,\n team_id INTEGER REFERENCES teams(id),\n email TEXT\n);" )]);
        assert_eq!(schemas[0].table_name, "users");
        assert_eq!(schemas[0].fields.len(), 3);
        assert!(schemas[0].fields[0].is_primary_key);
        assert!(schemas[0].fields[1].is_foreign_key);
    }

    #[test]
    fn extracts_prisma_schema_and_models() {
        let prisma_content = r#"
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Strike {
  id          String   @id @default(cuid())
  title       String
  targetUrl   String
  authorId    String
  author      User     @relation(fields: [authorId], references: [id])
  createdAt   DateTime @default(now())
}

model User {
  id        String   @id
  email     String   @unique
  strikes   Strike[]
}
"#;
        let (engines, schemas) = DatabaseExtractor::extract(&[("packages/db/prisma/schema.prisma".into(), prisma_content)]);
        assert_eq!(engines.len(), 1);
        assert_eq!(engines[0].name, "PostgreSQL");
        assert_eq!(schemas.len(), 2);

        let strike_model = schemas.iter().find(|s| s.table_name == "Strike").unwrap();
        assert_eq!(strike_model.fields.len(), 6);
        assert!(strike_model.fields[0].is_primary_key);
        assert!(strike_model.fields[4].is_foreign_key);

        let user_model = schemas.iter().find(|s| s.table_name == "User").unwrap();
        assert_eq!(user_model.table_name, "User");
        assert!(user_model.fields[0].is_primary_key);
    }
}
