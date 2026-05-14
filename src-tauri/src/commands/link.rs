//! Link commands — query and summarize internal/external links.

use crate::core::storage::db;
use crate::core::storage::queries::{self, LinkRecord};
use crate::core::events::CrawlManager;
use tauri::State;
use tracing::info;

/// List links with pagination and optional filters.
#[tauri::command]
pub async fn query_links(
    crawl_id: Option<i64>,
    page: i64,
    page_size: i64,
    filter_relation: Option<String>,
    filter_is_internal: Option<bool>,
) -> Result<(Vec<LinkRecord>, i64), String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let (links, total) = queries::query_links_by_crawl(
        &conn,
        crawl_id,
        page,
        page_size,
        filter_relation.as_deref(),
        filter_is_internal,
    )
    .map_err(|e| format!("Failed to query links: {}", e))?;
    info!(
        "Queried {} links (total: {}) for crawl {:?}",
        links.len(),
        total,
        crawl_id
    );
    Ok((links, total))
}

/// Get a summary of links grouped by relation type.
#[tauri::command]
pub async fn summarize_links(crawl_id: i64) -> Result<queries::LinkSummary, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let summary = queries::summarize_links_by_crawl(&conn, crawl_id)
        .map_err(|e| format!("Failed to summarize links: {}", e))?;
    info!(
        "Link summary for crawl {}: {} total links",
        crawl_id, summary.total_links
    );
    Ok(summary)
}
