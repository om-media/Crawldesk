//! Writer task with bounded channels for batch inserts.
//! Per PRD §9.3: dedicated SQLite writer receiving from bounded channels.

use rusqlite::{Connection, Transaction};
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use tracing::{info, warn};

/// Batch sizes per PRD §9.4 recommendations
pub const URL_BATCH_SIZE: usize = 500; // 250-2,000 rows/transaction recommended
pub const LINK_BATCH_SIZE: usize = 2000; // 1,000-10,000 rows/transaction recommended
pub const ISSUE_BATCH_SIZE: usize = 500; // 250-2,000 rows/transaction recommended

/// Operations that the writer task processes
#[derive(Debug)]
pub enum WriteOperation {
    Urls(Vec<UrlWriteRecord>),
    Links(Vec<LinkWriteRecord>),
    Issues(Vec<IssueWriteRecord>),
}

#[derive(Debug)]
pub struct UrlWriteRecord {
    pub url: String,
    pub project_id: i64,
    pub crawl_id: Option<i64>,
    pub fetch_result_json: Option<String>,
    pub seo_data_json: Option<String>,
    pub indexability: String,
    pub depth: i32,
}

#[derive(Debug)]
pub struct LinkWriteRecord {
    pub source_url_id: i64,
    pub source_url: String,
    pub target_url: String,
    pub link_relation: String,
    pub anchor_text: Option<String>,
    pub is_internal: bool,
    pub is_no_follow: bool,
}

#[derive(Debug)]
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
pub struct WriteHandle {
    sender: mpsc::Sender<WriteOperation>,
}

impl WriteHandle {
    pub fn new(sender: mpsc::Sender<WriteOperation>) -> Self {
        Self { sender }
    }

    /// Send a batch of URL records for insertion/upsert.
    pub async fn insert_urls(&self, urls: Vec<UrlWriteRecord>) -> Result<(), tokio::sync::mpsc::error::SendError<WriteOperation>> {
        self.sender.send(WriteOperation::Urls(urls)).await
    }

    /// Send a batch of link records for insertion.
    pub async fn insert_links(&self, links: Vec<LinkWriteRecord>) -> Result<(), tokio::sync::mpsc::error::SendError<WriteOperation>> {
        self.sender.send(WriteOperation::Links(links)).await
    }

    /// Send a batch of issue records for insertion.
    pub async fn insert_issues(&self, issues: Vec<IssueWriteRecord>) -> Result<(), tokio::sync::mpsc::error::SendError<WriteOperation>> {
        self.sender.send(WriteOperation::Issues(issues)).await
    }
}

/// Start the writer task. Returns a WriteHandle for sending operations.
pub fn start_writer(db_path: String) -> WriteHandle {
    let (sender, mut receiver) = mpsc::channel::<WriteOperation>(100); // bounded channel

    tokio::spawn(async move {
        info!("Writer task started");
        
        // Connect to database once per writer task
        let mut conn = match rusqlite::Connection::open(&db_path) {
            Ok(c) => c,
            Err(e) => {
                warn!("Failed to open database for writer: {}", e);
                return;
            }
        };

        // Re-configure PRAGMAs (may need re-application per connection)
        let _ = conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;",
        );

        while let Some(op) = receiver.recv().await {
            match op {
                WriteOperation::Urls(records) => {
                    if let Err(e) = batch_insert_urls(&mut conn, &records) {
                        warn!("Error inserting URL batch ({} records): {}", records.len(), e);
                    }
                }
                WriteOperation::Links(records) => {
                    if let Err(e) = batch_insert_links(&mut conn, &records) {
                        warn!("Error inserting link batch ({} records): {}", records.len(), e);
                    }
                }
                WriteOperation::Issues(records) => {
                    if let Err(e) = batch_insert_issues(&mut conn, &records) {
                        warn!("Error inserting issue batch ({} records): {}", records.len(), e);
                    }
                }
            }
        }

        info!("Writer task stopped");
    });

    WriteHandle::new(sender)
}

/// Batch insert URLs using upsert logic.
fn batch_insert_urls(conn: &mut Connection, records: &[UrlWriteRecord]) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Upsert: INSERT OR REPLACE on url + crawl_id combination
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

/// Batch insert links.
fn batch_insert_links(conn: &mut Connection, records: &[LinkWriteRecord]) -> Result<(), String> {
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

/// Batch insert issues.
fn batch_insert_issues(conn: &mut Connection, records: &[IssueWriteRecord]) -> Result<(), String> {
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
