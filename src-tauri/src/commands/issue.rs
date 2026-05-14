//! Issue commands — summary, listing, and detail retrieval.

use crate::core::crawler::issue_registry::{self, IssueDefinitionDto};
use crate::core::storage::db;
use crate::core::storage::queries::{self, IssueRecord};
use tracing::info;

/// Get a summary of issues grouped by type/severity/category for a crawl.
#[tauri::command]
pub async fn get_issue_summary(crawl_id: i64) -> Result<Vec<queries::IssueSummary>, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let summaries = queries::get_issue_summary_by_crawl(&conn, crawl_id)
        .map_err(|e| format!("Failed to get issue summary: {}", e))?;
    info!(
        "Issue summary for crawl {}: {} groups",
        crawl_id,
        summaries.len()
    );
    Ok(summaries)
}

/// List issues with pagination and optional filters.
#[tauri::command]
pub async fn query_issues(
    crawl_id: Option<i64>,
    page: i64,
    page_size: i64,
    filter_type: Option<String>,
    filter_severity: Option<String>,
    filter_category: Option<String>,
    search: Option<String>,
) -> Result<(Vec<IssueRecord>, i64), String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let (issues, total) = queries::query_issues_by_crawl(
        &conn,
        crawl_id,
        page,
        page_size,
        filter_type.as_deref(),
        filter_severity.as_deref(),
        filter_category.as_deref(),
        search.as_deref(),
    )
    .map_err(|e| format!("Failed to query issues: {}", e))?;
    info!(
        "Queried {} issues (total: {}) for crawl {:?}",
        issues.len(),
        total,
        crawl_id
    );
    Ok((issues, total))
}

/// Get details for a specific issue.
#[tauri::command]
pub async fn get_issue_details(issue_id: i64) -> Result<Option<IssueRecord>, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let issue = queries::get_issue_by_id(&conn, issue_id)
        .map_err(|e| format!("Failed to get issue details: {}", e))?;
    Ok(issue)
}

/// List all known issue definitions for frontend labels, filters, and help text.
#[tauri::command]
pub async fn get_issue_definitions() -> Result<Vec<IssueDefinitionDto>, String> {
    Ok(issue_registry::all_definitions())
}
