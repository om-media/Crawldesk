//! Link commands — query and summarize internal/external links.

use crate::core::storage::db;
use crate::core::storage::queries::{self, LinkRecord};
use serde::{Deserialize, Serialize};
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnchorTextSummary {
    pub anchor_text: String,
    pub count: i64,
    pub internal_count: i64,
    pub external_count: i64,
    pub source_url_count: i64,
    pub target_url_count: i64,
}

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

/// Aggregate anchor text distribution for links in a crawl.
#[tauri::command]
pub async fn summarize_anchor_text(
    crawl_id: i64,
    limit: Option<i64>,
) -> Result<Vec<AnchorTextSummary>, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(25).clamp(1, 100);
    let mut stmt = conn
        .prepare(
            "SELECT lower(trim(anchor_text)) AS anchor_text,
                    COUNT(*) AS count,
                    SUM(CASE WHEN is_internal = 1 THEN 1 ELSE 0 END) AS internal_count,
                    SUM(CASE WHEN is_internal = 0 THEN 1 ELSE 0 END) AS external_count,
                    COUNT(DISTINCT source_url) AS source_url_count,
                    COUNT(DISTINCT target_url) AS target_url_count
             FROM links
             WHERE crawl_id = ?1
               AND anchor_text IS NOT NULL
               AND trim(anchor_text) != ''
             GROUP BY lower(trim(anchor_text))
             ORDER BY count DESC, target_url_count DESC, anchor_text ASC
             LIMIT ?2",
        )
        .map_err(|e| format!("Failed to prepare anchor text summary: {}", e))?;

    let rows = stmt
        .query_map(rusqlite::params![crawl_id, limit], |row| {
            Ok(AnchorTextSummary {
                anchor_text: row.get("anchor_text")?,
                count: row.get("count")?,
                internal_count: row.get("internal_count")?,
                external_count: row.get("external_count")?,
                source_url_count: row.get("source_url_count")?,
                target_url_count: row.get("target_url_count")?,
            })
        })
        .map_err(|e| format!("Failed to query anchor text summary: {}", e))?;

    let summaries: Vec<AnchorTextSummary> = rows.filter_map(|row| row.ok()).collect();
    info!(
        "Anchor text summary for crawl {}: {} anchors",
        crawl_id,
        summaries.len()
    );
    Ok(summaries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anchor_summary_serializes_camel_case() {
        let summary = AnchorTextSummary {
            anchor_text: "learn more".to_string(),
            count: 3,
            internal_count: 2,
            external_count: 1,
            source_url_count: 2,
            target_url_count: 1,
        };

        let value = serde_json::to_value(summary).unwrap();

        assert_eq!(value["anchorText"], "learn more");
        assert_eq!(value["internalCount"], 2);
        assert_eq!(value["targetUrlCount"], 1);
    }
}
