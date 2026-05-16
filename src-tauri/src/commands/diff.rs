//! Crawl diff commands.

use crate::core::storage::db;
use rusqlite::{params, Connection};
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CrawlDiffSummary {
    pub id: String,
    pub project_id: i64,
    pub crawl_a_id: i64,
    pub crawl_b_id: i64,
    pub url_count_delta: i64,
    pub new_urls_count: i64,
    pub removed_urls_count: i64,
    pub broken_links_delta: i64,
    pub issues_delta: i64,
    pub critical_issues_delta: i64,
    pub created_at: String,
}

#[tauri::command]
pub fn list_crawl_diffs(project_id: i64) -> Result<Vec<CrawlDiffSummary>, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    list_diffs(&conn, project_id).map_err(|e| e.to_string())
}

fn list_diffs(conn: &Connection, project_id: i64) -> rusqlite::Result<Vec<CrawlDiffSummary>> {
    let crawls = list_completed_crawls(conn, project_id)?;
    let mut diffs = Vec::new();

    for pair in crawls.windows(2) {
        let older = &pair[1];
        let newer = &pair[0];
        diffs.push(compare_crawls(conn, project_id, older, newer)?);
    }

    Ok(diffs)
}

fn list_completed_crawls(
    conn: &Connection,
    project_id: i64,
) -> rusqlite::Result<Vec<CrawlSnapshot>> {
    let mut stmt = conn.prepare(
        "SELECT id, url_count, issue_count, created_at
         FROM crawls
         WHERE project_id = ?1 AND status = 'completed'
         ORDER BY COALESCE(completed_at, created_at) DESC, id DESC",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(CrawlSnapshot {
            id: row.get("id")?,
            url_count: row.get("url_count")?,
            issue_count: row.get("issue_count")?,
            created_at: row.get("created_at")?,
        })
    })?;
    rows.collect()
}

fn compare_crawls(
    conn: &Connection,
    project_id: i64,
    older: &CrawlSnapshot,
    newer: &CrawlSnapshot,
) -> rusqlite::Result<CrawlDiffSummary> {
    let new_urls_count = count_new_urls(conn, older.id, newer.id)?;
    let removed_urls_count = count_new_urls(conn, newer.id, older.id)?;
    let broken_links_delta =
        count_broken_links(conn, newer.id)? - count_broken_links(conn, older.id)?;
    let critical_issues_delta =
        count_critical_issues(conn, newer.id)? - count_critical_issues(conn, older.id)?;

    Ok(CrawlDiffSummary {
        id: format!("{}:{}", older.id, newer.id),
        project_id,
        crawl_a_id: older.id,
        crawl_b_id: newer.id,
        url_count_delta: newer.url_count - older.url_count,
        new_urls_count,
        removed_urls_count,
        broken_links_delta,
        issues_delta: newer.issue_count - older.issue_count,
        critical_issues_delta,
        created_at: newer.created_at.clone(),
    })
}

fn count_new_urls(
    conn: &Connection,
    base_crawl_id: i64,
    compare_crawl_id: i64,
) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT COUNT(*)
         FROM urls newer
         WHERE newer.crawl_id = ?2
           AND NOT EXISTS (
             SELECT 1
             FROM urls older
             WHERE older.crawl_id = ?1
               AND COALESCE(older.normalized_url, older.url) = COALESCE(newer.normalized_url, newer.url)
           )",
        params![base_crawl_id, compare_crawl_id],
        |row| row.get(0),
    )
}

fn count_broken_links(conn: &Connection, crawl_id: i64) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT COUNT(*)
         FROM links l
         LEFT JOIN urls target
           ON target.crawl_id = l.crawl_id
          AND (
            target.normalized_url = l.target_normalized_url
            OR target.url = l.target_url
            OR target.final_url = l.target_url
          )
         WHERE l.crawl_id = ?1
           AND COALESCE(l.status_code, target.status_code) >= 400",
        params![crawl_id],
        |row| row.get(0),
    )
}

fn count_critical_issues(conn: &Connection, crawl_id: i64) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT COUNT(*)
         FROM issues i
         JOIN urls u ON u.id = i.url_id
         WHERE u.crawl_id = ?1 AND lower(i.severity) = 'critical'",
        params![crawl_id],
        |row| row.get(0),
    )
}

#[derive(Debug, Clone)]
struct CrawlSnapshot {
    id: i64,
    url_count: i64,
    issue_count: i64,
    created_at: String,
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
        conn
    }

    #[test]
    fn list_diffs_compares_consecutive_completed_crawls() {
        let conn = setup_conn();
        insert_crawl(&conn, 10, 2, 1, "2026-05-14T00:00:00Z");
        insert_crawl(&conn, 11, 3, 2, "2026-05-15T00:00:00Z");

        insert_url(&conn, 1, 10, "https://example.com/", 200);
        insert_url(&conn, 2, 10, "https://example.com/old", 200);
        insert_url(&conn, 3, 11, "https://example.com/", 200);
        insert_url(&conn, 4, 11, "https://example.com/new", 200);
        insert_url(&conn, 5, 11, "https://example.com/broken", 404);

        insert_link(&conn, 1, 10, 1, "https://example.com/old", 200);
        insert_link(&conn, 2, 11, 3, "https://example.com/broken", 404);
        insert_issue(&conn, 1, 10, 1, "warning");
        insert_issue(&conn, 2, 11, 5, "critical");
        insert_issue(&conn, 3, 11, 4, "warning");

        let diffs = list_diffs(&conn, 1).expect("list diffs");

        assert_eq!(diffs.len(), 1);
        assert_eq!(diffs[0].crawl_a_id, 10);
        assert_eq!(diffs[0].crawl_b_id, 11);
        assert_eq!(diffs[0].url_count_delta, 1);
        assert_eq!(diffs[0].new_urls_count, 2);
        assert_eq!(diffs[0].removed_urls_count, 1);
        assert_eq!(diffs[0].broken_links_delta, 1);
        assert_eq!(diffs[0].issues_delta, 1);
        assert_eq!(diffs[0].critical_issues_delta, 1);
    }

    #[test]
    fn list_diffs_requires_two_completed_crawls() {
        let conn = setup_conn();
        insert_crawl(&conn, 10, 2, 1, "2026-05-14T00:00:00Z");

        assert!(list_diffs(&conn, 1).expect("list diffs").is_empty());
    }

    fn insert_crawl(
        conn: &Connection,
        id: i64,
        url_count: i64,
        issue_count: i64,
        created_at: &str,
    ) {
        conn.execute(
            "INSERT INTO crawls
             (id, project_id, status, url_count, issue_count, created_at, completed_at)
             VALUES (?1, 1, 'completed', ?2, ?3, ?4, ?4)",
            params![id, url_count, issue_count, created_at],
        )
        .expect("insert crawl");
    }

    fn insert_url(conn: &Connection, id: i64, crawl_id: i64, url: &str, status_code: i64) {
        conn.execute(
            "INSERT INTO urls (id, url, normalized_url, project_id, crawl_id, status_code)
             VALUES (?1, ?2, ?2, 1, ?3, ?4)",
            params![id, url, crawl_id, status_code],
        )
        .expect("insert url");
    }

    fn insert_link(
        conn: &Connection,
        id: i64,
        crawl_id: i64,
        source_url_id: i64,
        target_url: &str,
        status_code: i64,
    ) {
        conn.execute(
            "INSERT INTO links (id, crawl_id, source_url_id, source_url, target_url, target_normalized_url, status_code)
             VALUES (?1, ?2, ?3, 'https://example.com/', ?4, ?4, ?5)",
            params![id, crawl_id, source_url_id, target_url, status_code],
        )
        .expect("insert link");
    }

    fn insert_issue(conn: &Connection, id: i64, crawl_id: i64, url_id: i64, severity: &str) {
        conn.execute(
            "INSERT INTO issues (id, issue_type, severity, category, url_id, url, message)
             VALUES (?1, 'test_issue', ?2, 'technical', ?3, 'https://example.com/', 'Test issue')",
            params![id, severity, url_id],
        )
        .expect("insert issue");

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM urls WHERE crawl_id = ?1 AND id = ?2",
                params![crawl_id, url_id],
                |row| row.get(0),
            )
            .expect("count url");
        assert_eq!(count, 1);
    }
}
