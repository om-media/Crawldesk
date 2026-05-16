//! Crawl schedule commands.

use crate::core::storage::db;
use chrono::{DateTime, Datelike, Duration, Timelike, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CrawlSchedule {
    pub id: i64,
    pub project_id: i64,
    pub start_url: String,
    pub crawl_settings_json: String,
    pub cron_expression: String,
    pub enabled: i64,
    pub last_run_at: Option<String>,
    pub next_run_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCrawlScheduleInput {
    pub project_id: i64,
    pub start_url: String,
    pub crawl_settings_json: Option<String>,
    pub cron_expression: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCrawlScheduleInput {
    pub enabled: Option<bool>,
    pub cron_expression: Option<String>,
}

#[tauri::command]
pub fn list_crawl_schedules(project_id: i64) -> Result<Vec<CrawlSchedule>, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    list_schedules(&conn, project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_crawl_schedule(input: CreateCrawlScheduleInput) -> Result<CrawlSchedule, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    create_schedule(&conn, input)
}

#[tauri::command]
pub fn update_crawl_schedule(
    id: i64,
    input: UpdateCrawlScheduleInput,
) -> Result<CrawlSchedule, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    update_schedule(&conn, id, input)
}

#[tauri::command]
pub fn delete_crawl_schedule(id: i64) -> Result<(), String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let changed = conn
        .execute("DELETE FROM crawl_schedules WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("Crawl schedule not found".to_string());
    }
    Ok(())
}

fn list_schedules(conn: &Connection, project_id: i64) -> rusqlite::Result<Vec<CrawlSchedule>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, start_url, crawl_settings_json, cron_expression, enabled,
                last_run_at, next_run_at, created_at, updated_at
         FROM crawl_schedules
         WHERE project_id = ?1
         ORDER BY enabled DESC, next_run_at IS NULL, next_run_at ASC, created_at DESC",
    )?;
    let rows = stmt.query_map(params![project_id], map_schedule_row)?;
    rows.collect()
}

fn create_schedule(
    conn: &Connection,
    input: CreateCrawlScheduleInput,
) -> Result<CrawlSchedule, String> {
    ensure_project_exists(conn, input.project_id)?;
    let start_url = validate_required("Start URL", input.start_url)?;
    let cron_expression = validate_cron_expression(input.cron_expression)?;
    let crawl_settings_json = input
        .crawl_settings_json
        .unwrap_or_else(|| "{}".to_string());
    validate_json_object(&crawl_settings_json)?;
    let next_run_at = next_run_for_cron(&cron_expression, Utc::now()).map(|dt| dt.to_rfc3339());

    conn.execute(
        "INSERT INTO crawl_schedules
         (project_id, start_url, crawl_settings_json, cron_expression, enabled, next_run_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 1, ?5, datetime('now'))",
        params![
            input.project_id,
            start_url,
            crawl_settings_json,
            cron_expression,
            next_run_at
        ],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    get_schedule(conn, id)?.ok_or_else(|| "Created crawl schedule could not be loaded".to_string())
}

fn update_schedule(
    conn: &Connection,
    id: i64,
    input: UpdateCrawlScheduleInput,
) -> Result<CrawlSchedule, String> {
    let mut existing =
        get_schedule(conn, id)?.ok_or_else(|| "Crawl schedule not found".to_string())?;

    if let Some(enabled) = input.enabled {
        existing.enabled = if enabled { 1 } else { 0 };
    }
    if let Some(cron_expression) = input.cron_expression {
        existing.cron_expression = validate_cron_expression(cron_expression)?;
    }

    existing.next_run_at = if existing.enabled == 1 {
        next_run_for_cron(&existing.cron_expression, Utc::now()).map(|dt| dt.to_rfc3339())
    } else {
        None
    };

    conn.execute(
        "UPDATE crawl_schedules
         SET cron_expression = ?1, enabled = ?2, next_run_at = ?3, updated_at = datetime('now')
         WHERE id = ?4",
        params![
            existing.cron_expression,
            existing.enabled,
            existing.next_run_at,
            id
        ],
    )
    .map_err(|e| e.to_string())?;

    get_schedule(conn, id)?.ok_or_else(|| "Updated crawl schedule could not be loaded".to_string())
}

fn get_schedule(conn: &Connection, id: i64) -> Result<Option<CrawlSchedule>, String> {
    conn.query_row(
        "SELECT id, project_id, start_url, crawl_settings_json, cron_expression, enabled,
                last_run_at, next_run_at, created_at, updated_at
         FROM crawl_schedules
         WHERE id = ?1",
        params![id],
        map_schedule_row,
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn map_schedule_row(row: &rusqlite::Row) -> rusqlite::Result<CrawlSchedule> {
    Ok(CrawlSchedule {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        start_url: row.get("start_url")?,
        crawl_settings_json: row.get("crawl_settings_json")?,
        cron_expression: row.get("cron_expression")?,
        enabled: row.get("enabled")?,
        last_run_at: row.get("last_run_at")?,
        next_run_at: row.get("next_run_at")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn ensure_project_exists(conn: &Connection, project_id: i64) -> Result<(), String> {
    let exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM projects WHERE id = ?1",
            params![project_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if exists == 0 {
        Err("Project not found".to_string())
    } else {
        Ok(())
    }
}

fn validate_required(field: &str, value: String) -> Result<String, String> {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        Err(format!("{} is required", field))
    } else {
        Ok(trimmed)
    }
}

fn validate_json_object(value: &str) -> Result<(), String> {
    let parsed: serde_json::Value = serde_json::from_str(value)
        .map_err(|e| format!("Crawl settings JSON is invalid: {}", e))?;
    if parsed.is_object() {
        Ok(())
    } else {
        Err("Crawl settings JSON must be an object".to_string())
    }
}

fn validate_cron_expression(value: String) -> Result<String, String> {
    let trimmed = value.trim().to_string();
    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    if parts.len() != 5 {
        return Err("Cron expression must contain exactly 5 fields".to_string());
    }

    validate_cron_field(parts[0], 0, 59, true)?;
    validate_cron_field(parts[1], 0, 23, true)?;
    validate_cron_field(parts[2], 1, 31, false)?;
    validate_cron_field(parts[3], 1, 12, false)?;
    validate_cron_field(parts[4], 0, 6, false)?;

    Ok(trimmed)
}

fn validate_cron_field(field: &str, min: u32, max: u32, allow_step: bool) -> Result<(), String> {
    if field == "*" {
        return Ok(());
    }
    if allow_step && field.starts_with("*/") {
        let step = field[2..]
            .parse::<u32>()
            .map_err(|_| "Cron step fields must use numeric intervals".to_string())?;
        if step == 0 || step > max {
            return Err("Cron step interval is out of range".to_string());
        }
        return Ok(());
    }
    let value = field
        .parse::<u32>()
        .map_err(|_| "Only simple cron fields are supported here".to_string())?;
    if value < min || value > max {
        Err("Cron field is out of range".to_string())
    } else {
        Ok(())
    }
}

fn next_run_for_cron(expr: &str, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
    let parts: Vec<&str> = expr.split_whitespace().collect();
    if parts.len() != 5 {
        return None;
    }

    let minute = parts[0].parse::<u32>().ok()?;
    let hour_field = parts[1];
    let day_of_month = parts[2];
    let month = parts[3];
    let day_of_week = parts[4];

    if day_of_month == "*" && month == "*" && day_of_week == "*" {
        if hour_field == "*" {
            return next_hourly(minute, now);
        }
        if let Some(step) = hour_field.strip_prefix("*/") {
            return next_hour_step(minute, step.parse::<u32>().ok()?, now);
        }
        return next_daily(minute, hour_field.parse::<u32>().ok()?, now);
    }

    if day_of_month == "*" && month == "*" {
        return next_weekly(
            minute,
            hour_field.parse::<u32>().ok()?,
            day_of_week.parse::<u32>().ok()?,
            now,
        );
    }

    if month == "*" && day_of_week == "*" {
        return next_monthly(
            minute,
            hour_field.parse::<u32>().ok()?,
            day_of_month.parse::<u32>().ok()?,
            now,
        );
    }

    None
}

fn next_hourly(minute: u32, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
    let mut candidate = now
        .with_minute(minute)?
        .with_second(0)?
        .with_nanosecond(0)?;
    if candidate <= now {
        candidate = candidate + Duration::hours(1);
    }
    Some(candidate)
}

fn next_hour_step(minute: u32, step: u32, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
    if step == 0 {
        return None;
    }
    let mut candidate = now
        .with_minute(minute)?
        .with_second(0)?
        .with_nanosecond(0)?;
    while candidate <= now || candidate.hour() % step != 0 {
        candidate = candidate + Duration::hours(1);
    }
    Some(candidate)
}

fn next_daily(minute: u32, hour: u32, now: DateTime<Utc>) -> Option<DateTime<Utc>> {
    let mut candidate = now
        .with_hour(hour)?
        .with_minute(minute)?
        .with_second(0)?
        .with_nanosecond(0)?;
    if candidate <= now {
        candidate = candidate + Duration::days(1);
    }
    Some(candidate)
}

fn next_weekly(
    minute: u32,
    hour: u32,
    day_of_week: u32,
    now: DateTime<Utc>,
) -> Option<DateTime<Utc>> {
    let mut candidate = next_daily(minute, hour, now)?;
    while candidate.weekday().num_days_from_sunday() != day_of_week {
        candidate = candidate + Duration::days(1);
    }
    Some(candidate)
}

fn next_monthly(
    minute: u32,
    hour: u32,
    day_of_month: u32,
    now: DateTime<Utc>,
) -> Option<DateTime<Utc>> {
    let mut candidate = next_daily(minute, hour, now)?;
    for _ in 0..370 {
        if candidate.day() == day_of_month {
            return Some(candidate);
        }
        candidate = candidate + Duration::days(1);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::storage::db;
    use chrono::TimeZone;

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
        conn
    }

    #[test]
    fn create_list_update_delete_schedule() {
        let conn = setup_conn();

        let created = create_schedule(
            &conn,
            CreateCrawlScheduleInput {
                project_id: 1,
                start_url: " https://example.com ".to_string(),
                crawl_settings_json: Some("{\"maxUrls\":10}".to_string()),
                cron_expression: "0 2 * * *".to_string(),
            },
        )
        .expect("create schedule");

        assert_eq!(created.project_id, 1);
        assert_eq!(created.start_url, "https://example.com");
        assert_eq!(created.enabled, 1);
        assert_eq!(created.cron_expression, "0 2 * * *");
        assert!(created.next_run_at.is_some());

        let listed = list_schedules(&conn, 1).expect("list schedules");
        assert_eq!(listed, vec![created.clone()]);

        let updated = update_schedule(
            &conn,
            created.id,
            UpdateCrawlScheduleInput {
                enabled: Some(false),
                cron_expression: Some("0 */6 * * *".to_string()),
            },
        )
        .expect("update schedule");

        assert_eq!(updated.enabled, 0);
        assert_eq!(updated.cron_expression, "0 */6 * * *");
        assert_eq!(updated.next_run_at, None);

        delete_crawl_schedule_for_test(&conn, updated.id).expect("delete schedule");
        assert!(list_schedules(&conn, 1).expect("list schedules").is_empty());
    }

    #[test]
    fn rejects_invalid_cron_expression() {
        let conn = setup_conn();
        let err = create_schedule(
            &conn,
            CreateCrawlScheduleInput {
                project_id: 1,
                start_url: "https://example.com".to_string(),
                crawl_settings_json: Some("{}".to_string()),
                cron_expression: "daily".to_string(),
            },
        )
        .expect_err("invalid cron should fail");

        assert!(err.contains("exactly 5 fields"));
    }

    #[test]
    fn project_delete_cascades_schedules() {
        let conn = setup_conn();
        let created = create_schedule(
            &conn,
            CreateCrawlScheduleInput {
                project_id: 1,
                start_url: "https://example.com".to_string(),
                crawl_settings_json: None,
                cron_expression: "0 2 * * *".to_string(),
            },
        )
        .expect("create schedule");

        conn.execute("DELETE FROM projects WHERE id = 1", [])
            .expect("delete project");

        assert!(get_schedule(&conn, created.id)
            .expect("load schedule")
            .is_none());
    }

    #[test]
    fn computes_next_run_for_presets() {
        let now = Utc.with_ymd_and_hms(2026, 5, 16, 1, 30, 0).unwrap();
        assert_eq!(
            next_run_for_cron("0 2 * * *", now).unwrap(),
            Utc.with_ymd_and_hms(2026, 5, 16, 2, 0, 0).unwrap()
        );
        assert_eq!(
            next_run_for_cron("0 * * * *", now).unwrap(),
            Utc.with_ymd_and_hms(2026, 5, 16, 2, 0, 0).unwrap()
        );
        assert_eq!(
            next_run_for_cron("0 */6 * * *", now).unwrap(),
            Utc.with_ymd_and_hms(2026, 5, 16, 6, 0, 0).unwrap()
        );
    }

    fn delete_crawl_schedule_for_test(conn: &Connection, id: i64) -> Result<(), String> {
        let changed = conn
            .execute("DELETE FROM crawl_schedules WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err("Crawl schedule not found".to_string());
        }
        Ok(())
    }
}
