//! Issue commands — summary, listing, and detail retrieval.

use crate::core::crawler::issue_registry::{self, IssueDefinitionDto};
use crate::core::crawler::normalizer::are_same_url;
use crate::core::storage::db;
use crate::core::storage::queries::{self, IssueRecord};
use rusqlite::Connection;
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

/// Run post-crawl analysis on a completed crawl.
///
/// Loads all URL records from the DB, deserializes their SEO data and fetch results,
/// runs cross-page detectors (duplicate titles, canonical clusters, redirect chains, etc.),
/// and persists the resulting issues back to the DB.
///
/// This should be called after a crawl finishes (after the writer is flushed).
/// Returns the number of cross-page issues found.
#[tauri::command]
pub async fn run_post_crawl(crawl_id: i64) -> Result<i64, String> {
    let mut conn = db::get_connection().map_err(|e| e.to_string())?;
    run_post_crawl_for_connection(&mut conn, crawl_id)
}

pub(crate) fn run_post_crawl_for_connection(
    conn: &mut Connection,
    crawl_id: i64,
) -> Result<i64, String> {
    use crate::core::crawler::models::{FetchResult, SeoData, SeoIssue};
    use crate::core::crawler::post_crawl::run_post_crawl_analysis;

    // Load all URL records for this crawl
    let records = queries::get_all_url_records_for_crawl(conn, crawl_id)
        .map_err(|e| format!("Failed to load URL records: {}", e))?;

    // Deserialize SEO data and fetch results from JSON columns
    let mut seo_data_map: std::collections::HashMap<String, SeoData> =
        std::collections::HashMap::new();
    let mut fetch_results: std::collections::HashMap<String, FetchResult> =
        std::collections::HashMap::new();

    for record in &records {
        if let Some(json) = &record.seo_data_json {
            if let Ok(seo) = serde_json::from_str::<SeoData>(json) {
                seo_data_map.insert(record.url.clone(), seo);
            }
        }
        if let Some(json) = &record.fetch_result_json {
            if let Ok(fetch) = serde_json::from_str::<FetchResult>(json) {
                fetch_results.insert(record.url.clone(), fetch);
            }
        }
    }

    if seo_data_map.is_empty() {
        info!(
            "Post-crawl analysis: no SEO data found for crawl {}",
            crawl_id
        );
        return Ok(0);
    }

    // Run all post-crawl detectors
    let issues = run_post_crawl_analysis(&records, &seo_data_map, &fetch_results);
    let issue_count = issues.len() as i64;

    if issue_count > 0 {
        // Build a lookup from URL → (url_id, url_string) for fast access
        let url_lookup: std::collections::HashMap<String, (i64, String)> = records
            .iter()
            .map(|r| (r.url.clone(), (r.id, r.url.clone())))
            .collect();

        // Group issues by URL so we can batch-insert per page
        let mut issues_by_url: std::collections::HashMap<String, Vec<&SeoIssue>> =
            std::collections::HashMap::new();
        for issue in &issues {
            issues_by_url
                .entry(issue.url.clone())
                .or_default()
                .push(issue);
        }

        for (url, url_issues) in &issues_by_url {
            if let Some((url_id, url_str)) = url_lookup.get(url).or_else(|| {
                url_lookup
                    .iter()
                    .find(|(record_url, _)| are_same_url(record_url, url))
                    .map(|(_, value)| value)
            }) {
                let tuples: Vec<(String, &'static str, &'static str, String, Option<String>)> =
                    url_issues
                        .iter()
                        .map(|i| {
                            let sev = match i.severity {
                                crate::core::crawler::models::IssueSeverity::Critical => "critical",
                                crate::core::crawler::models::IssueSeverity::Warning => "warning",
                                crate::core::crawler::models::IssueSeverity::Info => "info",
                            };
                            let cat = match i.category {
                            crate::core::crawler::models::IssueCategory::Content => "content",
                            crate::core::crawler::models::IssueCategory::Structure => "structure",
                            crate::core::crawler::models::IssueCategory::Technical => "technical",
                            crate::core::crawler::models::IssueCategory::Internationalization => {
                                "internationalization"
                            }
                            crate::core::crawler::models::IssueCategory::Canonical => "canonical",
                            crate::core::crawler::models::IssueCategory::Hreflang => "hreflang",
                            crate::core::crawler::models::IssueCategory::Image => "image",
                            crate::core::crawler::models::IssueCategory::Security => "security",
                            crate::core::crawler::models::IssueCategory::Social => "social",
                            crate::core::crawler::models::IssueCategory::StructuredData => {
                                "structured_data"
                            }
                            crate::core::crawler::models::IssueCategory::Links => "links",
                            crate::core::crawler::models::IssueCategory::Performance => {
                                "performance"
                            }
                            crate::core::crawler::models::IssueCategory::Amp => "amp",
                            crate::core::crawler::models::IssueCategory::Rendering => "rendering",
                            crate::core::crawler::models::IssueCategory::Sitemap => "sitemap",
                        };
                            let details = serde_json::to_string(&i.details).ok();
                            (i.issue_type.clone(), sev, cat, i.message.clone(), details)
                        })
                        .collect();
                let tuple_refs: Vec<(&str, &str, &str, &str, Option<&str>)> = tuples
                    .iter()
                    .map(|(issue_type, severity, category, message, details)| {
                        (
                            issue_type.as_str(),
                            *severity,
                            *category,
                            message.as_str(),
                            details.as_deref(),
                        )
                    })
                    .collect();

                queries::insert_issues_for_url(conn, *url_id, url_str, &tuple_refs)
                    .map_err(|e| format!("Failed to insert post-crawl issues: {}", e))?;
            }
        }
    }

    info!(
        "Post-crawl analysis for crawl {}: {} cross-page issues found and persisted",
        crawl_id, issue_count
    );

    Ok(issue_count)
}
