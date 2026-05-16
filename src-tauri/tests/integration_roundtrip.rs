//! Integration tests: schema-level checks that complement the writer unit tests.
//!
//! The writer unit tests (in src/core/storage/writer.rs) test the production
//! `insert_page_crawled` code path end-to-end. These integration tests verify
//! schema constraints and query patterns that operate at the DB level:
//! - UNIQUE constraint on (crawl_id, url)
//! - FK deletion order (issues → links → urls)
//! - Status code filtering on dedicated columns
//! - Text search on dedicated columns

use rusqlite::Connection;
use std::collections::HashMap;

use crawldesk_lib::core::crawler::models::{FetchResult, IssueCategory, IssueSeverity, SeoIssue};
use crawldesk_lib::core::crawler::parser::parse_html;
use crawldesk_lib::core::crawler::post_crawl::run_post_crawl_analysis;
use crawldesk_lib::core::storage::queries;

/// Create an in-memory database with the full production schema matching db.rs.
/// Uses raw SQL since integration tests are a separate crate and cannot access
/// private modules in the library.
fn setup_db() -> Connection {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
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
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (project_id) REFERENCES projects(id)
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
            x_robots_tag TEXT,
            response_time_ms REAL,
            size_bytes INTEGER,
            language TEXT,
            inlinks_count INTEGER DEFAULT 0,
            outlinks_count INTEGER DEFAULT 0,
            content_hash TEXT,
            crawl_source TEXT DEFAULT 'spider',
            fetch_result_json TEXT,
            seo_data_json TEXT,
            indexability TEXT NOT NULL DEFAULT 'unknown',
            depth INTEGER NOT NULL DEFAULT 0,
            discovered_at TEXT,
            fetched_at TEXT,
            last_crawled_at TEXT,
            FOREIGN KEY (project_id) REFERENCES projects(id),
            FOREIGN KEY (crawl_id) REFERENCES crawls(id) ON DELETE SET NULL,
            UNIQUE(crawl_id, url)
        );
        CREATE TABLE links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_url_id INTEGER NOT NULL,
            source_url TEXT NOT NULL,
            target_url TEXT NOT NULL,
            target_normalized_url TEXT,
            link_relation TEXT NOT NULL DEFAULT 'html_a',
            link_type TEXT DEFAULT 'html_a',
            anchor_text TEXT,
            is_internal INTEGER NOT NULL DEFAULT 1,
            is_no_follow INTEGER NOT NULL DEFAULT 0,
            is_followed INTEGER NOT NULL DEFAULT 1,
            detected_at TEXT NOT NULL DEFAULT (datetime('now')),
            crawl_id INTEGER,
            FOREIGN KEY (source_url_id) REFERENCES urls(id) ON DELETE CASCADE
        );
        CREATE TABLE issues (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_type TEXT NOT NULL,
            severity TEXT NOT NULL,
            category TEXT NOT NULL,
            url_id INTEGER,
            url TEXT NOT NULL,
            message TEXT NOT NULL,
            details_json TEXT,
            detected_at TEXT NOT NULL DEFAULT (datetime('now')),
            is_fixed INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE SET NULL
        );
        CREATE INDEX idx_links_crawl ON links(crawl_id);
        CREATE INDEX idx_urls_status_code ON urls(crawl_id, status_code);
        CREATE INDEX idx_urls_title ON urls(crawl_id, title);
        ",
    )
    .unwrap();
    conn
}

fn severity_str(severity: &IssueSeverity) -> &'static str {
    match severity {
        IssueSeverity::Critical => "critical",
        IssueSeverity::Warning => "warning",
        IssueSeverity::Info => "info",
    }
}

fn category_str(category: &IssueCategory) -> &'static str {
    match category {
        IssueCategory::Content => "content",
        IssueCategory::Structure => "structure",
        IssueCategory::Links => "links",
        IssueCategory::Performance => "performance",
        IssueCategory::Security => "security",
        IssueCategory::Social => "social",
        IssueCategory::Technical => "technical",
        IssueCategory::Internationalization => "internationalization",
        IssueCategory::Canonical => "canonical",
        IssueCategory::Hreflang => "hreflang",
        IssueCategory::Image => "image",
        IssueCategory::StructuredData => "structured_data",
        IssueCategory::Amp => "amp",
        IssueCategory::Rendering => "rendering",
        IssueCategory::Sitemap => "sitemap",
    }
}

fn fetch_result(url: &str, status_code: i32, html: &str) -> FetchResult {
    FetchResult {
        status_code,
        final_url: url.to_string(),
        requested_url: url.to_string(),
        headers: HashMap::new(),
        content_type: Some("text/html".to_string()),
        content_length: Some(html.len()),
        response_time_ms: 25.0,
        is_redirect: false,
        redirect_count: 0,
        was_js_rendered: false,
        html_content: Some(html.to_string()),
        error_message: None,
    }
}

fn insert_detected_issues(conn: &mut Connection, issues: &[SeoIssue]) {
    for issue in issues {
        let url_id: i64 = conn
            .query_row("SELECT id FROM urls WHERE url = ?1", [&issue.url], |row| {
                row.get(0)
            })
            .unwrap();
        let details = serde_json::to_string(&issue.details).unwrap();
        let tuple = [(
            issue.issue_type.as_str(),
            severity_str(&issue.severity),
            category_str(&issue.category),
            issue.message.as_str(),
            Some(details.as_str()),
        )];
        queries::insert_issues_for_url(conn, url_id, &issue.url, &tuple).unwrap();
    }
}

#[test]
fn test_status_code_filtering() {
    let conn = setup_db();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO projects (name, root_url) VALUES ('Filter', 'https://f.test')",
        [],
    )
    .unwrap();
    conn.execute("INSERT INTO crawls (project_id) VALUES (1)", [])
        .unwrap();

    for (i, code) in [200, 200, 200, 301, 404, 500].iter().enumerate() {
        conn.execute(
            "INSERT INTO urls (url, project_id, crawl_id, status_code, indexability, depth,
                 fetch_result_json, seo_data_json, discovered_at, fetched_at, last_crawled_at)
             VALUES (?1, 1, 1, ?2, 'indexable', 1, '{}', '{}', ?3, ?3, ?3)",
            rusqlite::params![format!("https://f.test/p{}", i + 1), code, now],
        )
        .unwrap();
    }

    // Verify status code range filtering against dedicated column
    let count_2xx: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM urls WHERE status_code BETWEEN 200 AND 299",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count_2xx, 3, "Should have 3 URLs with 2xx status");

    let count_4xx: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM urls WHERE status_code BETWEEN 400 AND 499",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count_4xx, 1, "Should have 1 URL with 4xx status");

    let count_5xx: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM urls WHERE status_code >= 500",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count_5xx, 1, "Should have 1 URL with 5xx status");

    let count_all: i64 = conn
        .query_row("SELECT COUNT(*) FROM urls", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count_all, 6, "Should have all 6 URLs");

    let (exact_404, exact_404_total) = queries::query_urls(
        &conn,
        1,
        Some(1),
        0,
        50,
        None,
        Some("4xx"),
        Some(404),
        None,
        None,
        "url",
        "asc",
    )
    .unwrap();
    assert_eq!(exact_404_total, 1);
    assert_eq!(exact_404[0].status_code, Some(404));

    let (other_4xx, other_4xx_total) = queries::query_urls(
        &conn,
        1,
        Some(1),
        0,
        50,
        None,
        Some("4xx"),
        None,
        Some(&[403, 404, 410]),
        None,
        "url",
        "asc",
    )
    .unwrap();
    assert_eq!(other_4xx_total, 0);
    assert!(other_4xx.is_empty());
}

#[test]
fn test_fixture_crawl_to_db_issue_query() {
    let mut conn = setup_db();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO projects (name, root_url) VALUES ('Issues', 'https://i.test')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO crawls (project_id, status) VALUES (1, 'completed')",
        [],
    )
    .unwrap();

    let en_url = "https://i.test/en/";
    let de_url = "https://i.test/de/";
    let en_html = r#"
        <html>
          <head><link rel="alternate" hreflang="de" href="/de/"></head>
          <body><h1>English</h1></body>
        </html>
    "#;
    let de_html = r#"
        <html>
          <body><h1>Deutsch</h1></body>
        </html>
    "#;

    for (url, html) in [(en_url, en_html), (de_url, de_html)] {
        conn.execute(
            "INSERT INTO urls (url, project_id, crawl_id, status_code, indexability, depth,
                 fetch_result_json, seo_data_json, discovered_at, fetched_at, last_crawled_at)
             VALUES (?1, 1, 1, 200, 'indexable', 0, '{}', ?2, ?3, ?3, ?3)",
            rusqlite::params![
                url,
                serde_json::to_string(&parse_html(url, html)).unwrap(),
                now
            ],
        )
        .unwrap();
    }

    let seo_data_map = HashMap::from([
        (en_url.to_string(), parse_html(en_url, en_html)),
        (de_url.to_string(), parse_html(de_url, de_html)),
    ]);
    let fetch_results = HashMap::from([
        (en_url.to_string(), fetch_result(en_url, 200, en_html)),
        (de_url.to_string(), fetch_result(de_url, 200, de_html)),
    ]);

    let detected = run_post_crawl_analysis(&[], &seo_data_map, &fetch_results);
    let expected: Vec<SeoIssue> = detected
        .into_iter()
        .filter(|issue| issue.issue_type == "hreflang_missing_reciprocal")
        .collect();
    assert_eq!(expected.len(), 1);

    insert_detected_issues(&mut conn, &expected);

    let (records, total) = queries::query_issues_by_crawl(
        &conn,
        Some(1),
        0,
        20,
        Some("hreflang_missing_reciprocal"),
        Some("warning"),
        Some("internationalization"),
        Some("reciprocal"),
    )
    .unwrap();

    assert_eq!(total, 1);
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].issue_type, "hreflang_missing_reciprocal");
    assert_eq!(records[0].url, en_url);
}

#[test]
fn test_text_search_on_dedicated_columns() {
    let conn = setup_db();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO projects (name, root_url) VALUES ('Search', 'https://s.test')",
        [],
    )
    .unwrap();
    conn.execute("INSERT INTO crawls (project_id) VALUES (1)", [])
        .unwrap();

    let entries = [
        (
            "https://s.test/home",
            "Homepage - Search Test",
            "Welcome to our site",
        ),
        ("https://s.test/about", "About Us", "Learn more about us"),
        (
            "https://s.test/products",
            "Our Products",
            "Browse our products catalog",
        ),
    ];

    for (url, title, desc) in &entries {
        conn.execute(
            "INSERT INTO urls (url, project_id, crawl_id, title, meta_description,
                 status_code, indexability, depth, fetch_result_json, seo_data_json,
                 discovered_at, fetched_at, last_crawled_at)
             VALUES (?1, 1, 1, ?2, ?3, 200, 'indexable', 0, '{}', '{}', ?4, ?4, ?4)",
            rusqlite::params![url, title, desc, now],
        )
        .unwrap();
    }

    // Search by title on dedicated column
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM urls WHERE title LIKE ?",
            ["%Products%"],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 1, "Search 'Products' in title should match 1");

    // Search by URL
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM urls WHERE url LIKE ?",
            ["%about%"],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 1, "Search 'about' in URL should match 1");

    // Search by meta_description on dedicated column
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM urls WHERE meta_description LIKE ?",
            ["%catalog%"],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        count, 1,
        "Search 'catalog' in meta_description should match 1"
    );
}

#[test]
fn test_unique_constraint_crawl_id_url() {
    let conn = setup_db();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO projects (name, root_url) VALUES ('Unique', 'https://u.test')",
        [],
    )
    .unwrap();
    conn.execute("INSERT INTO crawls (project_id) VALUES (1)", [])
        .unwrap();

    // Insert a URL
    conn.execute(
        "INSERT INTO urls (url, project_id, crawl_id, status_code, indexability, depth,
             fetch_result_json, seo_data_json, discovered_at, fetched_at, last_crawled_at)
         VALUES ('https://u.test/', 1, 1, 200, 'indexable', 0, '{}', '{}', ?1, ?1, ?1)",
        rusqlite::params![now],
    )
    .unwrap();

    // Attempting to insert the same URL with same crawl_id should fail
    let result = conn.execute(
        "INSERT INTO urls (url, project_id, crawl_id, status_code, indexability, depth,
             fetch_result_json, seo_data_json, discovered_at, fetched_at, last_crawled_at)
         VALUES ('https://u.test/', 1, 1, 200, 'indexable', 0, '{}', '{}', ?1, ?1, ?1)",
        rusqlite::params![now],
    );
    assert!(
        result.is_err(),
        "UNIQUE constraint on (crawl_id, url) should prevent duplicates"
    );

    // But same URL with different crawl_id should succeed
    conn.execute("INSERT INTO crawls (project_id) VALUES (1)", [])
        .unwrap();
    let result = conn.execute(
        "INSERT INTO urls (url, project_id, crawl_id, status_code, indexability, depth,
             fetch_result_json, seo_data_json, discovered_at, fetched_at, last_crawled_at)
         VALUES ('https://u.test/', 1, 2, 200, 'indexable', 0, '{}', '{}', ?1, ?1, ?1)",
        rusqlite::params![now],
    );
    assert!(
        result.is_ok(),
        "Same URL with different crawl_id should be allowed"
    );
}

#[test]
fn test_clear_crawl_fk_order() {
    // Verifies that clearing a crawl deletes in order: issues → links → urls
    // to avoid FK violations
    let conn = setup_db();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO projects (name, root_url) VALUES ('Del', 'https://d.test')",
        [],
    )
    .unwrap();
    conn.execute("INSERT INTO crawls (project_id) VALUES (1)", [])
        .unwrap();

    conn.execute(
        "INSERT INTO urls (url, project_id, crawl_id, status_code, indexability, depth,
             fetch_result_json, seo_data_json, discovered_at, fetched_at, last_crawled_at)
         VALUES ('https://d.test/', 1, 1, 200, 'indexable', 0, '{}', '{}', ?1, ?1, ?1)",
        rusqlite::params![now],
    )
    .unwrap();

    let url_id: i64 = conn
        .query_row(
            "SELECT id FROM urls WHERE url = 'https://d.test/'",
            [],
            |row| row.get(0),
        )
        .unwrap();

    conn.execute(
        "INSERT INTO issues (issue_type, severity, category, url_id, url, message) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params!["missing_title", "high", "content", url_id, "https://d.test/", "No title"],
    )
    .unwrap();

    conn.execute(
        "INSERT INTO links (source_url_id, source_url, target_url, link_relation, anchor_text, crawl_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![url_id, "https://d.test/", "https://d.test/page2", "HtmlA", "link", 1],
    )
    .unwrap();

    // Verify data exists
    let urls_before: i64 = conn
        .query_row("SELECT COUNT(*) FROM urls WHERE crawl_id = 1", [], |row| {
            row.get(0)
        })
        .unwrap();
    let issues_before: i64 = conn
        .query_row("SELECT COUNT(*) FROM issues", [], |row| row.get(0))
        .unwrap();
    let links_before: i64 = conn
        .query_row("SELECT COUNT(*) FROM links WHERE crawl_id = 1", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(urls_before, 1);
    assert_eq!(issues_before, 1);
    assert_eq!(links_before, 1);

    // Delete in correct order: issues → links → urls
    conn.execute(
        "DELETE FROM issues WHERE url_id IN (SELECT id FROM urls WHERE crawl_id = 1)",
        [],
    )
    .unwrap();
    conn.execute("DELETE FROM links WHERE crawl_id = 1", [])
        .unwrap();
    conn.execute("DELETE FROM urls WHERE crawl_id = 1", [])
        .unwrap();

    // Verify all gone
    let urls_after: i64 = conn
        .query_row("SELECT COUNT(*) FROM urls WHERE crawl_id = 1", [], |row| {
            row.get(0)
        })
        .unwrap();
    let issues_after: i64 = conn
        .query_row("SELECT COUNT(*) FROM issues", [], |row| row.get(0))
        .unwrap();
    let links_after: i64 = conn
        .query_row("SELECT COUNT(*) FROM links WHERE crawl_id = 1", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(urls_after, 0, "All URLs should be deleted");
    assert_eq!(issues_after, 0, "All issues should be deleted");
    assert_eq!(links_after, 0, "All links should be deleted");
}
