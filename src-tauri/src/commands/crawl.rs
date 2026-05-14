//! Crawl commands — lifecycle management (start, pause, resume, stop).
//!
//! Data persistence uses the writer channel (writer.rs) which owns a single
//! SQLite connection and processes writes sequentially per PRD §9.3.
//! Frontend progress events are emitted via Tauri's event system.

use crate::core::crawler::engine::{CrawlEngine, CrawlEngineConfig, CrawlEvent};
use crate::core::crawler::fetcher::FetcherConfig;
use crate::core::events::CrawlManager;
use crate::core::storage::db;
use crate::core::storage::models::CrawlSettings;
use crate::core::storage::writer;
use serde_json::json;
use tauri::{AppHandle, Emitter, State};
use tracing::{info, warn};

/// Start a new crawl for a project.
#[tauri::command]
pub async fn start_crawl(
    app: AppHandle,
    project_id: i64,
    settings: CrawlSettings,
    state: State<'_, CrawlManager>,
) -> Result<i64, String> {
    let conn = db::get_connection()?;

    // Create crawl record
    let crawl_id = {
        let json = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
        crate::core::storage::queries::create_crawl(&conn, project_id, Some(&json))
            .map_err(|e| e.to_string())?;
        conn.last_insert_rowid()
    };

    // Get project root URL (or use start_url override if provided)
    let project = crate::core::storage::queries::get_project(&conn, project_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    let root_url = settings.start_url.clone().unwrap_or(project.root_url);

    // Update crawl status to initializing
    crate::core::storage::queries::update_crawl_status(&conn, crawl_id, "initializing")
        .map_err(|e| e.to_string())?;

    // Register crawl state in manager
    let mut crawl_state = crate::core::events::CrawlState::new(crawl_id, project_id);
    crawl_state.status = "running".to_string();
    crawl_state.total_urls = settings.max_urls as i64;
    crawl_state.queued_urls = 1;
    crawl_state.started_at = Some(std::time::Instant::now());

    // Update status to crawling
    crate::core::storage::queries::update_crawl_status(&conn, crawl_id, "crawling")
        .map_err(|e| e.to_string())?;

    state.register(std::sync::Arc::new(crawl_state)).await;

    let started_payload = json!({
        "crawlId": crawl_id.to_string(),
        "status": "running",
        "totalUrls": settings.max_urls,
        "totalDiscovered": 1,
        "totalQueued": 1,
        "totalCompleted": 0,
        "totalFailed": 0,
        "totalBlocked": 0,
        "elapsedTimeSeconds": 0,
        "newUrls": [],
    });
    let _ = app.emit("crawl:progress", started_payload.clone());
    let _ = app.emit(
        "crawl:status",
        json!({ "crawlId": crawl_id.to_string(), "status": "running" }),
    );

    // Build engine config
    let fetcher_config = FetcherConfig {
        user_agent: settings.user_agent.clone(),
        timeout_seconds: settings.timeout_seconds as u64,
        max_response_size_kb: settings.max_response_size_kb as usize,
        follow_redirects: settings.follow_redirects,
        max_redirects: settings.max_redirects as usize,
        accept_language: settings.accept_language.clone(),
        custom_headers: None,
    };

    let engine_config = CrawlEngineConfig {
        root_url,
        max_urls: settings.max_urls as usize,
        max_depth: settings.max_depth,
        concurrency: settings.concurrency as usize,
        delay_between_requests_ms: settings.delay_between_requests_ms as u64,
        fetcher_config,
        respect_robots_txt: settings.respect_robots_txt,
        respect_sitemaps: settings.respect_sitemaps,
        custom_headers: None,
    };

    // Start the SQLite writer task — runs on a dedicated thread per PRD §9.3
    let db_path = db::db_path().to_string();
    let writer_handle = writer::start_writer(db_path);

    // Create and configure engine
    let mut engine = CrawlEngine::new(engine_config);
    engine.set_writer(writer_handle.clone());
    engine.set_project_context(project_id, crawl_id);

    // Set up event callback — bridges engine events to:
    //   1. WriteHandle (for SQLite persistence)
    //   2. Tauri frontend events (for UI progress updates)
    //   3. CrawlManager state (for in-memory progress queries)
    let state_clone = (*state).clone();
    let app_clone = app.clone();

    engine.on_event(move |event| {
        match event {
            CrawlEvent::UrlFetched(result) => {
                // The writer channel is already called from engine.rs's run() loop.
                // Here we only handle frontend event emission and state updates.

                let url = result.url.clone();
                let status_code = result.fetch_result.status_code;
                let response_time_ms = result.fetch_result.response_time_ms;
                let title = result.seo_data.title.clone().unwrap_or_default();
                let depth = result.depth;
                let issue_count = result.issues.len() as i64;
                let link_count = result.extracted_links.len() as i64;

                // Update CrawlManager progress
                if let Some(crawl_state) = tokio::task::block_in_place(|| {
                    let rt = tokio::runtime::Handle::current();
                    rt.block_on(state_clone.get(crawl_id))
                }) {
                    let crawled_urls = crawl_state.crawled_urls + 1;
                    let issue_count_total = crawl_state.issue_count + issue_count;
                    let link_count_total = crawl_state.link_count + link_count;
                    let elapsed = crawl_state
                        .started_at
                        .map(|s| s.elapsed().as_secs_f64())
                        .unwrap_or_default();

                    let _ = tokio::task::block_in_place(|| {
                        let rt = tokio::runtime::Handle::current();
                        rt.block_on(state_clone.update_progress(
                            crawl_id,
                            crawled_urls,
                            crawl_state.queued_urls,
                            issue_count_total,
                            link_count_total,
                            Some(url.clone()),
                        ))
                    });

                    // Emit frontend progress event
                    let payload = json!({
                        "crawlId": crawl_id.to_string(),
                        "status": crawl_state.status,
                        "totalUrls": crawl_state.total_urls,
                        "totalDiscovered": crawled_urls + crawl_state.queued_urls,
                        "totalQueued": crawl_state.queued_urls,
                        "totalCompleted": crawled_urls,
                        "totalFailed": 0,
                        "totalBlocked": 0,
                        "elapsedTimeSeconds": elapsed,
                        "currentUrl": url,
                        "newUrls": [{
                            "url": url,
                            "status_code": status_code,
                            "statusCode": status_code,
                            "response_time_ms": response_time_ms,
                            "responseTimeMs": response_time_ms,
                            "title": title,
                            "depth": depth,
                        }],
                    });
                    let _ = app_clone.emit("crawl:progress", payload);
                }
            }
            CrawlEvent::Progress {
                crawled,
                total_queued,
                issues_found,
                links_discovered,
            } => {
                let crawled = *crawled as i64;
                let total_queued = *total_queued as i64;
                let issues_found = *issues_found as i64;
                let links_discovered = *links_discovered as i64;

                if let Some(crawl_state) = tokio::task::block_in_place(|| {
                    let rt = tokio::runtime::Handle::current();
                    rt.block_on(state_clone.get(crawl_id))
                }) {
                    let elapsed = crawl_state
                        .started_at
                        .map(|s| s.elapsed().as_secs_f64())
                        .unwrap_or_default();

                    let _ = tokio::task::block_in_place(|| {
                        let rt = tokio::runtime::Handle::current();
                        rt.block_on(state_clone.update_progress(
                            crawl_id,
                            crawled,
                            total_queued,
                            issues_found,
                            links_discovered,
                            crawl_state.current_url.clone(),
                        ))
                    });

                    let payload = json!({
                        "crawlId": crawl_id.to_string(),
                        "status": crawl_state.status,
                        "totalUrls": crawl_state.total_urls,
                        "totalDiscovered": crawled + total_queued,
                        "totalQueued": total_queued,
                        "totalCompleted": crawled,
                        "totalFailed": 0,
                        "totalBlocked": 0,
                        "issueCount": issues_found,
                        "linkCount": links_discovered,
                        "elapsedTimeSeconds": elapsed,
                        "newUrls": [],
                    });
                    let _ = app_clone.emit("crawl:progress", payload);
                }
            }
            CrawlEvent::Completed {
                total_crawled,
                total_issues,
                total_links,
                elapsed_ms,
                sitemap_urls,
            } => {
                info!(
                    "Crawl completed: {} URLs, {} issues, {} links in {:.0}s",
                    *total_crawled,
                    *total_issues,
                    *total_links,
                    *elapsed_ms as f64 / 1000.0
                );

                // Flush and shutdown the writer — ensures all pending data is written
                if let Err(e) = tokio::task::block_in_place(|| {
                    let rt = tokio::runtime::Handle::current();
                    rt.block_on(writer_handle.flush())
                }) {
                    warn!("Failed to flush writer on crawl completion: {}", e);
                }
                if let Err(e) = tokio::task::block_in_place(|| {
                    let rt = tokio::runtime::Handle::current();
                    rt.block_on(writer_handle.shutdown())
                }) {
                    warn!("Failed to shut down writer: {}", e);
                }

                let mut post_crawl_issues = 0i64;

                // Update crawl counters in database
                if let Ok(mut conn) = db::get_connection() {
                    // Aggregate inlinks_count for all URLs in this crawl before post-crawl detectors.
                    let _ = crate::core::storage::queries::update_inlinks_counts(&conn, crawl_id);
                    match crate::commands::issue::run_post_crawl_for_connection_with_sitemaps(
                        &mut conn,
                        crawl_id,
                        sitemap_urls,
                    ) {
                        Ok(count) => post_crawl_issues = count,
                        Err(e) => warn!("Post-crawl analysis failed for crawl {}: {}", crawl_id, e),
                    }
                    let _ = crate::core::storage::queries::update_crawl_counters(
                        &conn,
                        crawl_id,
                        *total_crawled as i64,
                        *total_issues as i64 + post_crawl_issues,
                        *total_links as i64,
                    );
                    let _ = crate::core::storage::queries::update_crawl_status(
                        &conn,
                        crawl_id,
                        "completed",
                    );
                }

                let total_crawled_i64 = *total_crawled as i64;
                let total_issues_i64 = *total_issues as i64 + post_crawl_issues;
                let total_links_i64 = *total_links as i64;
                let elapsed_seconds = *elapsed_ms as f64 / 1000.0;

                let payload = json!({
                    "crawlId": crawl_id.to_string(),
                    "status": "completed",
                    "totalUrls": total_crawled_i64,
                    "totalDiscovered": total_crawled_i64,
                    "totalQueued": 0,
                    "totalCompleted": total_crawled_i64,
                    "totalFailed": 0,
                    "totalBlocked": 0,
                    "issueCount": total_issues_i64,
                    "linkCount": total_links_i64,
                    "elapsedTimeSeconds": elapsed_seconds,
                    "newUrls": [],
                });
                let _ = app_clone.emit("crawl:progress", payload);
                let _ = app_clone.emit(
                    "crawl:status",
                    json!({ "crawlId": crawl_id.to_string(), "status": "completed" }),
                );

                // Remove from active crawl state
                let _ = tokio::task::block_in_place(|| {
                    let rt = tokio::runtime::Handle::current();
                    rt.block_on(state_clone.remove(crawl_id))
                });
            }
        }
    });

    // Run engine in background (tokio task)
    tauri::async_runtime::spawn(async move {
        let _stats = engine.run().await;
        // Stats are updated via the callback above
    });

    info!("Started crawl {} for project {}", crawl_id, project_id);
    Ok(crawl_id)
}

#[tauri::command]
pub async fn pause_crawl(crawl_id: i64, state: State<'_, CrawlManager>) -> Result<(), String> {
    state.update_status(crawl_id, "paused").await;

    let conn = db::get_connection()?;
    crate::core::storage::queries::update_crawl_status(&conn, crawl_id, "paused")
        .map_err(|e| e.to_string())?;

    info!("Paused crawl {}", crawl_id);
    Ok(())
}

#[tauri::command]
pub async fn resume_crawl(crawl_id: i64, state: State<'_, CrawlManager>) -> Result<(), String> {
    state.update_status(crawl_id, "crawling").await;

    let conn = db::get_connection()?;
    crate::core::storage::queries::update_crawl_status(&conn, crawl_id, "crawling")
        .map_err(|e| e.to_string())?;

    info!("Resumed crawl {}", crawl_id);
    Ok(())
}

#[tauri::command]
pub async fn stop_crawl(crawl_id: i64, state: State<'_, CrawlManager>) -> Result<(), String> {
    state.update_status(crawl_id, "stopping").await;

    let conn = db::get_connection()?;
    crate::core::storage::queries::update_crawl_status(&conn, crawl_id, "stopped")
        .map_err(|e| e.to_string())?;

    // Remove from active state after a delay (let engine finish gracefully)
    let cm = (*state).clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        cm.remove(crawl_id).await;
    });

    info!("Stopping crawl {}", crawl_id);
    Ok(())
}

#[tauri::command]
pub async fn get_crawl_progress(
    crawl_id: i64,
    state: State<'_, CrawlManager>,
) -> Result<crate::core::storage::models::CrawlProgress, String> {
    let crawl_state = state
        .get(crawl_id)
        .await
        .ok_or_else(|| "Crawl not found".to_string())?;

    let progress = crawl_state.to_progress_event();

    Ok(crate::core::storage::models::CrawlProgress {
        status: progress.status,
        total_urls: progress.total_urls,
        crawled_urls: progress.crawled_urls,
        queued_urls: progress.queued_urls,
        issue_count: progress.issue_count,
        link_count: progress.link_count,
        current_url: progress.current_url,
        started_at: None,
        elapsed_seconds: progress.elapsed_seconds,
    })
}

#[tauri::command]
pub fn clear_crawl(crawl_id: i64) -> Result<(), String> {
    let conn = db::get_connection()?;

    // Delete crawl-related data (order matters for FK constraints: issues, links, urls)
    conn.execute(
        "DELETE FROM issues WHERE url IN (SELECT url FROM urls WHERE crawl_id = ?1)",
        [crawl_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM links WHERE crawl_id = ?1", [crawl_id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM urls WHERE crawl_id = ?1", [crawl_id])
        .map_err(|e| e.to_string())?;

    // Reset crawl counters
    crate::core::storage::queries::update_crawl_counters(&conn, crawl_id, 0, 0, 0)
        .map_err(|e| e.to_string())?;

    info!("Cleared crawl data for crawl {}", crawl_id);
    Ok(())
}

#[tauri::command]
pub fn list_crawls(project_id: i64) -> Result<Vec<crate::core::storage::models::Crawl>, String> {
    let conn = db::get_connection()?;
    crate::core::storage::queries::list_crawls(&conn, project_id).map_err(|e| e.to_string())
}
