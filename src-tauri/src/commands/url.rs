//! URL commands — querying and summarizing crawled URLs.

use crate::core::storage::{db, models, queries};
use std::collections::HashMap;

#[tauri::command]
pub fn query_urls(
    project_id: Option<i64>,
    crawl_id: Option<i64>,
    page: i64,
    page_size: i64,
    filter_indexability: Option<String>,
    filter_status_category: Option<String>,
    search: Option<String>,
    sort_by: Option<String>,
    sort_order: Option<String>,
) -> Result<models::PaginatedResult<models::UrlRecord>, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;

    let sort_by = sort_by.unwrap_or_else(|| "id".to_string());
    let sort_order = sort_order.unwrap_or_else(|| "desc".to_string());
    let project_id = match project_id {
        Some(id) => id,
        None => {
            let crawl_id = crawl_id.ok_or_else(|| {
                "query_urls requires either project_id or crawl_id".to_string()
            })?;
            conn.query_row(
                "SELECT project_id FROM crawls WHERE id = ?1",
                [crawl_id],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|e| format!("Failed to resolve project for crawl {}: {}", crawl_id, e))?
        }
    };

    let (items, total) = queries::query_urls(
        &conn,
        project_id,
        crawl_id,
        page,
        page_size,
        filter_indexability.as_deref(),
        filter_status_category.as_deref(),
        search.as_deref(),
        &sort_by,
        &sort_order,
    )
    .map_err(|e| e.to_string())?;

    let total_pages = if page_size > 0 {
        (total + page_size - 1) / page_size
    } else {
        0
    };

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

/// Build a URL summary from a filter clause. Used by both project_id and crawl_id variants.
fn build_summary(conn: &rusqlite::Connection, where_clause: &str, params: &[&dyn rusqlite::types::ToSql]) -> Result<models::UrlSummary, String> {
    // Count by indexability
    let sql_indexability = format!(
        "SELECT indexability, COUNT(*) as count FROM urls WHERE {} GROUP BY indexability",
        where_clause
    );
    let mut stmt = conn.prepare(&sql_indexability).map_err(|e| e.to_string())?;

    let mut summary = models::UrlSummary {
        total_urls: 0,
        indexable: 0,
        noindex: 0,
        blocked_by_robots: 0,
        non_200_status: 0,
        average_depth: 0.0,
        avg_response_time_ms: None,
        status_code_distribution: None,
        depth_distribution: None,
        indexable_count: None,
    };

    let rows = stmt.query_map(params, |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, i64>(1)?,
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

    // Non-200 status codes
    let sql_non200 = format!(
        "SELECT COUNT(*) FROM urls WHERE {} AND status_code >= 400",
        where_clause
    );
    summary.non_200_status = conn.query_row(&sql_non200, params, |row| row.get(0)).unwrap_or(0);

    // Average depth
    let sql_avg_depth = format!("SELECT AVG(depth) FROM urls WHERE {}", where_clause);
    summary.average_depth = conn.query_row(&sql_avg_depth, params, |row| row.get(0)).unwrap_or(0.0);

    // Average response time
    let sql_avg_time = format!("SELECT AVG(response_time_ms) FROM urls WHERE {}", where_clause);
    summary.avg_response_time_ms = Some(conn.query_row(&sql_avg_time, params, |row| row.get(0)).unwrap_or(0.0));

    // Status code distribution
    let sql_status = format!(
        "SELECT CAST(status_code AS TEXT), COUNT(*) as count FROM urls WHERE {} GROUP BY status_code ORDER BY count DESC",
        where_clause
    );
    let mut status_stmt = conn.prepare(&sql_status).map_err(|e| e.to_string())?;
    let status_rows = status_stmt.query_map(params, |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    }).map_err(|e| e.to_string())?;
    let mut status_dist = HashMap::new();
    for row in status_rows.filter_map(|r| r.ok()) {
        status_dist.insert(row.0, row.1);
    }
    summary.status_code_distribution = Some(status_dist);

    // Depth distribution
    let sql_depth = format!(
        "SELECT CAST(depth AS TEXT), COUNT(*) as count FROM urls WHERE {} GROUP BY depth ORDER BY depth",
        where_clause
    );
    let mut depth_stmt = conn.prepare(&sql_depth).map_err(|e| e.to_string())?;
    let depth_rows = depth_stmt.query_map(params, |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    }).map_err(|e| e.to_string())?;
    let mut depth_dist = HashMap::new();
    for row in depth_rows.filter_map(|r| r.ok()) {
        depth_dist.insert(row.0, row.1);
    }
    summary.depth_distribution = Some(depth_dist);

    // Indexable count (alias for clarity)
    summary.indexable_count = Some(summary.indexable);

    Ok(summary)
}

#[tauri::command]
pub fn summarize_urls(project_id: i64) -> Result<models::UrlSummary, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    build_summary(&conn, "project_id = ?1", &[&project_id])
}

#[tauri::command]
pub fn summarize_urls_by_crawl(crawl_id: i64) -> Result<models::UrlSummary, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    build_summary(&conn, "crawl_id = ?1", &[&crawl_id])
}
