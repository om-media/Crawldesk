//! Repository queries matching the TypeScript repository layer.
//! Each method maps to one SQL query — direct port from src/main/db/repositories/*.ts

use crate::core::crawler::issue_registry;
use crate::core::storage::models::*;
pub use crate::core::storage::models::{IssueRecord, IssueSummary, LinkRecord, LinkSummary};
use chrono::{DateTime, NaiveDateTime, Utc};
use rusqlite::types::Value;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Result};

fn parse_sqlite_datetime(s: &str) -> std::result::Result<DateTime<Utc>, chrono::ParseError> {
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Ok(dt.with_timezone(&Utc));
    }

    NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").map(|dt| dt.and_utc())
}

/// Helper to get a non-optional DateTime<Utc> from a row (SQLite stores dates as strings).
fn get_datetime(row: &rusqlite::Row, idx: &str) -> Result<DateTime<Utc>> {
    let s: String = row.get(idx)?;
    let dt = parse_sqlite_datetime(&s).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
    })?;
    Ok(dt)
}

/// Helper to get an optional DateTime<Utc> from a row (SQLite stores dates as strings).
fn get_datetime_opt(row: &rusqlite::Row, idx: &str) -> Result<Option<DateTime<Utc>>> {
    let s: Option<String> = row.get(idx)?;
    Ok(s.and_then(|v| parse_sqlite_datetime(&v).ok()))
}

fn get_datetime_col(row: &rusqlite::Row, idx: usize) -> Result<DateTime<Utc>> {
    let s: String = row.get(idx)?;
    let dt = parse_sqlite_datetime(&s).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
    })?;
    Ok(dt)
}

/// Derive human-readable label, explanation, and recommendation from issue metadata.
fn derive_issue_context(
    issue_type: &str,
    _severity: &str,
    _category: &str,
) -> (String, String, String) {
    if let Some(definition) = issue_registry::definition_for_id(issue_type) {
        return (
            definition.label.to_string(),
            definition.explanation.to_string(),
            definition.recommendation.to_string(),
        );
    }

    let label = match issue_type {
        "missing_title" => "Missing Title Tag".to_string(),
        "duplicate_title" => "Duplicate Title Tag".to_string(),
        "title_too_long" => "Title Tag Too Long".to_string(),
        "title_too_short" => "Title Tag Too Short".to_string(),
        "missing_meta_description" => "Missing Meta Description".to_string(),
        "duplicate_meta_description" => "Duplicate Meta Description".to_string(),
        "meta_description_too_long" => "Meta Description Too Long".to_string(),
        "missing_h1" => "Missing H1 Heading".to_string(),
        "duplicate_h1" => "Duplicate H1 Heading".to_string(),
        "missing_alt_text" => "Missing Alt Text on Images".to_string(),
        "broken_link" => "Broken Link (404)".to_string(),
        "redirect_chain" => "Excessive Redirect Chain".to_string(),
        "noindex_without_reason" => "Noindex Without Clear Reason".to_string(),
        "canonical_self_referencing" => "Canonical Self-Referencing".to_string(),
        "canonical_mismatch" => "Canonical URL Mismatch".to_string(),
        "missing_canonical" => "Missing Canonical Tag".to_string(),
        "slow_page_speed" => "Slow Page Speed".to_string(),
        "large_image" => "Oversized Image File".to_string(),
        "text_to_html_ratio_low" => "Low Text-to-HTML Ratio".to_string(),
        "missing_schema_org" => "Missing Schema.org Markup".to_string(),
        "mixed_content" => "Mixed HTTP/HTTPS Content".to_string(),
        "missing_hreflang" => "Missing Hreflang Tags".to_string(),
        _ => format!(
            "{} Issue",
            issue_type
                .replace('_', " ")
                .replace(' ', " ")
                .chars()
                .next()
                .map(|c| c.to_uppercase().to_string())
                .unwrap_or_default()
                + &issue_type.replace('_', " ")[1..]
        ),
    };

    let explanation = match issue_type {
        "missing_title" => "The page has no <title> tag, which is critical for search engine understanding and click-through rates.".to_string(),
        "duplicate_title" => "Multiple pages share the same title tag, causing keyword cannibalization and confusing search engines about which page to rank.".to_string(),
        "title_too_long" => "The title tag exceeds 60 characters and may be truncated in search results, reducing click-through rates.".to_string(),
        "title_too_short" => "The title tag is under 30 characters and likely lacks sufficient keyword context for search engines.".to_string(),
        "missing_meta_description" => "The page has no meta description, which search engines may generate automatically (often suboptimally) for SERP snippets.".to_string(),
        "duplicate_meta_description" => "Multiple pages share the same meta description, reducing the uniqueness of each page's search snippet.".to_string(),
        "meta_description_too_long" => "The meta description exceeds 160 characters and will be truncated in search results.".to_string(),
        "missing_h1" => "The page has no H1 heading, which is the primary signal for page topic to search engines.".to_string(),
        "duplicate_h1" => "Multiple H1 headings on one page dilute the topical signal and confuse search engine crawlers.".to_string(),
        "missing_alt_text" => "Images without alt text are invisible to search engines and screen readers, hurting both SEO and accessibility.".to_string(),
        "broken_link" => "A link on this page points to a URL that returns a 404 error, wasting crawl budget and creating poor user experience.".to_string(),
        "redirect_chain" => "The page has more than 3 redirects in its chain, increasing load time and diluting link equity.".to_string(),
        "noindex_without_reason" => "The page has a noindex directive but may be important for SEO. Verify this is intentional.".to_string(),
        "canonical_self_referencing" => "The canonical tag points to itself, which is correct but should be verified against the actual preferred URL.".to_string(),
        "canonical_mismatch" => "The canonical tag points to a different URL than the page's actual URL, which may cause indexing issues.".to_string(),
        "missing_canonical" => "The page has no canonical tag, risking duplicate content issues if similar pages exist.".to_string(),
        "slow_page_speed" => "Page load time exceeds 3 seconds, negatively impacting user experience and search rankings.".to_string(),
        "large_image" => "An image file exceeds 500KB. Compressing or resizing it could significantly improve page speed.".to_string(),
        "text_to_html_ratio_low" => "The text content is less than 10% of the HTML, suggesting thin content that may not rank well.".to_string(),
        "missing_schema_org" => "No Schema.org structured data found. Adding markup can enable rich results in search engines.".to_string(),
        "mixed_content" => "The page loads resources over HTTP while the page itself is HTTPS, causing browser security warnings.".to_string(),
        "missing_hreflang" => "Hreflang tags are missing on this multilingual/multiregional page, risking incorrect regional targeting.".to_string(),
        _ => format!("This {} issue was detected during the crawl. Review the page content and HTML for optimization opportunities.", issue_type.replace('_', " ")).to_string(),
    };

    let recommendation = match issue_type {
        "missing_title" => "Add a unique, descriptive title tag (50-60 characters) that includes primary keywords.".to_string(),
        "duplicate_title" => "Create unique title tags for each page, incorporating the page's specific topic and target keywords.".to_string(),
        "title_too_long" => "Shorten the title to under 60 characters while preserving the key message and primary keyword.".to_string(),
        "title_too_short" => "Expand the title to at least 30 characters with more descriptive, keyword-rich content.".to_string(),
        "missing_meta_description" => "Add a compelling meta description (150-160 characters) that summarizes page content and includes a call-to-action.".to_string(),
        "duplicate_meta_description" => "Write unique meta descriptions for each page that accurately reflect the page's specific content.".to_string(),
        "meta_description_too_long" => "Trim the meta description to under 160 characters, keeping the most important information first.".to_string(),
        "missing_h1" => "Add a single H1 heading that clearly describes the page's main topic and includes primary keywords.".to_string(),
        "duplicate_h1" => "Consolidate to a single H1 per page. Use H2-H6 for subsections and supporting content.".to_string(),
        "missing_alt_text" => "Add descriptive alt text to all images, focusing on what the image conveys rather than filename descriptions.".to_string(),
        "broken_link" => "Fix or remove the broken link. If the target page moved, implement a 301 redirect to the new URL.".to_string(),
        "redirect_chain" => "Reduce redirect chains to a maximum of 2 hops. Update internal links to point directly to the final destination.".to_string(),
        "noindex_without_reason" => "Verify the noindex tag is intentional. If the page should be indexed, remove the noindex directive.".to_string(),
        "canonical_self_referencing" => "Confirm the self-referencing canonical is correct and that the URL is the preferred version in search console.".to_string(),
        "canonical_mismatch" => "Update the canonical tag to point to the preferred URL version (with or without www, https, trailing slash).".to_string(),
        "missing_canonical" => "Add a self-referencing canonical tag pointing to the page's own URL to prevent duplicate content issues.".to_string(),
        "slow_page_speed" => "Optimize images, enable compression, leverage browser caching, and consider a CDN to improve load times.".to_string(),
        "large_image" => "Compress the image using tools like TinyPNG or convert to WebP format. Consider lazy loading for below-fold images.".to_string(),
        "text_to_html_ratio_low" => "Add more substantive text content to the page. Aim for at least 300 words of unique, valuable content.".to_string(),
        "missing_schema_org" => "Add Schema.org structured data (JSON-LD) relevant to the page type — Article, Product, FAQ, etc.".to_string(),
        "mixed_content" => "Update all resource URLs to use HTTPS. Use protocol-relative URLs or absolute HTTPS paths for external resources.".to_string(),
        "missing_hreflang" => "Add hreflang tags between language/region variants of the page, and include a self-referencing hreflang on each.".to_string(),
        _ => format!("Review and optimize this {} issue according to SEO best practices.", issue_type.replace('_', " ")).to_string(),
    };

    (label, explanation, recommendation)
}

// ─── Projects ────────────────────────────────────────────────────

pub fn create_project(conn: &Connection, name: &str, root_url: &str) -> Result<Project> {
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO projects (name, root_url, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
        params![name, root_url, now],
    )?;

    let last_id = conn.last_insert_rowid();
    Ok(Project {
        id: last_id,
        name: name.to_string(),
        root_url: root_url.to_string(),
        created_at: parse_sqlite_datetime(&now).expect("generated RFC3339 timestamp should parse"),
        updated_at: parse_sqlite_datetime(&now).expect("generated RFC3339 timestamp should parse"),
    })
}

pub fn get_projects(conn: &Connection) -> Result<Vec<Project>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, root_url, created_at, updated_at FROM projects ORDER BY created_at DESC",
    )?;

    let projects = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get("id")?,
            name: row.get("name")?,
            root_url: row.get("root_url")?,
            created_at: get_datetime(row, "created_at")?,
            updated_at: get_datetime(row, "updated_at")?,
        })
    })?;

    projects.collect()
}

pub fn get_project(conn: &Connection, id: i64) -> Result<Option<Project>> {
    let mut stmt = conn
        .prepare("SELECT id, name, root_url, created_at, updated_at FROM projects WHERE id = ?1")?;

    stmt.query_row(params![id], |row| {
        Ok(Project {
            id: row.get("id")?,
            name: row.get("name")?,
            root_url: row.get("root_url")?,
            created_at: get_datetime(row, "created_at")?,
            updated_at: get_datetime(row, "updated_at")?,
        })
    })
    .optional()
}

pub fn get_project_summary(conn: &Connection, id: i64) -> Result<ProjectSummary> {
    let mut stmt = conn.prepare(
        "SELECT p.id as project_id, p.name, p.root_url, p.created_at, p.updated_at,
                COUNT(DISTINCT u.id) as url_count,
                COUNT(DISTINCT c.id) as crawl_count,
                COUNT(DISTINCT i.id) as issue_count
         FROM projects p
         LEFT JOIN urls u ON u.project_id = p.id
         LEFT JOIN crawls c ON c.project_id = p.id
         LEFT JOIN issues i ON i.url_id IN (SELECT id FROM urls WHERE project_id = p.id)
         WHERE p.id = ?1
         GROUP BY p.id",
    )?;

    stmt.query_row(params![id], |row| {
        Ok(ProjectSummary {
            project: Project {
                id: row.get("project_id")?,
                name: row.get("name")?,
                root_url: row.get("root_url")?,
                created_at: get_datetime(row, "created_at")?,
                updated_at: get_datetime(row, "updated_at")?,
            },
            url_count: row.get("url_count")?,
            crawl_count: row.get("crawl_count")?,
            issue_count: row.get("issue_count")?,
        })
    })
}

// ─── Crawls ──────────────────────────────────────────────────────

pub fn create_crawl(
    conn: &Connection,
    project_id: i64,
    settings_json: Option<&str>,
) -> Result<Crawl> {
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO crawls (project_id, status, settings_json, created_at) VALUES (?1, 'created', ?2, ?3)",
        params![project_id, settings_json.unwrap_or("null"), now],
    )?;

    let last_id = conn.last_insert_rowid();
    Ok(Crawl {
        id: last_id,
        project_id,
        status: "created".to_string(),
        settings_json: settings_json.map(String::from),
        started_at: None,
        completed_at: None,
        error_message: None,
        url_count: 0,
        issue_count: 0,
        link_count: 0,
        created_at: Utc::now(),
    })
}

pub fn update_crawl_status(conn: &Connection, id: i64, status: &str) -> Result<()> {
    let now = Utc::now().to_rfc3339();

    if matches!(status, "completed" | "failed" | "cancelled" | "stopped") {
        conn.execute(
            "UPDATE crawls SET status = ?1, completed_at = COALESCE(completed_at, ?2) WHERE id = ?3",
            params![status, &now, id],
        )?;
    } else {
        conn.execute(
            "UPDATE crawls SET status = ?1, started_at = COALESCE(started_at, ?2) WHERE id = ?3",
            params![status, &now, id],
        )?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_rfc3339_and_sqlite_datetime_values() {
        assert!(parse_sqlite_datetime("2026-05-12T09:34:34.596143Z").is_ok());
        assert!(parse_sqlite_datetime("2026-05-12 09:34:34").is_ok());
    }

    #[test]
    fn loads_project_rows_with_sqlite_default_timestamps() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                root_url TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO projects (name, root_url) VALUES ('Aventerra Park', 'https://aventerra-park.com/');
            ",
        ).unwrap();

        let project = get_project(&conn, 1).unwrap().unwrap();
        assert_eq!(project.name, "Aventerra Park");
        assert_eq!(project.root_url, "https://aventerra-park.com/");
    }

    #[test]
    fn update_crawl_status_sets_real_timestamp_columns() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE crawls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'created',
                settings_json TEXT,
                started_at TEXT,
                completed_at TEXT,
                error_message TEXT,
                url_count INTEGER NOT NULL DEFAULT 0,
                issue_count INTEGER NOT NULL DEFAULT 0,
                link_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO crawls (project_id) VALUES (1);
            ",
        )
        .unwrap();

        update_crawl_status(&conn, 1, "crawling").unwrap();
        let started_at: Option<String> = conn
            .query_row("SELECT started_at FROM crawls WHERE id = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert!(started_at.is_some());

        update_crawl_status(&conn, 1, "completed").unwrap();
        let completed_at: Option<String> = conn
            .query_row("SELECT completed_at FROM crawls WHERE id = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert!(completed_at.is_some());
    }

    #[test]
    fn update_inlinks_counts_sets_inlinks_per_url() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                root_url TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE crawls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'created',
                settings_json TEXT,
                started_at TEXT,
                completed_at TEXT,
                error_message TEXT,
                url_count INTEGER NOT NULL DEFAULT 0,
                issue_count INTEGER NOT NULL DEFAULT 0,
                link_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE urls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL,
                project_id INTEGER NOT NULL,
                crawl_id INTEGER,
                normalized_url TEXT,
                final_url TEXT,
                status_code INTEGER,
                content_type TEXT,
                title TEXT,
                title_length INTEGER,
                meta_description TEXT,
                meta_description_length INTEGER,
                h1 TEXT,
                h1_count INTEGER DEFAULT 0,
                word_count INTEGER,
                canonical_url TEXT,
                meta_robots TEXT,
                response_time_ms REAL,
                size_bytes INTEGER,
                language TEXT,
                inlinks_count INTEGER DEFAULT 0,
                outlinks_count INTEGER DEFAULT 0,
                content_hash TEXT,
                indexability TEXT NOT NULL DEFAULT 'unknown',
                depth INTEGER NOT NULL DEFAULT 0,
                fetch_result_json TEXT,
                seo_data_json TEXT,
                discovered_at TEXT,
                fetched_at TEXT,
                last_crawled_at TEXT
            );
            CREATE TABLE links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_url_id INTEGER NOT NULL,
                source_url TEXT NOT NULL,
                target_url TEXT NOT NULL,
                target_normalized_url TEXT,
                link_relation TEXT NOT NULL DEFAULT 'html_a',
                anchor_text TEXT,
                is_internal INTEGER NOT NULL DEFAULT 1,
                is_no_follow INTEGER NOT NULL DEFAULT 0,
                detected_at TEXT NOT NULL DEFAULT (datetime('now')),
                crawl_id INTEGER
            );
            ",
        )
        .unwrap();

        // Insert project + crawl + 3 URLs
        conn.execute(
            "INSERT INTO projects (name, root_url) VALUES ('Test', 'https://example.com/')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO crawls (project_id) VALUES (1)", [])
            .unwrap();

        // URL id=1 (normalized: /a), id=2 (/b), id=3 (/c)
        conn.execute(
            "INSERT INTO urls (url, project_id, crawl_id, normalized_url) VALUES ('https://example.com/a', 1, 1, '/a')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO urls (url, project_id, crawl_id, normalized_url) VALUES ('https://example.com/b', 1, 1, '/b')",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO urls (url, project_id, crawl_id, normalized_url) VALUES ('https://example.com/c', 1, 1, '/c')",
            [],
        ).unwrap();

        // Insert links: 2 links point to /a, 1 link points to /b, 0 to /c
        conn.execute(
            "INSERT INTO links (source_url_id, source_url, target_url, target_normalized_url, crawl_id) VALUES (2, 'https://example.com/b', 'https://example.com/a', '/a', 1)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO links (source_url_id, source_url, target_url, target_normalized_url, crawl_id) VALUES (3, 'https://example.com/c', 'https://example.com/a', '/a', 1)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO links (source_url_id, source_url, target_url, target_normalized_url, crawl_id) VALUES (1, 'https://example.com/a', 'https://example.com/b', '/b', 1)",
            [],
        ).unwrap();

        // Before aggregation, inlinks_count should be 0
        let count_before: i64 = conn
            .query_row(
                "SELECT inlinks_count FROM urls WHERE normalized_url = '/a'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count_before, 0, "inlinks_count should default to 0");

        // Run aggregation
        update_inlinks_counts(&conn, 1).unwrap();

        // Verify: /a has 2 inlinks, /b has 1, /c has 0
        let inlinks_a: i64 = conn
            .query_row(
                "SELECT inlinks_count FROM urls WHERE normalized_url = '/a'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let inlinks_b: i64 = conn
            .query_row(
                "SELECT inlinks_count FROM urls WHERE normalized_url = '/b'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let inlinks_c: i64 = conn
            .query_row(
                "SELECT inlinks_count FROM urls WHERE normalized_url = '/c'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(inlinks_a, 2, "URL /a should have 2 inlinks");
        assert_eq!(inlinks_b, 1, "URL /b should have 1 inlink");
        assert_eq!(inlinks_c, 0, "URL /c should have 0 inlinks");
    }

    #[test]
    fn query_issues_by_crawl_filters_category_and_search() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE urls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL,
                crawl_id INTEGER
            );
            CREATE TABLE issues (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url_id INTEGER,
                url TEXT NOT NULL,
                issue_type TEXT NOT NULL,
                severity TEXT NOT NULL,
                category TEXT NOT NULL,
                message TEXT NOT NULL,
                details_json TEXT,
                detected_at TEXT NOT NULL,
                is_fixed INTEGER NOT NULL DEFAULT 0
            );
            INSERT INTO urls (id, url, crawl_id) VALUES
                (1, 'https://example.com/', 7),
                (2, 'https://example.com/about', 7),
                (3, 'https://example.com/private', 7);
            INSERT INTO issues (url_id, url, issue_type, severity, category, message, detected_at) VALUES
                (1, 'https://example.com/', 'missing_title', 'critical', 'content', 'Title tag is missing', '2026-05-14T08:00:00Z'),
                (2, 'https://example.com/about', 'missing_meta_description', 'warning', 'content', 'Meta description is missing', '2026-05-14T08:01:00Z'),
                (3, 'https://example.com/private', 'missing_hsts', 'warning', 'security', 'HSTS header is missing', '2026-05-14T08:02:00Z');
            ",
        )
        .unwrap();

        let (records, total) = query_issues_by_crawl(
            &conn,
            Some(7),
            0,
            50,
            None,
            Some("warning"),
            Some("content"),
            Some("meta"),
        )
        .unwrap();

        assert_eq!(total, 1);
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].issue_type, "missing_meta_description");
        assert_eq!(records[0].category, "content");
    }
}

pub fn update_crawl_counters(
    conn: &Connection,
    id: i64,
    url_count: i64,
    issue_count: i64,
    link_count: i64,
) -> Result<()> {
    conn.execute(
        "UPDATE crawls SET url_count = ?1, issue_count = ?2, link_count = ?3 WHERE id = ?4",
        params![url_count, issue_count, link_count, id],
    )?;
    Ok(())
}

/// After a crawl completes, aggregate inlinks_count for every URL in the crawl
/// by counting how many links point to each URL's normalized_url.
pub fn update_inlinks_counts(conn: &Connection, crawl_id: i64) -> Result<()> {
    conn.execute(
        "UPDATE urls SET inlinks_count = (SELECT COUNT(*) FROM links WHERE target_normalized_url = urls.normalized_url AND crawl_id = urls.crawl_id) WHERE crawl_id = ?1",
        params![crawl_id],
    )?;
    Ok(())
}

pub fn get_crawl(conn: &Connection, id: i64) -> Result<Option<Crawl>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, status, settings_json, started_at, completed_at, error_message, url_count, issue_count, link_count, created_at FROM crawls WHERE id = ?1"
    )?;

    stmt.query_row(params![id], |row| {
        Ok(Crawl {
            id: row.get("id")?,
            project_id: row.get("project_id")?,
            status: row.get("status")?,
            settings_json: row.get("settings_json")?,
            started_at: get_datetime_opt(row, "started_at")?,
            completed_at: get_datetime_opt(row, "completed_at")?,
            error_message: row.get("error_message")?,
            url_count: row.get("url_count")?,
            issue_count: row.get("issue_count")?,
            link_count: row.get("link_count")?,
            created_at: get_datetime(row, "created_at")?,
        })
    })
    .optional()
}

// ─── URLs ────────────────────────────────────────────────────────

pub fn query_urls(
    conn: &Connection,
    project_id: i64,
    crawl_id: Option<i64>,
    page: i64,
    page_size: i64,
    filter_indexability: Option<&str>,
    filter_status_category: Option<&str>,
    search: Option<&str>,
    sort_by: &str,
    sort_order: &str,
) -> Result<(Vec<UrlRecord>, i64)> {
    let mut where_parts = vec!["u.project_id = ?".to_string()];
    let mut params = vec![Value::Integer(project_id)];

    if let Some(crawl_id) = crawl_id {
        where_parts.push("u.crawl_id = ?".to_string());
        params.push(Value::Integer(crawl_id));
    }

    if let Some(filter) = filter_indexability {
        where_parts.push("u.indexability = ?".to_string());
        params.push(Value::Text(filter.to_string()));
    }

    // Filter by status code category (2xx, 3xx, 4xx, 5xx) — dedicated column instead of JSON extract
    if let Some(cat) = filter_status_category {
        match cat {
            "2xx" => {
                where_parts.push("u.status_code BETWEEN 200 AND 299".to_string());
            }
            "3xx" => {
                where_parts.push("u.status_code BETWEEN 300 AND 399".to_string());
            }
            "4xx" => {
                where_parts.push("u.status_code BETWEEN 400 AND 499".to_string());
            }
            "5xx" => {
                where_parts.push("u.status_code >= 500".to_string());
            }
            _ => {}
        }
    }

    // Search filter: match against url, title, meta_description — use dedicated columns
    if let Some(search_term) = search {
        if !search_term.is_empty() {
            let like_pattern = format!("%{}%", search_term.replace('%', "\\%").replace('_', "\\_"));
            where_parts.push("(u.url LIKE ? ESCAPE '\\' OR u.title LIKE ? ESCAPE '\\' OR u.meta_description LIKE ? ESCAPE '\\')".to_string());
            params.push(Value::Text(like_pattern.clone()));
            params.push(Value::Text(like_pattern.clone()));
            params.push(Value::Text(like_pattern));
        }
    }

    let where_clause = where_parts.join(" AND ");
    let count_query = format!("SELECT COUNT(*) FROM urls u WHERE {}", where_clause);
    let total: i64 = conn.query_row(&count_query, params_from_iter(params.iter()), |row| {
        row.get(0)
    })?;

    let skip = page.max(0) * page_size;
    let order_field = match sort_by {
        "fetched_at" | "fetchedAt" => "u.fetched_at",
        "depth" => "u.depth",
        "url" => "u.url",
        "indexability" => "u.indexability",
        "statusCode" | "status_code" => "u.status_code",
        "responseTimeMs" | "response_time_ms" => "u.response_time_ms",
        "title" => "u.title",
        _ => "u.id",
    };
    let order_dir = if sort_order == "desc" { "DESC" } else { "ASC" };

    let mut query_params = params;
    query_params.push(Value::Integer(page_size));
    query_params.push(Value::Integer(skip));

    // Select all dedicated columns for fast display, plus JSON blobs for inspector detail
    let mut stmt = conn.prepare(&format!(
        "SELECT id, url, project_id, crawl_id, normalized_url, final_url, status_code,
                content_type, title, title_length, meta_description, meta_description_length,
                h1, h1_count, word_count, canonical_url, meta_robots, response_time_ms,
                size_bytes, language, inlinks_count, outlinks_count, content_hash,
                indexability, depth, fetch_result_json, seo_data_json, discovered_at, fetched_at, last_crawled_at
         FROM urls u WHERE {}
         ORDER BY {} {} LIMIT ? OFFSET ?",
        where_clause, order_field, order_dir,
    ))?;

    let rows = stmt.query_map(params_from_iter(query_params.iter()), map_url_row)?;
    let records: Vec<UrlRecord> = rows.filter_map(|r| r.ok()).collect();

    Ok((records, total))
}

fn map_url_row(row: &rusqlite::Row) -> rusqlite::Result<UrlRecord> {
    Ok(UrlRecord {
        id: row.get("id")?,
        url: row.get("url")?,
        project_id: row.get("project_id")?,
        crawl_id: row.get("crawl_id")?,
        normalized_url: row.get("normalized_url")?,
        final_url: row.get("final_url")?,
        status_code: row.get("status_code")?,
        content_type: row.get("content_type")?,
        title: row.get("title")?,
        title_length: row.get("title_length")?,
        meta_description: row.get("meta_description")?,
        meta_description_length: row.get("meta_description_length")?,
        h1: row.get("h1")?,
        h1_count: row.get("h1_count")?,
        word_count: row.get("word_count")?,
        canonical_url: row.get("canonical_url")?,
        meta_robots: row.get("meta_robots")?,
        response_time_ms: row.get("response_time_ms")?,
        size_bytes: row.get("size_bytes")?,
        language: row.get("language")?,
        inlinks_count: row.get("inlinks_count")?,
        outlinks_count: row.get("outlinks_count")?,
        content_hash: row.get("content_hash")?,
        indexability: row.get("indexability")?,
        depth: row.get("depth")?,
        fetch_result_json: row.get("fetch_result_json")?,
        seo_data_json: row.get("seo_data_json")?,
        discovered_at: get_datetime_opt(row, "discovered_at")?,
        fetched_at: get_datetime_opt(row, "fetched_at")?,
        last_crawled_at: get_datetime_opt(row, "last_crawled_at")?,
    })
}

pub fn get_url_details(conn: &Connection, url_id: i64) -> Result<Option<UrlRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, url, project_id, crawl_id, normalized_url, final_url, status_code, content_type, title, title_length, meta_description, meta_description_length, h1, h1_count, word_count, canonical_url, meta_robots, response_time_ms, size_bytes, language, inlinks_count, outlinks_count, content_hash, indexability, depth, fetch_result_json, seo_data_json, discovered_at, fetched_at, last_crawled_at FROM urls WHERE id = ?1"
    )?;

    stmt.query_row(params![url_id], |row| {
        Ok(UrlRecord {
            id: row.get("id")?,
            url: row.get("url")?,
            project_id: row.get("project_id")?,
            crawl_id: row.get("crawl_id")?,
            normalized_url: row.get("normalized_url")?,
            final_url: row.get("final_url")?,
            status_code: row.get("status_code")?,
            content_type: row.get("content_type")?,
            title: row.get("title")?,
            title_length: row.get("title_length")?,
            meta_description: row.get("meta_description")?,
            meta_description_length: row.get("meta_description_length")?,
            h1: row.get("h1")?,
            h1_count: row.get("h1_count")?,
            word_count: row.get("word_count")?,
            canonical_url: row.get("canonical_url")?,
            meta_robots: row.get("meta_robots")?,
            response_time_ms: row.get("response_time_ms")?,
            size_bytes: row.get("size_bytes")?,
            language: row.get("language")?,
            inlinks_count: row.get("inlinks_count")?,
            outlinks_count: row.get("outlinks_count")?,
            content_hash: row.get("content_hash")?,
            indexability: row.get("indexability")?,
            depth: row.get("depth")?,
            fetch_result_json: row.get("fetch_result_json")?,
            seo_data_json: row.get("seo_data_json")?,
            discovered_at: get_datetime_opt(row, "discovered_at")?,
            fetched_at: get_datetime_opt(row, "fetched_at")?,
            last_crawled_at: get_datetime_opt(row, "last_crawled_at")?,
        })
    })
    .optional()
}

// ─── Issues ──────────────────────────────────────────────────────

pub fn get_issue_summary(conn: &Connection, project_id: i64) -> Result<Vec<IssueSummary>> {
    let mut stmt = conn.prepare(
        "SELECT i.issue_type, i.severity, i.category, COUNT(*) as count
         FROM issues i
         JOIN urls u ON i.url_id = u.id
         WHERE u.project_id = ?1
         GROUP BY i.issue_type, i.severity, i.category
         ORDER BY count DESC",
    )?;

    let summaries: Vec<IssueSummary> = stmt
        .query_map(params![project_id], |row| {
            let issue_type: String = row.get("issue_type")?;
            let severity: String = row.get("severity")?;
            let category: String = row.get("category")?;
            let count: i64 = row.get("count")?;
            let (label, explanation, recommendation) =
                derive_issue_context(&issue_type, &severity, &category);
            Ok(IssueSummary {
                issue_type,
                severity,
                category,
                count,
                label: Some(label),
                explanation: Some(explanation),
                recommendation: Some(recommendation),
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(summaries)
}

pub fn query_issues(
    conn: &Connection,
    project_id: i64,
    page: i64,
    page_size: i64,
    filter_type: Option<&str>,
    filter_severity: Option<&str>,
) -> Result<(Vec<IssueRecord>, i64)> {
    // Count total
    let count_query = format!(
        "SELECT COUNT(*) FROM issues i JOIN urls u ON i.url_id = u.id WHERE u.project_id = ?1 {} {}",
        filter_type.map(|t| "AND i.issue_type = ?2").unwrap_or_default(),
        filter_severity.map(|s| "AND i.severity = ?3").unwrap_or_default()
    );

    let total: i64 = match (filter_type, filter_severity) {
        (Some(t), Some(s)) => conn.query_row(
            "SELECT COUNT(*) FROM issues i JOIN urls u ON i.url_id = u.id WHERE u.project_id = ?1 AND i.issue_type = ?2 AND i.severity = ?3",
            params![project_id, t, s],
            |row| row.get(0),
        )?,
        (Some(t), None) => conn.query_row(
            "SELECT COUNT(*) FROM issues i JOIN urls u ON i.url_id = u.id WHERE u.project_id = ?1 AND i.issue_type = ?2",
            params![project_id, t],
            |row| row.get(0),
        )?,
        (None, Some(s)) => conn.query_row(
            "SELECT COUNT(*) FROM issues i JOIN urls u ON i.url_id = u.id WHERE u.project_id = ?1 AND i.severity = ?2",
            params![project_id, s],
            |row| row.get(0),
        )?,
        (None, None) => conn.query_row(
            "SELECT COUNT(*) FROM issues i JOIN urls u ON i.url_id = u.id WHERE u.project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )?,
    };

    // Get paginated results — use positional ? placeholders
    let skip = page.max(0) * page_size;

    let filter_where = match (filter_type, filter_severity) {
        (Some(_), Some(_)) => "AND i.issue_type = ? AND i.severity = ?",
        (Some(_), None) => "AND i.issue_type = ?",
        (None, Some(_)) => "AND i.severity = ?",
        (None, None) => "",
    };

    let mut stmt = conn.prepare(&format!(
        "SELECT i.id, i.issue_type, i.severity, i.category, i.url_id, i.url, i.message, i.details_json, i.detected_at, i.is_fixed
         FROM issues i JOIN urls u ON i.url_id = u.id WHERE u.project_id = ?1 {}
         ORDER BY i.detected_at DESC LIMIT ? OFFSET ?",
        filter_where
    ))?;

    let mut issue_params: Vec<Value> = vec![Value::Integer(project_id)];
    if let Some(t) = filter_type {
        issue_params.push(Value::Text(t.to_string()));
    }
    if let Some(s) = filter_severity {
        issue_params.push(Value::Text(s.to_string()));
    }
    issue_params.push(Value::Integer(page_size));
    issue_params.push(Value::Integer(skip));

    let records: Vec<IssueRecord> = stmt
        .query_map(params_from_iter(issue_params.iter()), |row| {
            Ok(IssueRecord {
                id: row.get("id")?,
                issue_type: row.get("issue_type")?,
                severity: row.get("severity")?,
                category: row.get("category")?,
                url_id: row.get("url_id")?,
                url: row.get("url")?,
                message: row.get("message")?,
                details_json: row.get("details_json")?,
                detected_at: get_datetime(row, "detected_at")?,
                is_fixed: row.get("is_fixed")?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok((records, total))
}

fn map_issue_row(row: &rusqlite::Row) -> rusqlite::Result<IssueRecord> {
    Ok(IssueRecord {
        id: row.get("id")?,
        issue_type: row.get("issue_type")?,
        severity: row.get("severity")?,
        category: row.get("category")?,
        url_id: row.get("url_id")?,
        url: row.get("url")?,
        message: row.get("message")?,
        details_json: row.get("details_json")?,
        detected_at: get_datetime(row, "detected_at")?,
        is_fixed: row.get("is_fixed")?,
    })
}

// ─── Links ───────────────────────────────────────────────────────

pub fn query_links(
    conn: &Connection,
    project_id: i64,
    page: i64,
    page_size: i64,
    filter_relation: Option<&str>,
) -> Result<(Vec<LinkRecord>, i64)> {
    let count_query = format!(
        "SELECT COUNT(*) FROM links l JOIN urls u ON l.source_url_id = u.id WHERE u.project_id = ?1 {}",
        filter_relation.map(|r| "AND l.link_relation = ?2").unwrap_or_default()
    );

    let total: i64 = if let Some(rel) = filter_relation {
        conn.query_row(
            "SELECT COUNT(*) FROM links l JOIN urls u ON l.source_url_id = u.id WHERE u.project_id = ?1 AND l.link_relation = ?2",
            params![project_id, rel],
            |row| row.get(0),
        )?
    } else {
        conn.query_row(
            "SELECT COUNT(*) FROM links l JOIN urls u ON l.source_url_id = u.id WHERE u.project_id = ?1",
            params![project_id],
            |row| row.get(0),
        )?
    };

    let skip = page.max(0) * page_size;

    let filter_where = match filter_relation {
        Some(_) => "AND l.link_relation = ?",
        None => "",
    };

    let mut stmt = conn.prepare(&format!(
        "SELECT l.id, l.source_url_id, l.source_url, l.target_url, l.link_relation, l.anchor_text, l.is_internal, l.is_no_follow, l.detected_at
         FROM links l JOIN urls u ON l.source_url_id = u.id WHERE u.project_id = ?1 {}
         ORDER BY l.detected_at DESC LIMIT ? OFFSET ?",
        filter_where
    ))?;

    let mut link_params: Vec<Value> = vec![Value::Integer(project_id)];
    if let Some(rel) = filter_relation {
        link_params.push(Value::Text(rel.to_string()));
    }
    link_params.push(Value::Integer(page_size));
    link_params.push(Value::Integer(skip));

    let records: Vec<LinkRecord> = stmt
        .query_map(params_from_iter(link_params.iter()), |row| {
            Ok(LinkRecord {
                id: row.get("id")?,
                source_url_id: row.get("source_url_id")?,
                source_url: row.get("source_url")?,
                target_url: row.get("target_url")?,
                link_relation: row.get("link_relation")?,
                anchor_text: row.get("anchor_text")?,
                is_internal: row.get("is_internal")?,
                is_no_follow: row.get("is_no_follow")?,
                detected_at: get_datetime(row, "detected_at")?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok((records, total))
}

pub fn summarize_links(conn: &Connection, project_id: i64) -> Result<LinkSummary> {
    let mut stmt = conn.prepare(
        "SELECT 
            COUNT(*) as total_links,
            SUM(CASE WHEN is_internal = 1 THEN 1 ELSE 0 END) as internal_links,
            SUM(CASE WHEN is_internal = 0 THEN 1 ELSE 0 END) as external_links,
            SUM(CASE WHEN is_no_follow = 1 THEN 1 ELSE 0 END) as nofollow_links
         FROM links l JOIN urls u ON l.source_url_id = u.id WHERE u.project_id = ?1",
    )?;

    let (total, internal, external, nofollow): (i64, i64, i64, i64) = stmt
        .query_row(params![project_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?;

    // Get relation counts
    let mut rel_stmt = conn.prepare(
        "SELECT link_relation, COUNT(*) as count FROM links l JOIN urls u ON l.source_url_id = u.id WHERE u.project_id = ?1 GROUP BY link_relation ORDER BY count DESC"
    )?;

    let relation_counts: Vec<LinkRelationCount> = rel_stmt
        .query_map(params![project_id], |row| {
            Ok(LinkRelationCount {
                relation: row.get("link_relation")?,
                count: row.get("count")?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    // Compute broken links: targets where the linked URL has a 4xx/5xx status
    let broken_count: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT l.target_url)
         FROM links l
         JOIN urls u ON l.source_url_id = u.id
         JOIN urls t ON (
             t.normalized_url = l.target_url
             OR t.url = l.target_url
             OR t.final_url = l.target_url
         )
         WHERE u.project_id = ?1 AND t.status_code >= 400",
            params![project_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(LinkSummary {
        total_links: total,
        total_internal: internal,
        total_external: external,
        nofollow_links: nofollow,
        broken_count,
        link_relation_counts: relation_counts,
    })
}

// ─── Insert Issues for a URL (used during crawl persistence) ────

pub fn insert_issues_for_url(
    conn: &mut Connection,
    url_id: i64,
    url: &str,
    issues: &[(&str, &str, &str, &str, Option<&str>)],
) -> Result<usize> {
    // Each tuple: (issue_type, severity, category, message, details_json)
    if issues.is_empty() {
        return Ok(0);
    }

    let now = Utc::now().to_rfc3339();
    let tx = conn.transaction()?;

    let count = {
        let mut stmt = tx.prepare(
            "INSERT INTO issues (url_id, url, issue_type, severity, category, message, details_json, detected_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
        )?;

        let mut count = 0usize;
        for (issue_type, severity, category, message, details_json) in issues {
            stmt.execute(params![
                url_id,
                url,
                issue_type,
                severity,
                category,
                message,
                details_json.unwrap_or("null"),
                &now,
            ])?;
            count += 1;
        }
        count
    };

    tx.commit()?;
    Ok(count)
}

// ─── Insert Links for a URL (used during crawl persistence) ──────

pub fn insert_links_for_url(
    conn: &mut Connection,
    url_id: i64,
    source_url: &str,
    links: &[(&str, &str, &str, bool, bool)],
) -> Result<usize> {
    // Each tuple: (target_url, link_relation, anchor_text, is_internal, is_no_follow)
    if links.is_empty() {
        return Ok(0);
    }

    let now = Utc::now().to_rfc3339();
    let tx = conn.transaction()?;

    let count = {
        let mut stmt = tx.prepare(
            "INSERT INTO links (source_url_id, source_url, target_url, link_relation, anchor_text, is_internal, is_no_follow, detected_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
        )?;

        let mut count = 0usize;
        for (target_url, link_relation, anchor_text, is_internal, is_no_follow) in links {
            stmt.execute(params![
                url_id,
                source_url,
                target_url,
                link_relation,
                anchor_text,
                *is_internal,
                *is_no_follow,
                &now,
            ])?;
            count += 1;
        }
        count
    };

    tx.commit()?;
    Ok(count)
}

// ─── List Crawls for a Project ──────────────────────────────────

pub fn list_crawls(conn: &Connection, project_id: i64) -> Result<Vec<Crawl>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, status, settings_json, started_at, completed_at, error_message, url_count, issue_count, link_count, created_at FROM crawls WHERE project_id = ?1 ORDER BY created_at DESC"
    )?;

    let crawls = stmt.query_map(params![project_id], |row| {
        Ok(Crawl {
            id: row.get("id")?,
            project_id: row.get("project_id")?,
            status: row.get("status")?,
            settings_json: row.get("settings_json")?,
            started_at: get_datetime_opt(row, "started_at")?,
            completed_at: get_datetime_opt(row, "completed_at")?,
            error_message: row.get("error_message")?,
            url_count: row.get("url_count")?,
            issue_count: row.get("issue_count")?,
            link_count: row.get("link_count")?,
            created_at: get_datetime(row, "created_at")?,
        })
    })?;

    Ok(crawls.filter_map(|r| r.ok()).collect())
}

// ─── Crawl-level Issue Queries ──────────────────────────────────

pub fn get_issue_summary_by_crawl(conn: &Connection, crawl_id: i64) -> Result<Vec<IssueSummary>> {
    let mut stmt = conn.prepare(
        "SELECT i.issue_type, i.severity, i.category, COUNT(*) as count
         FROM issues i
         JOIN urls u ON i.url_id = u.id
         WHERE u.crawl_id = ?1
         GROUP BY i.issue_type, i.severity, i.category
         ORDER BY count DESC",
    )?;

    let summaries: Vec<IssueSummary> = stmt
        .query_map(params![crawl_id], |row| {
            let issue_type: String = row.get("issue_type")?;
            let severity: String = row.get("severity")?;
            let category: String = row.get("category")?;
            let count: i64 = row.get("count")?;
            let (label, explanation, recommendation) =
                derive_issue_context(&issue_type, &severity, &category);
            Ok(IssueSummary {
                issue_type,
                severity,
                category,
                count,
                label: Some(label),
                explanation: Some(explanation),
                recommendation: Some(recommendation),
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(summaries)
}

// ─── Crawl-level Issue Queries with Filters ─────────────────────
pub fn query_issues_by_crawl(
    conn: &Connection,
    crawl_id: Option<i64>,
    page: i64,
    page_size: i64,
    filter_type: Option<&str>,
    filter_severity: Option<&str>,
    filter_category: Option<&str>,
    search: Option<&str>,
) -> Result<(Vec<IssueRecord>, i64)> {
    let mut where_parts: Vec<String> = Vec::new();
    let mut all_params: Vec<Value> = Vec::new();

    if let Some(cid) = crawl_id {
        where_parts.push("u.crawl_id = ?".to_string());
        all_params.push(Value::Integer(cid));
    }

    if let Some(t) = filter_type.filter(|value| !value.trim().is_empty() && *value != "all") {
        where_parts.push("i.issue_type = ?".to_string());
        all_params.push(Value::Text(t.to_string()));
    }
    if let Some(s) = filter_severity.filter(|value| !value.trim().is_empty() && *value != "all") {
        where_parts.push("i.severity = ?".to_string());
        all_params.push(Value::Text(s.to_string()));
    }
    if let Some(c) = filter_category.filter(|value| !value.trim().is_empty() && *value != "all") {
        where_parts.push("i.category = ?".to_string());
        all_params.push(Value::Text(c.to_string()));
    }
    if let Some(term) = search.map(str::trim).filter(|value| !value.is_empty()) {
        let pattern = format!("%{}%", term);
        where_parts.push(
            "(i.url LIKE ? OR i.message LIKE ? OR i.issue_type LIKE ? OR i.category LIKE ?)"
                .to_string(),
        );
        for _ in 0..4 {
            all_params.push(Value::Text(pattern.clone()));
        }
    }

    let where_clause = if where_parts.is_empty() {
        "1=1".to_string()
    } else {
        where_parts.join(" AND ")
    };

    let count_query = format!(
        "SELECT COUNT(*) FROM issues i JOIN urls u ON i.url_id = u.id WHERE {}",
        where_clause
    );
    let total: i64 = conn.query_row(&count_query, params_from_iter(all_params.iter()), |row| {
        row.get(0)
    })?;

    let skip = page.max(0) * page_size;

    let query = format!(
        "SELECT i.id, i.issue_type, i.severity, i.category, i.url_id, i.url, i.message, i.details_json, i.detected_at, i.is_fixed
         FROM issues i JOIN urls u ON i.url_id = u.id WHERE {}
         ORDER BY i.detected_at DESC LIMIT ? OFFSET ?",
        where_clause
    );

    let mut query_params: Vec<Value> = all_params.clone();
    query_params.push(Value::Integer(page_size));
    query_params.push(Value::Integer(skip));

    let mut stmt = conn.prepare(&query)?;

    let records: Vec<IssueRecord> = stmt
        .query_map(params_from_iter(query_params.iter()), |row| {
            Ok(IssueRecord {
                id: row.get("id")?,
                issue_type: row.get("issue_type")?,
                severity: row.get("severity")?,
                category: row.get("category")?,
                url_id: row.get("url_id")?,
                url: row.get("url")?,
                message: row.get("message")?,
                details_json: row.get("details_json")?,
                detected_at: get_datetime(row, "detected_at")?,
                is_fixed: row.get("is_fixed")?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok((records, total))
}

pub fn get_issue_by_id(conn: &Connection, issue_id: i64) -> Result<Option<IssueRecord>> {
    let mut stmt = conn.prepare(
        "SELECT i.id, i.issue_type, i.severity, i.category, i.url_id, i.url, i.message, i.details_json, i.detected_at, i.is_fixed
         FROM issues i WHERE i.id = ?1"
    )?;

    stmt.query_row(params![issue_id], |row| {
        Ok(IssueRecord {
            id: row.get("id")?,
            issue_type: row.get("issue_type")?,
            severity: row.get("severity")?,
            category: row.get("category")?,
            url_id: row.get("url_id")?,
            url: row.get("url")?,
            message: row.get("message")?,
            details_json: row.get("details_json")?,
            detected_at: get_datetime(row, "detected_at")?,
            is_fixed: row.get("is_fixed")?,
        })
    })
    .optional()
}

// ─── Crawl-level Link Queries ───────────────────────────────────

pub fn query_links_by_crawl(
    conn: &Connection,
    crawl_id: Option<i64>,
    page: i64,
    page_size: i64,
    filter_relation: Option<&str>,
    filter_is_internal: Option<bool>,
) -> Result<(Vec<LinkRecord>, i64)> {
    let where_parts = match crawl_id {
        Some(_cid) => vec!["u.crawl_id = ?1".to_string()],
        None => vec![],
    };

    let mut all_params: Vec<Value> = crawl_id.map(|c| Value::Integer(c)).into_iter().collect();

    let mut filter_clauses: Vec<String> = Vec::new();
    if let Some(rel) = filter_relation {
        filter_clauses.push("l.link_relation = ?".to_string());
        all_params.push(Value::Text(rel.to_string()));
    }
    if let Some(internal) = filter_is_internal {
        filter_clauses.push(format!("l.is_internal = {}", if internal { 1 } else { 0 }));
    }

    let mut base_where = where_parts.clone();
    base_where.extend(filter_clauses);
    let where_clause = if base_where.is_empty() {
        "1=1"
    } else {
        &base_where.join(" AND ")
    };

    // Count total
    let count_query = format!(
        "SELECT COUNT(*) FROM links l JOIN urls u ON l.source_url_id = u.id WHERE {}",
        where_clause
    );
    let total: i64 = conn.query_row(&count_query, params_from_iter(all_params.iter()), |row| {
        row.get(0)
    })?;

    // Get paginated results — use positional ? placeholders
    // (rusqlite params_from_iter assigns parameters in order regardless of number)
    let skip = page.max(0) * page_size;

    let mut select_where = where_parts.clone();
    if filter_relation.is_some() {
        select_where.push("l.link_relation = ?".to_string());
    }
    if let Some(internal) = filter_is_internal {
        select_where.push(format!("l.is_internal = {}", if internal { 1 } else { 0 }));
    }
    let select_clause = if select_where.is_empty() {
        "1=1"
    } else {
        &select_where.join(" AND ")
    };

    let query = format!(
        "SELECT l.id, l.source_url_id, l.source_url, l.target_url, l.link_relation, l.anchor_text, l.is_internal, l.is_no_follow, l.detected_at
         FROM links l JOIN urls u ON l.source_url_id = u.id WHERE {}
         ORDER BY l.detected_at DESC LIMIT ? OFFSET ?",
        select_clause
    );

    // Build params: all_params already has base + filter values; just add pagination
    let mut query_params: Vec<Value> = all_params.clone();
    query_params.push(Value::Integer(page_size));
    query_params.push(Value::Integer(skip));

    let mut stmt = conn.prepare(&query)?;

    let records: Vec<LinkRecord> = stmt
        .query_map(params_from_iter(query_params.iter()), |row| {
            Ok(LinkRecord {
                id: row.get("id")?,
                source_url_id: row.get("source_url_id")?,
                source_url: row.get("source_url")?,
                target_url: row.get("target_url")?,
                link_relation: row.get("link_relation")?,
                anchor_text: row.get("anchor_text")?,
                is_internal: row.get("is_internal")?,
                is_no_follow: row.get("is_no_follow")?,
                detected_at: get_datetime(row, "detected_at")?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok((records, total))
}

pub fn summarize_links_by_crawl(conn: &Connection, crawl_id: i64) -> Result<LinkSummary> {
    let mut stmt = conn.prepare(
        "SELECT 
            COUNT(*) as total_links,
            SUM(CASE WHEN is_internal = 1 THEN 1 ELSE 0 END) as internal_links,
            SUM(CASE WHEN is_internal = 0 THEN 1 ELSE 0 END) as external_links,
            SUM(CASE WHEN is_no_follow = 1 THEN 1 ELSE 0 END) as nofollow_links
         FROM links l JOIN urls u ON l.source_url_id = u.id WHERE u.crawl_id = ?1",
    )?;

    let (total, internal, external, nofollow): (i64, i64, i64, i64) = stmt
        .query_row(params![crawl_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?;

    // Get relation counts
    let mut rel_stmt = conn.prepare(
        "SELECT link_relation, COUNT(*) as count FROM links l JOIN urls u ON l.source_url_id = u.id WHERE u.crawl_id = ?1 GROUP BY link_relation ORDER BY count DESC"
    )?;

    let relation_counts: Vec<LinkRelationCount> = rel_stmt
        .query_map(params![crawl_id], |row| {
            Ok(LinkRelationCount {
                relation: row.get("link_relation")?,
                count: row.get("count")?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    // Compute broken links for this crawl
    let broken_count: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT l.target_url)
             FROM links l
             JOIN urls u ON l.source_url_id = u.id
             JOIN urls t ON (
                 t.normalized_url = l.target_url
                 OR t.url = l.target_url
                 OR t.final_url = l.target_url
             )
             WHERE u.crawl_id = ?1 AND t.status_code >= 400",
            params![crawl_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(LinkSummary {
        total_links: total,
        total_internal: internal,
        total_external: external,
        nofollow_links: nofollow,
        broken_count,
        link_relation_counts: relation_counts,
    })
}

// ─── Crawl-level URL Query ──────────────────────────────────────

pub fn query_urls_by_crawl(
    conn: &Connection,
    crawl_id: i64,
    page: i64,
    page_size: i64,
    filter_indexability: Option<&str>,
    sort_by: &str,
    sort_order: &str,
) -> Result<(Vec<UrlRecord>, i64)> {
    let mut where_parts = vec!["u.crawl_id = ?1".to_string()];
    let mut count_params: Vec<Value> = vec![Value::Integer(crawl_id)];

    if let Some(filter) = filter_indexability {
        where_parts.push("u.indexability = ?".to_string());
        count_params.push(Value::Text(filter.to_string()));
    }

    let where_clause = where_parts.join(" AND ");
    let count_query = format!("SELECT COUNT(*) FROM urls u WHERE {}", where_clause);
    let total: i64 =
        conn.query_row(&count_query, params_from_iter(count_params.iter()), |row| {
            row.get(0)
        })?;

    let skip = page.max(0) * page_size;
    let order_field = match sort_by {
        "fetched_at" => "u.fetched_at",
        "depth" => "u.depth",
        "url" => "u.url",
        "indexability" => "u.indexability",
        _ => "u.id",
    };
    let order_dir = if sort_order == "desc" { "DESC" } else { "ASC" };

    let mut query_params = count_params;
    query_params.push(Value::Integer(page_size));
    query_params.push(Value::Integer(skip));

    let mut stmt = conn.prepare(&format!(
        "SELECT id, url, project_id, crawl_id, fetch_result_json, seo_data_json, indexability, depth, discovered_at, fetched_at, last_crawled_at
         FROM urls u WHERE {}
         ORDER BY {} {} LIMIT ? OFFSET ?",
        where_clause, order_field, order_dir,
    ))?;

    let rows = stmt.query_map(params_from_iter(query_params.iter()), map_url_row)?;
    let records: Vec<UrlRecord> = rows.filter_map(|r| r.ok()).collect();

    Ok((records, total))
}

/// Fetch all URL records for a crawl (no pagination) — used for post-crawl analysis.
/// Returns SEO data and fetch results deserialized from their JSON columns.
pub fn get_all_url_records_for_crawl(conn: &Connection, crawl_id: i64) -> Result<Vec<UrlRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, url, project_id, crawl_id, fetch_result_json, seo_data_json, indexability, depth, discovered_at, fetched_at, last_crawled_at,
                normalized_url, final_url, status_code, content_type, title, title_length,
                meta_description, meta_description_length, h1, h1_count, word_count,
                canonical_url, meta_robots, response_time_ms, size_bytes, language,
                inlinks_count, outlinks_count, content_hash
         FROM urls WHERE crawl_id = ?1 ORDER BY id",
    )?;
    let rows = stmt.query_map(params![crawl_id], map_url_row)?;
    let records: Vec<UrlRecord> = rows.filter_map(|r| r.ok()).collect();
    Ok(records)
}
