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

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CrawlDiffUrlChange {
    pub url: String,
    pub old_status_code: Option<i64>,
    pub new_status_code: Option<i64>,
    pub old_title: Option<String>,
    pub new_title: Option<String>,
    pub old_indexability: Option<String>,
    pub new_indexability: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CrawlDiffIssueChange {
    pub issue_type: String,
    pub severity: String,
    pub category: String,
    pub url: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CrawlDiffBrokenLinkChange {
    pub source_url: String,
    pub target_url: String,
    pub status_code: Option<i64>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CrawlDiffDetail {
    pub summary: CrawlDiffSummary,
    pub new_urls: Vec<CrawlDiffUrlChange>,
    pub removed_urls: Vec<CrawlDiffUrlChange>,
    pub changed_urls: Vec<CrawlDiffUrlChange>,
    pub new_issues: Vec<CrawlDiffIssueChange>,
    pub resolved_issues: Vec<CrawlDiffIssueChange>,
    pub new_broken_links: Vec<CrawlDiffBrokenLinkChange>,
    pub resolved_broken_links: Vec<CrawlDiffBrokenLinkChange>,
    pub sample_limit: i64,
}

#[tauri::command]
pub fn list_crawl_diffs(project_id: i64) -> Result<Vec<CrawlDiffSummary>, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    list_diffs(&conn, project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_crawl_diff_detail(
    project_id: i64,
    diff_id: String,
    sample_limit: Option<i64>,
) -> Result<CrawlDiffDetail, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let limit = sample_limit.unwrap_or(25).clamp(1, 100);
    diff_detail(&conn, project_id, &diff_id, limit).map_err(|e| e.to_string())
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

fn diff_detail(
    conn: &Connection,
    project_id: i64,
    diff_id: &str,
    sample_limit: i64,
) -> rusqlite::Result<CrawlDiffDetail> {
    let (older_id, newer_id) = parse_diff_id(diff_id)?;
    let older = get_completed_crawl(conn, project_id, older_id)?;
    let newer = get_completed_crawl(conn, project_id, newer_id)?;
    let summary = compare_crawls(conn, project_id, &older, &newer)?;

    Ok(CrawlDiffDetail {
        summary,
        new_urls: list_url_presence_changes(conn, older_id, newer_id, sample_limit)?,
        removed_urls: list_url_presence_changes(conn, newer_id, older_id, sample_limit)?,
        changed_urls: list_changed_urls(conn, older_id, newer_id, sample_limit)?,
        new_issues: list_issue_presence_changes(conn, older_id, newer_id, sample_limit)?,
        resolved_issues: list_issue_presence_changes(conn, newer_id, older_id, sample_limit)?,
        new_broken_links: list_broken_link_presence_changes(conn, older_id, newer_id, sample_limit)?,
        resolved_broken_links: list_broken_link_presence_changes(
            conn,
            newer_id,
            older_id,
            sample_limit,
        )?,
        sample_limit,
    })
}

fn parse_diff_id(diff_id: &str) -> rusqlite::Result<(i64, i64)> {
    let Some((older, newer)) = diff_id.split_once(':') else {
        return Err(rusqlite::Error::InvalidParameterName(
            "diff_id must be formatted as crawl_a:crawl_b".to_string(),
        ));
    };

    let older_id = older.parse::<i64>().map_err(|_| {
        rusqlite::Error::InvalidParameterName("diff_id crawl_a is invalid".to_string())
    })?;
    let newer_id = newer.parse::<i64>().map_err(|_| {
        rusqlite::Error::InvalidParameterName("diff_id crawl_b is invalid".to_string())
    })?;

    Ok((older_id, newer_id))
}

fn get_completed_crawl(
    conn: &Connection,
    project_id: i64,
    crawl_id: i64,
) -> rusqlite::Result<CrawlSnapshot> {
    conn.query_row(
        "SELECT id, url_count, issue_count, created_at
         FROM crawls
         WHERE id = ?1 AND project_id = ?2 AND status = 'completed'",
        params![crawl_id, project_id],
        |row| {
            Ok(CrawlSnapshot {
                id: row.get("id")?,
                url_count: row.get("url_count")?,
                issue_count: row.get("issue_count")?,
                created_at: row.get("created_at")?,
            })
        },
    )
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

fn list_url_presence_changes(
    conn: &Connection,
    base_crawl_id: i64,
    compare_crawl_id: i64,
    limit: i64,
) -> rusqlite::Result<Vec<CrawlDiffUrlChange>> {
    let mut stmt = conn.prepare(
        "SELECT newer.url, newer.status_code, newer.title, newer.indexability
         FROM urls newer
         WHERE newer.crawl_id = ?2
           AND NOT EXISTS (
             SELECT 1
             FROM urls older
             WHERE older.crawl_id = ?1
               AND COALESCE(older.normalized_url, older.url) = COALESCE(newer.normalized_url, newer.url)
           )
         ORDER BY newer.url
         LIMIT ?3",
    )?;

    let rows = stmt.query_map(params![base_crawl_id, compare_crawl_id, limit], |row| {
        Ok(CrawlDiffUrlChange {
            url: row.get("url")?,
            old_status_code: None,
            new_status_code: row.get("status_code")?,
            old_title: None,
            new_title: row.get("title")?,
            old_indexability: None,
            new_indexability: row.get("indexability")?,
        })
    })?;
    rows.collect()
}

fn list_changed_urls(
    conn: &Connection,
    older_crawl_id: i64,
    newer_crawl_id: i64,
    limit: i64,
) -> rusqlite::Result<Vec<CrawlDiffUrlChange>> {
    let mut stmt = conn.prepare(
        "SELECT newer.url,
                older.status_code AS old_status_code,
                newer.status_code AS new_status_code,
                older.title AS old_title,
                newer.title AS new_title,
                older.indexability AS old_indexability,
                newer.indexability AS new_indexability
         FROM urls older
         JOIN urls newer
           ON newer.crawl_id = ?2
          AND COALESCE(newer.normalized_url, newer.url) = COALESCE(older.normalized_url, older.url)
         WHERE older.crawl_id = ?1
           AND (
             COALESCE(older.status_code, -1) != COALESCE(newer.status_code, -1)
             OR COALESCE(older.title, '') != COALESCE(newer.title, '')
             OR COALESCE(older.meta_description, '') != COALESCE(newer.meta_description, '')
             OR COALESCE(older.indexability, '') != COALESCE(newer.indexability, '')
             OR COALESCE(older.content_hash, '') != COALESCE(newer.content_hash, '')
           )
         ORDER BY newer.url
         LIMIT ?3",
    )?;

    let rows = stmt.query_map(params![older_crawl_id, newer_crawl_id, limit], |row| {
        Ok(CrawlDiffUrlChange {
            url: row.get("url")?,
            old_status_code: row.get("old_status_code")?,
            new_status_code: row.get("new_status_code")?,
            old_title: row.get("old_title")?,
            new_title: row.get("new_title")?,
            old_indexability: row.get("old_indexability")?,
            new_indexability: row.get("new_indexability")?,
        })
    })?;
    rows.collect()
}

fn list_issue_presence_changes(
    conn: &Connection,
    base_crawl_id: i64,
    compare_crawl_id: i64,
    limit: i64,
) -> rusqlite::Result<Vec<CrawlDiffIssueChange>> {
    let mut stmt = conn.prepare(
        "SELECT i.issue_type, i.severity, i.category, COALESCE(u.url, i.url) AS url, i.message
         FROM issues i
         JOIN urls u ON u.id = i.url_id
         WHERE u.crawl_id = ?2
           AND NOT EXISTS (
             SELECT 1
             FROM issues old_i
             JOIN urls old_u ON old_u.id = old_i.url_id
             WHERE old_u.crawl_id = ?1
               AND old_i.issue_type = i.issue_type
               AND COALESCE(old_u.normalized_url, old_u.url) = COALESCE(u.normalized_url, u.url)
               AND COALESCE(old_i.message, '') = COALESCE(i.message, '')
           )
         ORDER BY
           CASE lower(i.severity)
             WHEN 'critical' THEN 0
             WHEN 'high' THEN 1
             WHEN 'warning' THEN 2
             WHEN 'medium' THEN 3
             ELSE 4
           END,
           url
         LIMIT ?3",
    )?;

    let rows = stmt.query_map(params![base_crawl_id, compare_crawl_id, limit], |row| {
        Ok(CrawlDiffIssueChange {
            issue_type: row.get("issue_type")?,
            severity: row.get("severity")?,
            category: row.get("category")?,
            url: row.get("url")?,
            message: row.get("message")?,
        })
    })?;
    rows.collect()
}

fn list_broken_link_presence_changes(
    conn: &Connection,
    base_crawl_id: i64,
    compare_crawl_id: i64,
    limit: i64,
) -> rusqlite::Result<Vec<CrawlDiffBrokenLinkChange>> {
    let mut stmt = conn.prepare(
        "WITH broken_links AS (
           SELECT l.crawl_id,
                  l.source_url,
                  l.target_url,
                  COALESCE(l.target_normalized_url, l.target_url) AS target_key,
                  COALESCE(l.status_code, target.status_code) AS status_code
           FROM links l
           LEFT JOIN urls target
             ON target.crawl_id = l.crawl_id
            AND (
              target.normalized_url = l.target_normalized_url
              OR target.url = l.target_url
              OR target.final_url = l.target_url
            )
           WHERE COALESCE(l.status_code, target.status_code) >= 400
         )
         SELECT newer.source_url, newer.target_url, newer.status_code
         FROM broken_links newer
         WHERE newer.crawl_id = ?2
           AND NOT EXISTS (
             SELECT 1
             FROM broken_links older
             WHERE older.crawl_id = ?1
               AND older.source_url = newer.source_url
               AND older.target_key = newer.target_key
           )
         ORDER BY newer.source_url, newer.target_url
         LIMIT ?3",
    )?;

    let rows = stmt.query_map(params![base_crawl_id, compare_crawl_id, limit], |row| {
        Ok(CrawlDiffBrokenLinkChange {
            source_url: row.get("source_url")?,
            target_url: row.get("target_url")?,
            status_code: row.get("status_code")?,
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

    #[test]
    fn diff_detail_lists_url_issue_and_broken_link_changes() {
        let conn = setup_conn();
        insert_crawl(&conn, 10, 3, 1, "2026-05-14T00:00:00Z");
        insert_crawl(&conn, 11, 4, 2, "2026-05-15T00:00:00Z");

        insert_url_with_meta(&conn, 1, 10, "https://example.com/", 200, "Home", "indexable");
        insert_url_with_meta(
            &conn,
            2,
            10,
            "https://example.com/changed",
            200,
            "Old title",
            "indexable",
        );
        insert_url_with_meta(
            &conn,
            3,
            10,
            "https://example.com/removed",
            200,
            "Removed",
            "indexable",
        );
        insert_url_with_meta(&conn, 4, 11, "https://example.com/", 200, "Home", "indexable");
        insert_url_with_meta(
            &conn,
            5,
            11,
            "https://example.com/changed",
            404,
            "New title",
            "non_indexable",
        );
        insert_url_with_meta(
            &conn,
            6,
            11,
            "https://example.com/new",
            200,
            "New",
            "indexable",
        );

        insert_issue_with_message(&conn, 1, 10, 3, "critical", "Removed issue");
        insert_issue_with_message(&conn, 2, 11, 6, "warning", "New issue");
        insert_link(&conn, 1, 10, 1, "https://example.com/old-broken", 404);
        insert_link(&conn, 2, 11, 4, "https://example.com/new-broken", 500);

        let detail = diff_detail(&conn, 1, "10:11", 10).expect("diff detail");

        assert_eq!(detail.summary.id, "10:11");
        assert_eq!(detail.new_urls[0].url, "https://example.com/new");
        assert_eq!(detail.removed_urls[0].url, "https://example.com/removed");
        assert_eq!(detail.changed_urls[0].url, "https://example.com/changed");
        assert_eq!(detail.changed_urls[0].old_status_code, Some(200));
        assert_eq!(detail.changed_urls[0].new_status_code, Some(404));
        assert_eq!(detail.new_issues[0].message, "New issue");
        assert_eq!(detail.resolved_issues[0].message, "Removed issue");
        assert_eq!(
            detail.new_broken_links[0].target_url,
            "https://example.com/new-broken"
        );
        assert_eq!(
            detail.resolved_broken_links[0].target_url,
            "https://example.com/old-broken"
        );
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

    fn insert_url_with_meta(
        conn: &Connection,
        id: i64,
        crawl_id: i64,
        url: &str,
        status_code: i64,
        title: &str,
        indexability: &str,
    ) {
        conn.execute(
            "INSERT INTO urls (id, url, normalized_url, project_id, crawl_id, status_code, title, indexability)
             VALUES (?1, ?2, ?2, 1, ?3, ?4, ?5, ?6)",
            params![id, url, crawl_id, status_code, title, indexability],
        )
        .expect("insert url with meta");
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
        insert_issue_with_message(conn, id, crawl_id, url_id, severity, "Test issue");
    }

    fn insert_issue_with_message(
        conn: &Connection,
        id: i64,
        crawl_id: i64,
        url_id: i64,
        severity: &str,
        message: &str,
    ) {
        conn.execute(
            "INSERT INTO issues (id, issue_type, severity, category, url_id, url, message)
             VALUES (?1, 'test_issue', ?2, 'technical', ?3, 'https://example.com/', ?4)",
            params![id, severity, url_id, message],
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
