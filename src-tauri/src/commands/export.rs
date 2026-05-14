//! Export commands — CSV export of URLs, issues, and links.

use crate::core::storage::{db, queries};
use serde::Serialize;
use std::path::Path;
use tracing::info;

/// Result returned by every export command.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub file_path: String,
    pub row_count: usize,
    pub file_size: u64,
}

// ─── URL CSV Row ────────────────────────────────────────────────

/// Flat struct matching one row in the URLs CSV.
/// Every field is a plain String so `csv::Writer` handles quoting.
struct UrlCsvRow {
    url: String,
    normalized_url: String,
    final_url: String,
    status_code: String,
    content_type: String,
    title: String,
    meta_description: String,
    h1: String,
    word_count: String,
    canonical_url: String,
    meta_robots: String,
    response_time_ms: String,
    size_bytes: String,
    language: String,
    inlinks_count: String,
    outlinks_count: String,
    indexability: String,
    depth: String,
    discovered_at: String,
    fetched_at: String,
    last_crawled_at: String,
}

// ─── Issue CSV Row ──────────────────────────────────────────────

struct IssueCsvRow {
    issue_type: String,
    severity: String,
    category: String,
    url: String,
    message: String,
    details_json: String,
    is_fixed: String,
    detected_at: String,
}

// ─── Link CSV Row ───────────────────────────────────────────────

struct LinkCsvRow {
    source_url: String,
    target_url: String,
    link_relation: String,
    anchor_text: String,
    is_internal: String,
    is_no_follow: String,
    detected_at: String,
}

// ─── Helpers ─────────────────────────────────────────────────────

fn opt_to_string(v: Option<String>) -> String {
    v.unwrap_or_default()
}

fn opt_i32_to_string(v: Option<i32>) -> String {
    v.map_or_else(String::new, |n| n.to_string())
}

fn opt_f64_to_string(v: Option<f64>) -> String {
    v.map_or_else(String::new, |n| n.to_string())
}

fn opt_datetime_to_string(v: Option<chrono::DateTime<chrono::Utc>>) -> String {
    v.map_or_else(String::new, |dt| dt.to_rfc3339())
}

fn create_csv_file(path: &Path) -> Result<std::fs::File, String> {
    if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create export dir: {}", e))?;
    }

    std::fs::File::create(path).map_err(|e| format!("Failed to create CSV file: {}", e))
}

/// Write CSV rows and return the file metadata.
fn finish_csv(
    mut writer: csv::Writer<std::fs::File>,
    path: &Path,
    row_count: usize,
) -> Result<ExportResult, String> {
    // Must flush + drop the writer so the file is fully written before we read its size.
    writer
        .flush()
        .map_err(|e| format!("Failed to flush CSV file: {}", e))?;
    drop(writer);
    let metadata =
        std::fs::metadata(path).map_err(|e| format!("Failed to stat CSV file: {}", e))?;
    Ok(ExportResult {
        file_path: path.to_string_lossy().to_string(),
        row_count,
        file_size: metadata.len(),
    })
}

// ─── export_urls_csv ────────────────────────────────────────────

#[tauri::command]
pub fn export_urls_csv(
    crawl_id: i64,
    output_path: String,
    filter_indexability: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<ExportResult, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;

    // Fetch all URLs for the crawl (page through in batches)
    let page_size: i64 = 10_000;
    let sort = sort_by.as_deref().unwrap_or("id");
    let order = sort_order.as_deref().unwrap_or("asc");
    let filter = filter_indexability.as_deref();

    let mut all_urls = Vec::new();
    let mut page: i64 = 0;
    loop {
        let (urls, _total) =
            queries::query_urls_by_crawl(&conn, crawl_id, page, page_size, filter, sort, order)
                .map_err(|e| e.to_string())?;

        if urls.is_empty() {
            break;
        }
        all_urls.extend(urls);
        page += 1;
    }

    let path = Path::new(&output_path);
    let file = create_csv_file(path)?;
    let mut writer = csv::Writer::from_writer(file);

    // Header — must match field order of UrlCsvRow
    writer
        .write_record(&[
            "url",
            "normalized_url",
            "final_url",
            "status_code",
            "content_type",
            "title",
            "meta_description",
            "h1",
            "word_count",
            "canonical_url",
            "meta_robots",
            "response_time_ms",
            "size_bytes",
            "language",
            "inlinks_count",
            "outlinks_count",
            "indexability",
            "depth",
            "discovered_at",
            "fetched_at",
            "last_crawled_at",
        ])
        .map_err(|e| format!("CSV write error: {}", e))?;

    for u in &all_urls {
        let row = UrlCsvRow {
            url: u.url.clone(),
            normalized_url: opt_to_string(u.normalized_url.clone()),
            final_url: opt_to_string(u.final_url.clone()),
            status_code: opt_i32_to_string(u.status_code),
            content_type: opt_to_string(u.content_type.clone()),
            title: opt_to_string(u.title.clone()),
            meta_description: opt_to_string(u.meta_description.clone()),
            h1: opt_to_string(u.h1.clone()),
            word_count: opt_i32_to_string(u.word_count),
            canonical_url: opt_to_string(u.canonical_url.clone()),
            meta_robots: opt_to_string(u.meta_robots.clone()),
            response_time_ms: opt_f64_to_string(u.response_time_ms),
            size_bytes: opt_i32_to_string(u.size_bytes),
            language: opt_to_string(u.language.clone()),
            inlinks_count: opt_i32_to_string(u.inlinks_count),
            outlinks_count: opt_i32_to_string(u.outlinks_count),
            indexability: u.indexability.clone(),
            depth: u.depth.to_string(),
            discovered_at: opt_datetime_to_string(u.discovered_at),
            fetched_at: opt_datetime_to_string(u.fetched_at),
            last_crawled_at: opt_datetime_to_string(u.last_crawled_at),
        };

        writer
            .write_record(&[
                &row.url,
                &row.normalized_url,
                &row.final_url,
                &row.status_code,
                &row.content_type,
                &row.title,
                &row.meta_description,
                &row.h1,
                &row.word_count,
                &row.canonical_url,
                &row.meta_robots,
                &row.response_time_ms,
                &row.size_bytes,
                &row.language,
                &row.inlinks_count,
                &row.outlinks_count,
                &row.indexability,
                &row.depth,
                &row.discovered_at,
                &row.fetched_at,
                &row.last_crawled_at,
            ])
            .map_err(|e| format!("CSV write error: {}", e))?;
    }

    let row_count = all_urls.len();
    info!("Exported {} URLs to {}", row_count, output_path);
    finish_csv(writer, path, row_count)
}

// ─── export_issues_csv ──────────────────────────────────────────

#[tauri::command]
pub fn export_issues_csv(
    crawl_id: i64,
    output_path: String,
    filter_type: Option<String>,
    filter_severity: Option<String>,
    filter_category: Option<String>,
    search: Option<String>,
) -> Result<ExportResult, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;

    // Fetch all issues for the crawl (page through in batches)
    let page_size: i64 = 10_000;
    let mut all_issues = Vec::new();
    let mut page: i64 = 0;
    loop {
        let (issues, _total) = queries::query_issues_by_crawl(
            &conn,
            Some(crawl_id),
            page,
            page_size,
            filter_type.as_deref(),
            filter_severity.as_deref(),
            filter_category.as_deref(),
            search.as_deref(),
        )
        .map_err(|e| e.to_string())?;

        if issues.is_empty() {
            break;
        }
        all_issues.extend(issues);
        page += 1;
    }

    let path = Path::new(&output_path);
    let file = create_csv_file(path)?;
    let mut writer = csv::Writer::from_writer(file);

    writer
        .write_record(&[
            "issue_type",
            "severity",
            "category",
            "url",
            "message",
            "details_json",
            "is_fixed",
            "detected_at",
        ])
        .map_err(|e| format!("CSV write error: {}", e))?;

    for i in &all_issues {
        let row = IssueCsvRow {
            issue_type: i.issue_type.clone(),
            severity: i.severity.clone(),
            category: i.category.clone(),
            url: i.url.clone(),
            message: i.message.clone(),
            details_json: i.details_json.clone().unwrap_or_default(),
            is_fixed: if i.is_fixed { "true" } else { "false" }.to_string(),
            detected_at: i.detected_at.to_rfc3339(),
        };

        writer
            .write_record(&[
                &row.issue_type,
                &row.severity,
                &row.category,
                &row.url,
                &row.message,
                &row.details_json,
                &row.is_fixed,
                &row.detected_at,
            ])
            .map_err(|e| format!("CSV write error: {}", e))?;
    }

    let row_count = all_issues.len();
    info!("Exported {} issues to {}", row_count, output_path);
    finish_csv(writer, path, row_count)
}

// ─── export_links_csv ────────────────────────────────────────────

#[tauri::command]
pub fn export_links_csv(
    crawl_id: i64,
    output_path: String,
    filter_relation: Option<String>,
    filter_is_internal: Option<bool>,
) -> Result<ExportResult, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;

    // Fetch all links for the crawl (page through in batches)
    let page_size: i64 = 10_000;
    let mut all_links = Vec::new();
    let mut page: i64 = 0;
    loop {
        let (links, _total) = queries::query_links_by_crawl(
            &conn,
            Some(crawl_id),
            page,
            page_size,
            filter_relation.as_deref(),
            filter_is_internal,
        )
        .map_err(|e| e.to_string())?;

        if links.is_empty() {
            break;
        }
        all_links.extend(links);
        page += 1;
    }

    let path = Path::new(&output_path);
    let file = create_csv_file(path)?;
    let mut writer = csv::Writer::from_writer(file);

    writer
        .write_record(&[
            "source_url",
            "target_url",
            "link_relation",
            "anchor_text",
            "is_internal",
            "is_no_follow",
            "detected_at",
        ])
        .map_err(|e| format!("CSV write error: {}", e))?;

    for l in &all_links {
        let row = LinkCsvRow {
            source_url: l.source_url.clone(),
            target_url: l.target_url.clone(),
            link_relation: l.link_relation.clone(),
            anchor_text: l.anchor_text.clone().unwrap_or_default(),
            is_internal: if l.is_internal { "true" } else { "false" }.to_string(),
            is_no_follow: if l.is_no_follow { "true" } else { "false" }.to_string(),
            detected_at: l.detected_at.to_rfc3339(),
        };

        writer
            .write_record(&[
                &row.source_url,
                &row.target_url,
                &row.link_relation,
                &row.anchor_text,
                &row.is_internal,
                &row.is_no_follow,
                &row.detected_at,
            ])
            .map_err(|e| format!("CSV write error: {}", e))?;
    }

    let row_count = all_links.len();
    info!("Exported {} links to {}", row_count, output_path);
    finish_csv(writer, path, row_count)
}
