//! Writer task with bounded channels for batch inserts.
//! Per PRD §9.3: dedicated SQLite writer receiving from bounded channels.
//!
//! The writer receives `WriteOperation` messages via an mpsc channel and
//! applies them sequentially to a single SQLite connection, avoiding
//! concurrent writes from many async tasks.

use rusqlite::Connection;
use tokio::sync::mpsc;
use tracing::{error, info, warn};

/// Batch sizes per PRD §9.4 recommendations
pub const URL_BATCH_SIZE: usize = 500; // 250-2,000 rows/transaction recommended
pub const LINK_BATCH_SIZE: usize = 2000; // 1,000-10,000 rows/transaction recommended
pub const ISSUE_BATCH_SIZE: usize = 500; // 250-2,000 rows/transaction recommended

/// Operations that the writer task processes
pub enum WriteOperation {
    /// Persist a complete crawled page: URL record + its issues + its links.
    /// This is the primary operation used by the crawl engine. It atomically
    /// inserts the URL, retrieves its ID, then inserts issues and links using
    /// that ID for foreign-key integrity.
    PageCrawled(PageCrawledData),
    /// Flush: drain all pending writes. The sender awaits the reply on the
    /// included oneshot channel to confirm all preceding operations have been
    /// committed to SQLite. This eliminates the race where crawl completion
    /// could proceed before all page data was persisted.
    Flush(tokio::sync::oneshot::Sender<()>),
    /// Shut down the writer task.
    Shutdown,
}

/// Complete data for a single crawled page, sent atomically to the writer.
#[derive(Debug)]
pub struct PageCrawledData {
    pub project_id: i64,
    pub crawl_id: i64,
    pub url: String,
    pub depth: i32,
    pub indexability: String,
    pub fetch_result_json: String,
    pub seo_data_json: String,
    pub issues: Vec<IssueWriteRecord>,
    pub links: Vec<LinkWriteRecord>,
}

#[derive(Debug, Clone)]
pub struct UrlWriteRecord {
    pub url: String,
    pub project_id: i64,
    pub crawl_id: Option<i64>,
    pub fetch_result_json: Option<String>,
    pub seo_data_json: Option<String>,
    pub indexability: String,
    pub depth: i32,
}

#[derive(Debug, Clone)]
pub struct LinkWriteRecord {
    pub source_url_id: i64,
    pub source_url: String,
    pub target_url: String,
    pub link_relation: String,
    pub anchor_text: Option<String>,
    pub is_internal: bool,
    pub is_no_follow: bool,
}

#[derive(Debug, Clone)]
pub struct IssueWriteRecord {
    pub issue_type: String,
    pub severity: String,
    pub category: String,
    pub url_id: Option<i64>,
    pub url: String,
    pub message: String,
    pub details_json: Option<String>,
}

/// Handle for sending write operations to the writer task.
#[derive(Clone)]
pub struct WriteHandle {
    sender: mpsc::Sender<WriteOperation>,
}

impl WriteHandle {
    pub fn new(sender: mpsc::Sender<WriteOperation>) -> Self {
        Self { sender }
    }

    /// Send a complete crawled page for persistence (URL + issues + links).
    pub async fn page_crawled(
        &self,
        data: PageCrawledData,
    ) -> Result<(), mpsc::error::SendError<WriteOperation>> {
        self.sender.send(WriteOperation::PageCrawled(data)).await
    }

    /// Send a batch of URL records for insertion/upsert.
    pub async fn insert_urls(
        &self,
        urls: Vec<UrlWriteRecord>,
    ) -> Result<(), mpsc::error::SendError<WriteOperation>> {
        // Individual URL inserts are now handled via PageCrawled, but
        // keep this for any standalone URL insertions needed.
        let mut i = 0;
        while i < urls.len() {
            let end = std::cmp::min(i + URL_BATCH_SIZE, urls.len());
            let batch: Vec<UrlWriteRecord> = urls[i..end].to_vec();
            // Convert to PageCrawledData for now — this is a convenience path
            // for bulk seeding. Each URL goes as a standalone page with no issues/links.
            for record in batch {
                let data = PageCrawledData {
                    project_id: record.project_id,
                    crawl_id: record.crawl_id.unwrap_or(0),
                    url: record.url,
                    depth: record.depth,
                    indexability: record.indexability,
                    fetch_result_json: record.fetch_result_json.unwrap_or_default(),
                    seo_data_json: record.seo_data_json.unwrap_or_default(),
                    issues: Vec::new(),
                    links: Vec::new(),
                };
                self.sender.send(WriteOperation::PageCrawled(data)).await?;
            }
            i = end;
        }
        Ok(())
    }

    /// Flush: waits until all preceding writes have been committed to SQLite.
    /// Returns an error if the writer channel is closed, or Ok(()) once all
    /// pending data has been persisted.
    pub async fn flush(&self) -> Result<(), String> {
        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        self.sender
            .send(WriteOperation::Flush(tx))
            .await
            .map_err(|e| format!("Flush send error: {}", e))?;
        rx.await
            .map_err(|e| format!("Flush acknowledgment error: {}", e))
    }

    /// Shut down the writer task gracefully.
    pub async fn shutdown(&self) -> Result<(), mpsc::error::SendError<WriteOperation>> {
        self.sender.send(WriteOperation::Shutdown).await
    }
}

/// Start the writer task. Returns a WriteHandle for sending operations.
/// The writer owns a single SQLite connection and processes operations sequentially,
/// which avoids concurrent-write issues per PRD §9.3.
pub fn start_writer(db_path: String) -> WriteHandle {
    let (sender, mut receiver) = mpsc::channel::<WriteOperation>(1000); // bounded channel, generous for crawl throughput

    std::thread::spawn(move || {
        info!("Writer task started (dedicated SQLite connection)");

        let mut conn = match Connection::open(&db_path) {
            Ok(c) => c,
            Err(e) => {
                error!("Failed to open database for writer: {}", e);
                return;
            }
        };

        // Re-configure PRAGMAs (may need re-application per connection)
        let _ = conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA busy_timeout = 30000;
             PRAGMA foreign_keys = ON;",
        );

        // Enable immediate transaction mode for better write performance
        let _ = conn.execute_batch("PRAGMA transaction_mode = IMMEDIATE;");

        while let Some(op) = receiver.blocking_recv() {
            match op {
                WriteOperation::PageCrawled(data) => {
                    if let Err(e) = insert_page_crawled(&mut conn, &data) {
                        warn!("Error inserting page {}: {}", data.url, e);
                    }
                }
                WriteOperation::Flush(ack) => {
                    // All preceding PageCrawled operations have already been
                    // committed by the time we process this Flush. Send the
                    // acknowledgment back so the caller knows the DB is current.
                    let _ = ack.send(());
                    debug_log("Writer flush acknowledged — all preceding writes committed");
                }
                WriteOperation::Shutdown => {
                    info!("Writer task shutting down");
                    break;
                }
            }
        }

        info!("Writer task stopped");
    });

    WriteHandle::new(sender)
}

/// Insert a complete crawled page: URL + issues + links in a single transaction.
/// This ensures FK integrity (URL ID is available for issues and links).
fn insert_page_crawled(conn: &mut Connection, data: &PageCrawledData) -> Result<i64, String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();

    // Parse the JSON fields to extract SEO data columns
    let seo: serde_json::Value =
        serde_json::from_str(&data.seo_data_json).unwrap_or(serde_json::json!({}));
    let fetch: serde_json::Value =
        serde_json::from_str(&data.fetch_result_json).unwrap_or(serde_json::json!({}));

    // Extract individual fields from SEO JSON for dedicated columns
    // SEO textual/structural data comes from seo_data
    let title = seo.get("title").and_then(|v| v.as_str()).unwrap_or("");
    let title_length = if title.is_empty() {
        0
    } else {
        title.len() as i32
    };
    let meta_description = seo
        .get("metaDescription")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let meta_description_length = if meta_description.is_empty() {
        0
    } else {
        meta_description.len() as i32
    };
    let h1 = seo.get("h1Text").and_then(|v| v.as_str()).unwrap_or("");
    let h1_count = seo.get("h1Count").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    let word_count = seo.get("wordCount").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    let canonical_url = seo
        .get("canonicalUrl")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let meta_robots = seo.get("robotsMeta").and_then(|v| v.as_str()).unwrap_or("");
    let content_hash = seo
        .get("contentHash")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let language = seo.get("language").and_then(|v| v.as_str()).unwrap_or("");

    // HTTP-level fields come from fetch_result (always present) with seo_data as fallback
    let status_code = fetch
        .get("statusCode")
        .and_then(|v| v.as_i64())
        .unwrap_or_else(|| seo.get("httpStatus").and_then(|v| v.as_i64()).unwrap_or(0))
        as i32;
    let final_url = fetch
        .get("finalUrl")
        .and_then(|v| v.as_str())
        .or_else(|| seo.get("finalUrl").and_then(|v| v.as_str()))
        .unwrap_or("");
    let content_type = fetch
        .get("contentType")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let response_time_ms = fetch
        .get("responseTimeMs")
        .and_then(|v| v.as_f64())
        .or_else(|| seo.get("responseTimeMs").and_then(|v| v.as_f64()))
        .unwrap_or(0.0);
    let size_bytes = fetch
        .get("contentLength")
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;

    // Link counts from SEO data
    let internal_link_count = seo
        .get("internalLinkCount")
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;
    let external_link_count = seo
        .get("externalLinkCount")
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;

    // Normalize URL (lowercase host, remove fragment)
    let normalized_url = crate::core::crawler::normalizer::normalize_url(&data.url)
        .unwrap_or_else(|| data.url.clone());

    // Insert the URL record with all columns
    tx.execute(
        "INSERT INTO urls (url, project_id, crawl_id, normalized_url, final_url, status_code,
             content_type, title, title_length, meta_description, meta_description_length,
             h1, h1_count, word_count, canonical_url, meta_robots, response_time_ms, size_bytes,
             language, inlinks_count, outlinks_count, content_hash, crawl_source,
             fetch_result_json, seo_data_json, indexability, depth,
             discovered_at, fetched_at, last_crawled_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16,
                 ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?28, ?28)
         ON CONFLICT(crawl_id, url) DO UPDATE SET
             normalized_url = excluded.normalized_url,
             final_url = excluded.final_url,
             status_code = excluded.status_code,
             content_type = excluded.content_type,
             title = excluded.title,
             title_length = excluded.title_length,
             meta_description = excluded.meta_description,
             meta_description_length = excluded.meta_description_length,
             h1 = excluded.h1,
             h1_count = excluded.h1_count,
             word_count = excluded.word_count,
             canonical_url = excluded.canonical_url,
             meta_robots = excluded.meta_robots,
             response_time_ms = excluded.response_time_ms,
             size_bytes = excluded.size_bytes,
             language = excluded.language,
             inlinks_count = excluded.inlinks_count,
             outlinks_count = excluded.outlinks_count,
             content_hash = excluded.content_hash,
             fetch_result_json = excluded.fetch_result_json,
             seo_data_json = excluded.seo_data_json,
             indexability = excluded.indexability,
             depth = excluded.depth,
             fetched_at = excluded.fetched_at,
             last_crawled_at = excluded.last_crawled_at",
        rusqlite::params![
            data.url,
            data.project_id,
            data.crawl_id,
            normalized_url,
            final_url,
            status_code,
            content_type,
            title,
            title_length,
            meta_description,
            meta_description_length,
            h1,
            h1_count,
            word_count,
            canonical_url,
            meta_robots,
            response_time_ms,
            size_bytes,
            language,
            // inlinks_count: not yet known at page-crawl time (computed post-crawl from links table)
            0i32,
            // outlinks_count: total links FROM this page (internal + external)
            (internal_link_count + external_link_count) as i32,
            content_hash,
            "spider", // crawl_source
            data.fetch_result_json,
            data.seo_data_json,
            data.indexability,
            data.depth,
            now,
        ],
    )
    .map_err(|e| format!("Failed to insert URL {}: {}", data.url, e))?;

    // Get the URL ID — for ON CONFLICT DO UPDATE, query by url + crawl_id
    let url_id: i64 = tx
        .query_row(
            "SELECT id FROM urls WHERE url = ?1 AND crawl_id = ?2",
            rusqlite::params![data.url, data.crawl_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // Insert issues
    if !data.issues.is_empty() {
        let mut stmt = tx.prepare(
            "INSERT INTO issues (url_id, url, issue_type, severity, category, message, details_json, detected_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
        ).map_err(|e| e.to_string())?;
        for issue in &data.issues {
            stmt.execute(rusqlite::params![
                if url_id > 0 { Some(url_id) } else { None },
                issue.url,
                issue.issue_type,
                issue.severity,
                issue.category,
                issue.message,
                issue.details_json,
                now,
            ])
            .map_err(|e| format!("Failed to insert issue for {}: {}", data.url, e))?;
        }
    }

    // Insert links (with crawl_id and normalized target URL)
    if !data.links.is_empty() {
        let mut stmt = tx.prepare(
            "INSERT INTO links (crawl_id, source_url_id, source_url, target_url, target_normalized_url, link_relation, link_type, anchor_text, is_internal, is_no_follow, is_followed, detected_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)"
        ).map_err(|e| e.to_string())?;
        for link in &data.links {
            let target_normalized =
                crate::core::crawler::normalizer::normalize_url(&link.target_url)
                    .unwrap_or_else(|| link.target_url.clone());
            stmt.execute(rusqlite::params![
                data.crawl_id,
                if url_id > 0 { url_id } else { 0 },
                link.source_url,
                link.target_url,
                target_normalized,
                link.link_relation,
                link.link_relation, // link_type same as link_relation for now
                link.anchor_text,
                link.is_internal,
                link.is_no_follow,
                !link.is_no_follow, // is_followed is inverse of is_no_follow
                now,
            ])
            .map_err(|e| {
                format!(
                    "Failed to insert link {} -> {}: {}",
                    link.source_url, link.target_url, e
                )
            })?;
        }
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit page transaction for {}: {}", data.url, e))?;
    Ok(url_id)
}

/// Batch insert URLs using upsert logic (standalone, for seeding or bulk imports).
fn _batch_insert_urls(conn: &mut Connection, records: &[UrlWriteRecord]) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for record in records {
        tx.execute(
            "INSERT INTO urls (url, project_id, crawl_id, fetch_result_json, seo_data_json, indexability, depth)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(url, crawl_id) DO UPDATE SET
                 fetch_result_json = excluded.fetch_result_json,
                 seo_data_json = excluded.seo_data_json,
                 indexability = excluded.indexability,
                 depth = excluded.depth",
            rusqlite::params![
                record.url,
                record.project_id,
                record.crawl_id,
                record.fetch_result_json,
                record.seo_data_json,
                record.indexability,
                record.depth,
            ],
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Batch insert links (standalone, for bulk imports).
fn _batch_insert_links(conn: &mut Connection, records: &[LinkWriteRecord]) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for record in records {
        tx.execute(
            "INSERT INTO links (source_url_id, source_url, target_url, link_relation, anchor_text, is_internal, is_no_follow)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                record.source_url_id,
                record.source_url,
                record.target_url,
                record.link_relation,
                record.anchor_text,
                record.is_internal,
                record.is_no_follow,
            ],
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Batch insert issues (standalone, for bulk imports).
fn _batch_insert_issues(conn: &mut Connection, records: &[IssueWriteRecord]) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for record in records {
        tx.execute(
            "INSERT INTO issues (issue_type, severity, category, url_id, url, message, details_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                record.issue_type,
                record.severity,
                record.category,
                record.url_id,
                record.url,
                record.message,
                record.details_json,
            ],
        ).map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn debug_log(msg: &str) {
    tracing::debug!("{}", msg);
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Set up an in-memory database with the full production schema
    /// (projects, crawls, urls, links, issues) for testing.
    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        crate::core::storage::db::test_run_migrations(&conn).unwrap();
        conn
    }

    /// Helper to create a PageCrawledData with sensible defaults.
    /// All SEO/fetch fields are populated to verify full round-trip.
    fn make_page_data(url: &str, project_id: i64, crawl_id: i64) -> PageCrawledData {
        PageCrawledData {
            url: url.to_string(),
            project_id,
            crawl_id,
            depth: 1,
            indexability: "indexable".to_string(),
            fetch_result_json: r#"{"statusCode":200,"finalUrl":"https://example.com/page1","contentType":"text/html","contentLength":12345,"responseTimeMs":342.5}"#.to_string(),
            seo_data_json: r#"{"title":"Page 1 - Example","metaDescription":"A test page","h1Text":"Welcome","h1Count":1,"wordCount":567,"canonicalUrl":"https://example.com/page1","robotsMeta":"index, follow","contentHash":"abc123","language":"en","finalUrl":"https://example.com/page1","internalLinkCount":12,"externalLinkCount":3}"#.to_string(),
            issues: Vec::new(),
            links: Vec::new(),
        }
    }

    #[test]
    fn test_insert_page_crawled_round_trip() {
        let mut conn = setup_test_db();

        // Seed project and crawl
        conn.execute(
            "INSERT INTO projects (name, root_url) VALUES ('Test', 'https://example.com')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO crawls (project_id) VALUES (1)", [])
            .unwrap();

        let data = make_page_data("https://example.com/page1", 1, 1);
        let url_id = insert_page_crawled(&mut conn, &data).unwrap();
        assert!(url_id > 0, "Should return valid URL ID, got {}", url_id);

        // Verify all dedicated SEO columns round-trip through production code
        let (
            title,
            title_length,
            meta_desc,
            meta_desc_len,
            h1,
            h1_count,
            word_count,
            canonical,
            robots,
            status_code,
            content_type,
            response_time_ms,
            size_bytes,
            language,
            outlinks_count,
            content_hash,
            normalized_url,
            final_url,
            indexability,
            depth,
        ): (
            String,
            i32,
            String,
            i32,
            String,
            i32,
            i32,
            String,
            String,
            i32,
            String,
            f64,
            i32,
            String,
            i32,
            String,
            String,
            String,
            String,
            i32,
        ) = conn
            .query_row(
                "SELECT title, title_length, meta_description, meta_description_length,
                        h1, h1_count, word_count, canonical_url, meta_robots,
                        status_code, content_type, response_time_ms, size_bytes,
                        language, outlinks_count, content_hash, normalized_url, final_url,
                        indexability, depth FROM urls WHERE id = ?1",
                rusqlite::params![url_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                        row.get(7)?,
                        row.get(8)?,
                        row.get(9)?,
                        row.get(10)?,
                        row.get(11)?,
                        row.get(12)?,
                        row.get(13)?,
                        row.get(14)?,
                        row.get(15)?,
                        row.get(16)?,
                        row.get(17)?,
                        row.get(18)?,
                        row.get(19)?,
                    ))
                },
            )
            .unwrap();

        assert_eq!(title, "Page 1 - Example");
        assert_eq!(title_length, 16);
        assert_eq!(meta_desc, "A test page");
        assert_eq!(meta_desc_len, 11);
        assert_eq!(h1, "Welcome");
        assert_eq!(h1_count, 1);
        assert_eq!(word_count, 567);
        assert_eq!(canonical, "https://example.com/page1");
        assert_eq!(robots, "index, follow");
        assert_eq!(status_code, 200);
        assert_eq!(content_type, "text/html");
        assert!((response_time_ms - 342.5).abs() < 0.01);
        assert_eq!(size_bytes, 12345);
        assert_eq!(language, "en");
        assert_eq!(outlinks_count, 15); // 12 internal + 3 external
        assert_eq!(content_hash, "abc123");
        assert_eq!(normalized_url, "https://example.com/page1");
        assert_eq!(final_url, "https://example.com/page1");
        assert_eq!(indexability, "indexable");
        assert_eq!(depth, 1);
    }

    #[test]
    fn test_insert_page_crawled_fetch_fields_preferred() {
        // Verify that HTTP-level fields come from fetch_result first,
        // with seo_data as fallback (the fix for the response_time_ms / final_url bug)
        let mut conn = setup_test_db();
        conn.execute(
            "INSERT INTO projects (name, root_url) VALUES ('Fetch', 'https://f.test')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO crawls (project_id) VALUES (1)", [])
            .unwrap();

        let data = PageCrawledData {
            url: "https://f.test/redir".to_string(),
            project_id: 1,
            crawl_id: 1,
            depth: 0,
            indexability: "indexable".to_string(),
            // fetch has 301, finalUrl=/redirected, responseTimeMs=150.5
            fetch_result_json: r#"{"statusCode":301,"finalUrl":"https://f.test/redirected","contentType":"text/html","contentLength":8000,"responseTimeMs":150.5}"#.to_string(),
            // seo has conflicting 404, finalUrl=/wrong, responseTimeMs=999
            seo_data_json: r#"{"title":"Redirected Page","responseTimeMs":999.0,"finalUrl":"https://f.test/wrong","httpStatus":404}"#.to_string(),
            issues: Vec::new(),
            links: Vec::new(),
        };

        insert_page_crawled(&mut conn, &data).unwrap();

        let (status_code, final_url, response_time_ms): (i32, String, f64) = conn.query_row(
            "SELECT status_code, final_url, response_time_ms FROM urls WHERE url = 'https://f.test/redir'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).unwrap();

        // fetch.statusCode (301) wins, NOT seo.httpStatus (404)
        assert_eq!(status_code, 301);
        // fetch.finalUrl wins over seo.finalUrl
        assert_eq!(final_url, "https://f.test/redirected");
        // fetch.responseTimeMs (150.5) wins over seo.responseTimeMs (999.0)
        assert!((response_time_ms - 150.5).abs() < 0.01);
    }

    #[test]
    fn test_insert_page_crawled_with_issues_and_links() {
        let mut conn = setup_test_db();
        conn.execute(
            "INSERT INTO projects (name, root_url) VALUES ('IL', 'https://il.test')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO crawls (project_id) VALUES (1)", [])
            .unwrap();

        let data = PageCrawledData {
            url: "https://il.test/".to_string(),
            project_id: 1,
            crawl_id: 1,
            depth: 0,
            indexability: "indexable".to_string(),
            fetch_result_json: r#"{"statusCode":200,"finalUrl":"https://il.test/","contentType":"text/html","contentLength":5000,"responseTimeMs":100.0}"#.to_string(),
            seo_data_json: r#"{"title":"Home","h1Text":"Welcome","wordCount":300}"#.to_string(),
            issues: vec![
                IssueWriteRecord {
                    issue_type: "missing_title".to_string(),
                    severity: "high".to_string(),
                    category: "content".to_string(),
                    url_id: None,
                    url: "https://il.test/".to_string(),
                    message: "Title tag is missing".to_string(),
                    details_json: Some(r#"{"length":0}"#.to_string()),
                },
            ],
            links: vec![
                LinkWriteRecord {
                    source_url_id: 0, // will be filled by insert
                    source_url: "https://il.test/".to_string(),
                    target_url: "https://il.test/about".to_string(),
                    link_relation: "html_a".to_string(),
                    anchor_text: Some("About".to_string()),
                    is_internal: true,
                    is_no_follow: false,
                },
            ],
        };

        let url_id = insert_page_crawled(&mut conn, &data).unwrap();

        // Verify issue was inserted
        let issue_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM issues WHERE url = 'https://il.test/'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(issue_count, 1);

        let issue_type: String = conn
            .query_row(
                "SELECT issue_type FROM issues WHERE url = 'https://il.test/'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(issue_type, "missing_title");

        // Verify link was inserted
        let link_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM links WHERE source_url = 'https://il.test/'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(link_count, 1);

        let (target, is_internal, is_followed): (String, bool, bool) = conn.query_row(
            "SELECT target_url, is_internal, is_followed FROM links WHERE source_url = 'https://il.test/'",
            [], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).unwrap();
        assert_eq!(target, "https://il.test/about");
        assert!(is_internal);
        assert!(is_followed);
    }

    #[test]
    fn test_insert_page_crawled_upsert_on_conflict() {
        // Verify ON CONFLICT (crawl_id, url) DO UPDATE works
        let mut conn = setup_test_db();
        conn.execute(
            "INSERT INTO projects (name, root_url) VALUES ('Upsert', 'https://u.test')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO crawls (project_id) VALUES (1)", [])
            .unwrap();

        // First insert
        let data_v1 = PageCrawledData {
            url: "https://u.test/".to_string(),
            project_id: 1,
            crawl_id: 1,
            depth: 0,
            indexability: "indexable".to_string(),
            fetch_result_json: r#"{"statusCode":200,"finalUrl":"https://u.test/","contentType":"text/html","contentLength":1000,"responseTimeMs":50.0}"#.to_string(),
            seo_data_json: r#"{"title":"V1 Title","wordCount":100}"#.to_string(),
            issues: Vec::new(),
            links: Vec::new(),
        };
        insert_page_crawled(&mut conn, &data_v1).unwrap();

        // Second insert with same URL + crawl_id → should UPSERT
        let data_v2 = PageCrawledData {
            url: "https://u.test/".to_string(),
            project_id: 1,
            crawl_id: 1,  // same crawl_id → conflict → update
            depth: 0,
            indexability: "noindex".to_string(),
            fetch_result_json: r#"{"statusCode":301,"finalUrl":"https://u.test/new","contentType":"text/html","contentLength":2000,"responseTimeMs":75.0}"#.to_string(),
            seo_data_json: r#"{"title":"V2 Title","wordCount":200}"#.to_string(),
            issues: Vec::new(),
            links: Vec::new(),
        };
        insert_page_crawled(&mut conn, &data_v2).unwrap();

        // Should have only 1 row (UPSERT, not duplicate)
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM urls WHERE url = 'https://u.test/' AND crawl_id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "ON CONFLICT should upsert, not duplicate");

        // Should have updated values
        let (title, status_code, final_url): (String, i32, String) = conn.query_row(
            "SELECT title, status_code, final_url FROM urls WHERE url = 'https://u.test/' AND crawl_id = 1",
            [], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        ).unwrap();
        assert_eq!(title, "V2 Title");
        assert_eq!(status_code, 301);
        assert_eq!(final_url, "https://u.test/new");
    }
}
