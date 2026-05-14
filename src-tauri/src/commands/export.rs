//! Export commands — CSV export of URLs, issues, and links.

use crate::core::storage::{db, models, queries};
use std::fs::File;
use std::io::Write;
use tracing::info;

#[tauri::command]
pub fn export_urls_to_csv(
    crawl_id: i64,
    output_path: String,
) -> Result<String, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    
    // Get all URLs for the crawl
    let (urls, _) = queries::query_urls_by_crawl(&conn, crawl_id, 1, 100000, None, "id", "asc")
        .map_err(|e| e.to_string())?;
    
    // Write CSV
    let mut file = File::create(&output_path).map_err(|e| e.to_string())?;
    
    // Header
    writeln!(file, "url,indexability,depth,status_code,title,meta_description,crawl_count,issue_count").map_err(|e| e.to_string())?;
    
    for url in &urls {
        let (title, meta_desc) = url.seo_data_json.as_ref()
            .and_then(|json| serde_json::from_str::<models::SeoData>(json).ok())
            .map(|s| (
                s.title.unwrap_or_default(),
                s.meta_description.unwrap_or_default(),
            ))
            .unwrap_or((String::new(), String::new()));
        
        writeln!(file, "{},{},{},{},{},{}",
            csv_escape(&url.url),
            url.indexability,
            url.depth,
            "",
            csv_escape(&title),
            csv_escape(&meta_desc),
        ).map_err(|e| e.to_string())?;
    }
    
    info!("Exported {} URLs to {}", urls.len(), output_path);
    Ok(output_path)
}

#[tauri::command]
pub fn export_issues_to_csv(
    crawl_id: i64,
    output_path: String,
) -> Result<String, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    
    // Get all issues for the crawl (first page with large page size)
    let (issues, _) = queries::query_issues_by_crawl(&conn, Some(crawl_id), 1, 100000, None, None)
        .map_err(|e| e.to_string())?;
    
    // Write CSV
    let mut file = File::create(&output_path).map_err(|e| e.to_string())?;
    
    // Header
    writeln!(file, "issue_type,severity,category,url,message,detected_at").map_err(|e| e.to_string())?;
    
    for issue in &issues {
        writeln!(file, "{},{},{},{},{},{}",
            csv_escape(&issue.issue_type),
            issue.severity,
            issue.category,
            csv_escape(&issue.url),
            csv_escape(&issue.message.replace(',', ",")), // Escape commas
            issue.detected_at,
        ).map_err(|e| e.to_string())?;
    }
    
    info!("Exported {} issues to {}", issues.len(), output_path);
    Ok(output_path)
}

#[tauri::command]
pub fn export_links_to_csv(
    crawl_id: i64,
    output_path: String,
) -> Result<String, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    
    // Get all links for the crawl (first page with large page size)
    let (links, _) = queries::query_links_by_crawl(&conn, Some(crawl_id), 1, 100000, None, None)
        .map_err(|e| e.to_string())?;
    
    // Write CSV
    let mut file = File::create(&output_path).map_err(|e| e.to_string())?;
    
    // Header
    writeln!(file, "source_url,target_url,link_relation,anchor_text,is_internal,is_no_follow,detected_at").map_err(|e| e.to_string())?;
    
    for link in &links {
        writeln!(file, "{},{},{},{},{},{},{}",
            csv_escape(&link.source_url),
            csv_escape(&link.target_url),
            link.link_relation,
            csv_escape(&link.anchor_text.as_deref().unwrap_or("")),
            link.is_internal,
            link.is_no_follow,
            link.detected_at,
        ).map_err(|e| e.to_string())?;
    }
    
    info!("Exported {} links to {}", links.len(), output_path);
    Ok(output_path)
}

/// Escape a value for CSV output.
fn csv_escape(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}
