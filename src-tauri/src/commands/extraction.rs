//! Custom extraction rule commands.

use crate::core::storage::db;
use crate::core::crawler::models::CustomExtractionRule;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExtractionRule {
    pub id: i64,
    pub crawl_id: i64,
    pub name: String,
    pub selector: String,
    pub rule_type: String,
    pub attribute: Option<String>,
    pub active: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateExtractionRuleInput {
    pub crawl_id: i64,
    pub name: String,
    pub selector: String,
    pub rule_type: String,
    pub attribute: Option<String>,
    pub active: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateExtractionRuleInput {
    pub name: Option<String>,
    pub selector: Option<String>,
    pub rule_type: Option<String>,
    pub attribute: Option<String>,
    pub active: Option<bool>,
}

#[tauri::command]
pub fn list_extraction_rules(crawl_id: i64) -> Result<Vec<ExtractionRule>, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    list_rules(&conn, crawl_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_extraction_rule(input: CreateExtractionRuleInput) -> Result<ExtractionRule, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    create_rule(&conn, input)
}

#[tauri::command]
pub fn update_extraction_rule(
    id: i64,
    input: UpdateExtractionRuleInput,
) -> Result<ExtractionRule, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    update_rule(&conn, id, input)
}

#[tauri::command]
pub fn delete_extraction_rule(id: i64) -> Result<(), String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let changed = conn
        .execute("DELETE FROM extraction_rules WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("Extraction rule not found".to_string());
    }
    Ok(())
}

fn list_rules(conn: &Connection, crawl_id: i64) -> rusqlite::Result<Vec<ExtractionRule>> {
    let mut stmt = conn.prepare(
        "SELECT id, crawl_id, name, selector, rule_type, attribute, active, created_at, updated_at
         FROM extraction_rules
         WHERE crawl_id = ?1
         ORDER BY active DESC, created_at DESC, id DESC",
    )?;
    let rows = stmt.query_map(params![crawl_id], map_rule_row)?;
    rows.collect()
}

pub fn list_active_custom_extraction_rules(
    conn: &Connection,
    crawl_id: i64,
) -> rusqlite::Result<Vec<CustomExtractionRule>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, selector, rule_type, attribute
         FROM extraction_rules
         WHERE crawl_id = ?1 AND active = 1
         ORDER BY id ASC",
    )?;
    let rows = stmt.query_map(params![crawl_id], |row| {
        Ok(CustomExtractionRule {
            id: row.get("id")?,
            name: row.get("name")?,
            selector: row.get("selector")?,
            rule_type: row.get("rule_type")?,
            attribute: row.get("attribute")?,
        })
    })?;
    rows.collect()
}

pub fn copy_latest_project_rules_to_crawl(
    conn: &Connection,
    project_id: i64,
    crawl_id: i64,
) -> rusqlite::Result<usize> {
    conn.execute(
        "INSERT INTO extraction_rules (crawl_id, name, selector, rule_type, attribute, active, created_at, updated_at)
         SELECT ?2, er.name, er.selector, er.rule_type, er.attribute, er.active, datetime('now'), datetime('now')
         FROM extraction_rules er
         WHERE er.active = 1
           AND er.crawl_id = (
               SELECT c.id
               FROM crawls c
               JOIN extraction_rules source_rules ON source_rules.crawl_id = c.id
               WHERE c.project_id = ?1 AND c.id <> ?2
               ORDER BY COALESCE(c.completed_at, c.started_at, c.created_at) DESC, c.id DESC
               LIMIT 1
           )
           AND NOT EXISTS (SELECT 1 FROM extraction_rules existing WHERE existing.crawl_id = ?2)",
        params![project_id, crawl_id],
    )
}

fn create_rule(
    conn: &Connection,
    input: CreateExtractionRuleInput,
) -> Result<ExtractionRule, String> {
    let name = validate_required("Rule name", input.name)?;
    let selector = validate_required("Selector / pattern", input.selector)?;
    let rule_type = validate_rule_type(input.rule_type)?;
    let attribute = normalize_optional(input.attribute);
    let active = if input.active.unwrap_or(true) { 1 } else { 0 };

    conn.execute(
        "INSERT INTO extraction_rules (crawl_id, name, selector, rule_type, attribute, active, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
        params![input.crawl_id, name, selector, rule_type, attribute, active],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    get_rule(conn, id)?.ok_or_else(|| "Created extraction rule could not be loaded".to_string())
}

fn update_rule(
    conn: &Connection,
    id: i64,
    input: UpdateExtractionRuleInput,
) -> Result<ExtractionRule, String> {
    let mut existing =
        get_rule(conn, id)?.ok_or_else(|| "Extraction rule not found".to_string())?;

    if let Some(name) = input.name {
        existing.name = validate_required("Rule name", name)?;
    }
    if let Some(selector) = input.selector {
        existing.selector = validate_required("Selector / pattern", selector)?;
    }
    if let Some(rule_type) = input.rule_type {
        existing.rule_type = validate_rule_type(rule_type)?;
    }
    if input.attribute.is_some() {
        existing.attribute = normalize_optional(input.attribute);
    }
    if let Some(active) = input.active {
        existing.active = if active { 1 } else { 0 };
    }

    conn.execute(
        "UPDATE extraction_rules
         SET name = ?1, selector = ?2, rule_type = ?3, attribute = ?4, active = ?5, updated_at = datetime('now')
         WHERE id = ?6",
        params![
            existing.name,
            existing.selector,
            existing.rule_type,
            existing.attribute,
            existing.active,
            id
        ],
    )
    .map_err(|e| e.to_string())?;

    get_rule(conn, id)?.ok_or_else(|| "Updated extraction rule could not be loaded".to_string())
}

fn get_rule(conn: &Connection, id: i64) -> Result<Option<ExtractionRule>, String> {
    conn.query_row(
        "SELECT id, crawl_id, name, selector, rule_type, attribute, active, created_at, updated_at
         FROM extraction_rules
         WHERE id = ?1",
        params![id],
        map_rule_row,
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn map_rule_row(row: &rusqlite::Row) -> rusqlite::Result<ExtractionRule> {
    Ok(ExtractionRule {
        id: row.get("id")?,
        crawl_id: row.get("crawl_id")?,
        name: row.get("name")?,
        selector: row.get("selector")?,
        rule_type: row.get("rule_type")?,
        attribute: row.get("attribute")?,
        active: row.get("active")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn validate_required(field: &str, value: String) -> Result<String, String> {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        Err(format!("{} is required", field))
    } else {
        Ok(trimmed)
    }
}

fn validate_rule_type(value: String) -> Result<String, String> {
    let normalized = value.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "css" | "xpath" | "regex" => Ok(normalized),
        _ => Err("Rule type must be css, xpath, or regex".to_string()),
    }
}

fn normalize_optional(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::storage::db;

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch("PRAGMA foreign_keys = ON;")
            .expect("enable foreign keys");
        db::test_run_migrations(&conn).expect("run production migrations");
        conn.execute(
            "INSERT INTO projects (id, name, root_url) VALUES (1, 'Test', 'https://example.com')",
            [],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO crawls (id, project_id, status) VALUES (7, 1, 'completed')",
            [],
        )
        .expect("insert crawl");
        conn
    }

    #[test]
    fn create_list_update_delete_extraction_rule() {
        let conn = setup_conn();

        let created = create_rule(
            &conn,
            CreateExtractionRuleInput {
                crawl_id: 7,
                name: " Meta description ".to_string(),
                selector: " meta[name=\"description\"] ".to_string(),
                rule_type: "CSS".to_string(),
                attribute: Some(" content ".to_string()),
                active: Some(true),
            },
        )
        .expect("create rule");

        assert_eq!(created.crawl_id, 7);
        assert_eq!(created.name, "Meta description");
        assert_eq!(created.selector, "meta[name=\"description\"]");
        assert_eq!(created.rule_type, "css");
        assert_eq!(created.attribute.as_deref(), Some("content"));
        assert_eq!(created.active, 1);

        let listed = list_rules(&conn, 7).expect("list rules");
        assert_eq!(listed, vec![created.clone()]);

        let updated = update_rule(
            &conn,
            created.id,
            UpdateExtractionRuleInput {
                name: Some("Hero H1".to_string()),
                selector: Some("h1".to_string()),
                rule_type: Some("xpath".to_string()),
                attribute: Some("".to_string()),
                active: Some(false),
            },
        )
        .expect("update rule");

        assert_eq!(updated.name, "Hero H1");
        assert_eq!(updated.rule_type, "xpath");
        assert_eq!(updated.attribute, None);
        assert_eq!(updated.active, 0);

        delete_extraction_rule_for_test(&conn, updated.id).expect("delete rule");
        assert!(list_rules(&conn, 7).expect("list rules").is_empty());
    }

    #[test]
    fn rejects_invalid_rule_type() {
        let conn = setup_conn();
        let err = create_rule(
            &conn,
            CreateExtractionRuleInput {
                crawl_id: 7,
                name: "Bad".to_string(),
                selector: "h1".to_string(),
                rule_type: "javascript".to_string(),
                attribute: None,
                active: None,
            },
        )
        .expect_err("invalid type should fail");

        assert!(err.contains("css, xpath, or regex"));
    }

    #[test]
    fn crawl_delete_cascades_extraction_rules() {
        let conn = setup_conn();
        let created = create_rule(
            &conn,
            CreateExtractionRuleInput {
                crawl_id: 7,
                name: "Title".to_string(),
                selector: "title".to_string(),
                rule_type: "css".to_string(),
                attribute: None,
                active: None,
            },
        )
        .expect("create rule");

        conn.execute("DELETE FROM crawls WHERE id = 7", [])
            .expect("delete crawl");

        assert!(get_rule(&conn, created.id).expect("load rule").is_none());
    }

    #[test]
    fn active_rules_can_be_copied_to_next_project_crawl() {
        let conn = setup_conn();
        let created = create_rule(
            &conn,
            CreateExtractionRuleInput {
                crawl_id: 7,
                name: "Hero".to_string(),
                selector: "h1".to_string(),
                rule_type: "css".to_string(),
                attribute: None,
                active: Some(true),
            },
        )
        .expect("create active rule");
        create_rule(
            &conn,
            CreateExtractionRuleInput {
                crawl_id: 7,
                name: "Disabled".to_string(),
                selector: ".disabled".to_string(),
                rule_type: "css".to_string(),
                attribute: None,
                active: Some(false),
            },
        )
        .expect("create inactive rule");
        conn.execute(
            "INSERT INTO crawls (id, project_id, status, created_at) VALUES (8, 1, 'created', datetime('now'))",
            [],
        )
        .expect("insert next crawl");

        let copied = copy_latest_project_rules_to_crawl(&conn, 1, 8).expect("copy rules");
        assert_eq!(copied, 1);

        let active = list_active_custom_extraction_rules(&conn, 8).expect("list active rules");
        assert_eq!(active.len(), 1);
        assert_ne!(active[0].id, created.id);
        assert_eq!(active[0].name, "Hero");
        assert_eq!(active[0].selector, "h1");

        let second_copy = copy_latest_project_rules_to_crawl(&conn, 1, 8).expect("copy no-op");
        assert_eq!(second_copy, 0);
    }

    fn delete_extraction_rule_for_test(conn: &Connection, id: i64) -> Result<(), String> {
        let changed = conn
            .execute("DELETE FROM extraction_rules WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err("Extraction rule not found".to_string());
        }
        Ok(())
    }
}
