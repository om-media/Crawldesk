//! URL commands — querying and summarizing crawled URLs.

use crate::core::storage::{db, models, queries};
use tracing::info;

#[tauri::command]
pub fn query_urls(
    project_id: i64,
    crawl_id: Option<i64>,
    page: i64,
    page_size: i64,
    filter_indexability: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<models::PaginatedResult<models::UrlRecord>, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    
    let sort_by = sort_by.unwrap_or_else(|| "id".to_string());
    let sort_order = sort_order.unwrap_or_else(|| "desc".to_string());
    
    let (items, total) = queries::query_urls(
        &conn,
        project_id,
        crawl_id,
        page,
        page_size,
        filter_indexability.as_deref(),
        &sort_by,
        &sort_order,
    ).map_err(|e| e.to_string())?;
    
    let total_pages = (total + page_size - 1) / page_size;
    
    Ok(models::PaginatedResult {
        items,
        total,
        page,
        page_size,
        total_pages,
    })
}

#[tauri::command]
pub fn get_url_details(url_id: i64) -> Result<Option<models::UrlRecord>, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let url = queries::get_url_details(&conn, url_id).map_err(|e| e.to_string())?;
    Ok(url)
}

#[tauri::command]
pub fn summarize_urls(project_id: i64) -> Result<models::UrlSummary, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    
    // Count by indexability
    let mut stmt = conn.prepare(
        "SELECT indexability, COUNT(*) as count FROM urls WHERE project_id = ?1 GROUP BY indexability"
    ).map_err(|e| e.to_string())?;
    
    let mut summary = models::UrlSummary {
        total_urls: 0,
        indexable: 0,
        noindex: 0,
        blocked_by_robots: 0,
        non_200_status: 0,
        average_depth: 0.0,
    };
    
    let rows = stmt.query_map(rusqlite::params![project_id], |row| {
        Ok((
            row.get::<_, String>("indexability")?,
            row.get::<_, i64>("count")?,
        ))
    }).map_err(|e| e.to_string())?;
    
    for row in rows.filter_map(|r| r.ok()) {
        let (indexability, count) = row;
        summary.total_urls += count;
        
        match indexability.as_str() {
            "indexable" => summary.indexable = count,
            "noindex" => summary.noindex = count,
            "blocked_by_robots" => summary.blocked_by_robots = count,
            _ => {}
        }
    }
    
    // Average depth
    let avg_depth: f64 = conn.query_row(
        "SELECT AVG(depth) FROM urls WHERE project_id = ?1",
        [project_id],
        |row| row.get(0),
    ).unwrap_or(0.0);
    summary.average_depth = avg_depth;
    
    Ok(summary)
}
