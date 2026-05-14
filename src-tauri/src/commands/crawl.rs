//! Crawl commands — lifecycle management (start, pause, resume, stop).

use crate::core::crawler::engine::{CrawlEngine, CrawlEngineConfig, CrawlEvent, CrawlResult};
use crate::core::crawler::fetcher::FetcherConfig;
use crate::core::crawler::models::{ExtractedLink, SeoIssue};
use crate::core::storage::db;
use crate::core::storage::models::{CrawlProgress, CrawlSettings};
use crate::core::events::CrawlManager;
use serde_json::json;
use tauri::{AppHandle, Emitter, State};
use tracing::{info, warn};

const URL_INSERT_BATCH_SIZE: usize = 50;

#[derive(Debug)]
enum CrawlPersistenceEvent {
    UrlFetched(CrawlResult),
    Progress {
        crawled: usize,
        total_queued: usize,
        issues_found: usize,
        links_discovered: usize,
    },
    Completed {
        total_crawled: usize,
        total_issues: usize,
        total_links: usize,
        elapsed_ms: u64,
    },
}

#[derive(Debug, Clone)]
struct PendingUrlInsert {
    url: String,
    status_code: i32,
    response_time_ms: f64,
    title: Option<String>,
    depth: i32,
    issue_count: i64,
    link_count: i64,
    fetch_result_json: String,
    seo_data_json: String,
    indexability: String,
}

/// A URL record along with its associated issues and links for persistence.
struct PendingUrlWithRelations {
    insert: PendingUrlInsert,
    issues: Vec<SeoIssue>,
    links: Vec<ExtractedLink>,
}

impl PendingUrlInsert {
    fn from_result(result: &CrawlResult) -> Self {
        let status_code = result.fetch_result.status_code;
        let fetch_result_json = json!({
            "statusCode": result.fetch_result.status_code,
            "finalUrl": result.fetch_result.final_url,
            "requestedUrl": result.fetch_result.requested_url,
            "contentType": result.fetch_result.content_type,
            "contentLength": result.fetch_result.content_length,
            "responseTimeMs": result.fetch_result.response_time_ms,
            "isRedirect": result.fetch_result.is_redirect,
            "redirectCount": result.fetch_result.redirect_count,
            "wasJsRendered": result.fetch_result.was_js_rendered,
            "errorMessage": result.fetch_result.error_message,
        }).to_string();
        let seo_data_json = serde_json::to_string(&result.seo_data).unwrap_or_else(|_| "{}".to_string());
        let indexability = if result.seo_data.noindex || status_code >= 400 {
            "non_indexable"
        } else {
            "indexable"
        }
        .to_string();

        Self {
            url: result.url.clone(),
            status_code,
            response_time_ms: result.fetch_result.response_time_ms,
            title: result.seo_data.title.clone(),
            depth: result.depth,
            issue_count: result.issues.len() as i64,
            link_count: result.extracted_links.len() as i64,
            fetch_result_json,
            seo_data_json,
            indexability,
        }
    }
}

fn flush_url_batch(
    conn: &mut rusqlite::Connection,
    project_id: i64,
    crawl_id: i64,
    pending: &mut Vec<PendingUrlInsert>,
) -> Result<Vec<i64>, rusqlite::Error> {
    if pending.is_empty() {
        return Ok(vec![]);
    }

    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.transaction()?;
    let mut url_ids = Vec::with_capacity(pending.len());
    {
        let mut stmt = tx.prepare(
            "INSERT INTO urls (url, project_id, crawl_id, fetch_result_json, seo_data_json, indexability, depth, discovered_at, fetched_at, last_crawled_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?8)"
        )?;
        for record in pending.iter() {
            stmt.execute(rusqlite::params![
                &record.url,
                project_id,
                crawl_id,
                &record.fetch_result_json,
                &record.seo_data_json,
                &record.indexability,
                record.depth,
                &now
            ])?;
            url_ids.push(tx.query_row("SELECT last_insert_rowid()", [], |row| row.get(0))?);
        }
    }
    tx.commit()?;
    pending.clear();
    Ok(url_ids)
}

/// Persist issues and links for a single URL (called after URL insert).
fn persist_issues_and_links(
    conn: &mut rusqlite::Connection,
    url_id: i64,
    url: &str,
    issues: &[SeoIssue],
    links: &[ExtractedLink],
) -> Result<(), String> {
    if !issues.is_empty() {
        let now = chrono::Utc::now().to_rfc3339();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        {
            let mut stmt = tx.prepare(
                "INSERT INTO issues (url_id, url, issue_type, severity, category, message, details_json, detected_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
            ).map_err(|e| e.to_string())?;
            for issue in issues {
                let details = serde_json::to_string(&issue.details).unwrap_or_else(|_| "null".to_string());
                // Use serde serialization (snake_case) instead of Debug format for severity/category
                let severity = serde_json::to_string(&issue.severity)
                    .unwrap_or_else(|_| format!("{:?}", issue.severity))
                    .trim_matches('"')
                    .to_string();
                let category = serde_json::to_string(&issue.category)
                    .unwrap_or_else(|_| format!("{:?}", issue.category))
                    .trim_matches('"')
                    .to_string();
                stmt.execute(rusqlite::params![
                    url_id,
                    url,
                    &issue.issue_type,
                    severity,
                    category,
                    &issue.message,
                    details,
                    now,
                ]).map_err(|e| e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
    }

    if !links.is_empty() {
        let now = chrono::Utc::now().to_rfc3339();
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        {
            let mut stmt = tx.prepare(
                "INSERT INTO links (source_url_id, source_url, target_url, link_relation, anchor_text, is_internal, is_no_follow, detected_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
            ).map_err(|e| e.to_string())?;
            for link in links {
                let relation = format!("{:?}", link.link_type);
                stmt.execute(rusqlite::params![
                    url_id,
                    url,
                    &link.href,
                    relation,
                    link.anchor_text.as_deref().unwrap_or(""),
                    link.is_internal,
                    link.is_no_follow,
                    now,
                ]).map_err(|e| e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
    }

    Ok(())
}

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
        crate::core::storage::queries::create_crawl(&conn, project_id, Some(&json)).map_err(|e| e.to_string())?;
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
    let _ = app.emit("crawl:status", json!({ "crawlId": crawl_id.to_string(), "status": "running" }));

    // Build engine config
    let fetcher_config = FetcherConfig {
        user_agent: settings.user_agent.clone(),
        timeout_seconds: settings.timeout_seconds as u64,
        max_response_size_kb: settings.max_response_size_kb as usize,
        follow_redirects: settings.follow_redirects,
        max_redirects: settings.max_redirects as usize,
        accept_language: settings.accept_language.clone(),
        custom_headers: None, // Parse from JSON in settings if provided
    };

    let engine_config = CrawlEngineConfig {
        root_url,
        max_urls: settings.max_urls as usize,
        max_depth: settings.max_depth,
        concurrency: settings.concurrency as usize,
        delay_between_requests_ms: settings.delay_between_requests_ms as u64,
        fetcher_config,
        respect_robots_txt: settings.respect_robots_txt,
        custom_headers: None,
    };

    // Create and run engine (in background)
    let crawl_id_for_cleanup = crawl_id;
    let state_clone = (*state).clone();
    let app_clone = app.clone();
    let (event_tx, mut event_rx) = tokio::sync::mpsc::unbounded_channel::<CrawlPersistenceEvent>();
    
    let mut engine = CrawlEngine::new(engine_config);
    
    // Set up event callback
    engine.on_event(move |event| {
        let message = match event {
            CrawlEvent::UrlFetched(result) => {
                info!("Crawled: {} (status {})", result.url, result.fetch_result.status_code);
                CrawlPersistenceEvent::UrlFetched(result.clone())
            }
            CrawlEvent::Progress { crawled, total_queued, issues_found, links_discovered } => {
                CrawlPersistenceEvent::Progress {
                    crawled: *crawled,
                    total_queued: *total_queued,
                    issues_found: *issues_found,
                    links_discovered: *links_discovered,
                }
            }
            CrawlEvent::Completed { total_crawled, total_issues, total_links, elapsed_ms } => {
                info!("Crawl completed: {} URLs, {} issues, {} links in {:.0}s", 
                      *total_crawled, *total_issues, *total_links, *elapsed_ms as f64 / 1000.0);
                CrawlPersistenceEvent::Completed {
                    total_crawled: *total_crawled,
                    total_issues: *total_issues,
                    total_links: *total_links,
                    elapsed_ms: *elapsed_ms,
                }
            }
        };
        let _ = event_tx.send(message);
    });

    tauri::async_runtime::spawn(async move {
        let mut conn = match db::get_connection() {
            Ok(conn) => conn,
            Err(error) => {
                warn!("Failed to open crawl persistence connection: {}", error);
                return;
            }
        };
        let _ = conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA busy_timeout = 30000;",
        );

        let mut pending_urls: Vec<PendingUrlWithRelations> = Vec::with_capacity(URL_INSERT_BATCH_SIZE);
        while let Some(event) = event_rx.recv().await {
            match event {
                CrawlPersistenceEvent::UrlFetched(result) => {
                    // Clone issues/links before creating PendingUrlInsert (which borrows result)
                    let issues: Vec<SeoIssue> = result.issues.clone();
                    let links: Vec<ExtractedLink> = result.extracted_links.clone();
                    let record = PendingUrlInsert::from_result(&result);

                    // Extract fields for frontend payload (before pushing to pending)
                    let url = record.url.clone();
                    let status_code = record.status_code;
                    let response_time_ms = record.response_time_ms;
                    let title = record.title.clone();
                    let depth = record.depth;
                    let issue_count = record.issue_count;
                    let link_count = record.link_count;

                    pending_urls.push(PendingUrlWithRelations {
                        insert: record.clone(),
                        issues,
                        links,
                    });

                    if pending_urls.len() >= URL_INSERT_BATCH_SIZE {
                        // Flush URLs first and get their IDs
                        let inserts: Vec<PendingUrlInsert> = pending_urls.iter().map(|p| p.insert.clone()).collect();
                        let mut temp_pending = inserts;
                        let url_ids = match flush_url_batch(&mut conn, project_id, crawl_id_for_cleanup, &mut temp_pending) {
                            Ok(ids) => ids,
                            Err(error) => {
                                warn!("Failed to insert URL batch for crawl {}: {}", crawl_id_for_cleanup, error);
                                vec![]
                            }
                        };

                        // Persist issues and links for each URL in the batch
                        for (i, pending) in pending_urls.iter().enumerate() {
                            if let Some(&url_id) = url_ids.get(i) {
                                if let Err(error) = persist_issues_and_links(
                                    &mut conn, url_id, &pending.insert.url, &pending.issues, &pending.links,
                                ) {
                                    warn!("Failed to persist issues/links for URL {}: {}", pending.insert.url, error);
                                }
                            }
                        }

                        pending_urls.clear();
                    }

                    if let Some(state) = state_clone.get(crawl_id_for_cleanup).await {
                        let crawled_urls = state.crawled_urls + 1;
                        let queued_urls = state.queued_urls;
                        let issue_count_total = state.issue_count + issue_count;
                        let link_count_total = state.link_count + link_count;
                        let elapsed = state.started_at.map(|started| started.elapsed().as_secs_f64()).unwrap_or_default();

                        state_clone
                            .update_progress(
                                crawl_id_for_cleanup,
                                crawled_urls,
                                queued_urls,
                                issue_count_total,
                                link_count_total,
                                Some(url.clone()),
                            )
                            .await;

                        let payload = json!({
                            "crawlId": crawl_id_for_cleanup.to_string(),
                            "status": state.status,
                            "totalUrls": state.total_urls,
                            "totalDiscovered": crawled_urls + queued_urls,
                            "totalQueued": queued_urls,
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
                                "depth": depth
                            }],
                        });
                        let _ = app_clone.emit("crawl:progress", payload);
                    }
                }
                CrawlPersistenceEvent::Progress { crawled, total_queued, issues_found, links_discovered } => {
                    let crawled = crawled as i64;
                    let total_queued = total_queued as i64;
                    let issues_found = issues_found as i64;
                    let links_discovered = links_discovered as i64;

                    if let Some(state) = state_clone.get(crawl_id_for_cleanup).await {
                        let elapsed = state.started_at.map(|started| started.elapsed().as_secs_f64()).unwrap_or_default();
                        state_clone
                            .update_progress(
                                crawl_id_for_cleanup,
                                crawled,
                                total_queued,
                                issues_found,
                                links_discovered,
                                state.current_url.clone(),
                            )
                            .await;

                        let payload = json!({
                            "crawlId": crawl_id_for_cleanup.to_string(),
                            "status": state.status,
                            "totalUrls": state.total_urls,
                            "totalDiscovered": crawled + total_queued,
                            "totalQueued": total_queued,
                            "totalCompleted": crawled,
                            "totalFailed": 0,
                            "totalBlocked": 0,
                            "issueCount": issues_found,
                            "linkCount": links_discovered,
                            "elapsedTimeSeconds": elapsed,
                            "currentUrl": state.current_url,
                            "newUrls": [],
                        });
                        let _ = app_clone.emit("crawl:progress", payload);
                    }
                }
                CrawlPersistenceEvent::Completed { total_crawled, total_issues, total_links, elapsed_ms } => {
                    // Flush any remaining URLs and persist their issues/links
                    if !pending_urls.is_empty() {
                        let inserts: Vec<PendingUrlInsert> = pending_urls.iter().map(|p| p.insert.clone()).collect();
                        let mut temp_pending = inserts;
                        let url_ids = match flush_url_batch(&mut conn, project_id, crawl_id_for_cleanup, &mut temp_pending) {
                            Ok(ids) => ids,
                            Err(error) => {
                                warn!("Failed to flush final URL batch for crawl {}: {}", crawl_id_for_cleanup, error);
                                vec![]
                            }
                        };
                        // Persist issues/links for remaining URLs
                        for (i, pending) in pending_urls.iter().enumerate() {
                            if let Some(&url_id) = url_ids.get(i) {
                                if let Err(error) = persist_issues_and_links(
                                    &mut conn, url_id, &pending.insert.url, &pending.issues, &pending.links,
                                ) {
                                    warn!("Failed to persist final issues/links for URL {}: {}", pending.insert.url, error);
                                }
                            }
                        }
                    } else {
                        let _ = flush_url_batch(&mut conn, project_id, crawl_id_for_cleanup, &mut Vec::new());
                    }

                    let total_crawled = total_crawled as i64;
                    let total_issues = total_issues as i64;
                    let total_links = total_links as i64;
                    let elapsed_seconds = elapsed_ms as f64 / 1000.0;

                    let _ = crate::core::storage::queries::update_crawl_counters(
                        &conn,
                        crawl_id_for_cleanup,
                        total_crawled,
                        total_issues,
                        total_links,
                    );
                    let _ = crate::core::storage::queries::update_crawl_status(&conn, crawl_id_for_cleanup, "completed");

                    let payload = json!({
                        "crawlId": crawl_id_for_cleanup.to_string(),
                        "status": "completed",
                        "totalUrls": total_crawled,
                        "totalDiscovered": total_crawled,
                        "totalQueued": 0,
                        "totalCompleted": total_crawled,
                        "totalFailed": 0,
                        "totalBlocked": 0,
                        "issueCount": total_issues,
                        "linkCount": total_links,
                        "elapsedTimeSeconds": elapsed_seconds,
                        "newUrls": [],
                    });
                    let _ = app_clone.emit("crawl:progress", payload);
                    let _ = app_clone.emit("crawl:status", json!({ "crawlId": crawl_id_for_cleanup.to_string(), "status": "completed" }));
                    state_clone.remove(crawl_id_for_cleanup).await;
                    break;
                }
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
pub async fn get_crawl_progress(crawl_id: i64, state: State<'_, CrawlManager>) -> Result<CrawlProgress, String> {
    let crawl_state = state.get(crawl_id).await
        .ok_or_else(|| "Crawl not found".to_string())?;
    
    let progress = crawl_state.to_progress_event();
    
    Ok(CrawlProgress {
        status: progress.status,
        total_urls: progress.total_urls,
        crawled_urls: progress.crawled_urls,
        queued_urls: progress.queued_urls,
        issue_count: progress.issue_count,
        link_count: progress.link_count,
        current_url: progress.current_url,
        started_at: None, // Would be set from DB
        elapsed_seconds: progress.elapsed_seconds,
    })
}

#[tauri::command]
pub fn clear_crawl(crawl_id: i64) -> Result<(), String> {
    let conn = db::get_connection()?;
    
    // Delete crawl-related data
    conn.execute("DELETE FROM urls WHERE crawl_id = ?1", [crawl_id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM links WHERE source_url_id IN (SELECT id FROM urls WHERE crawl_id = ?1)", [crawl_id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM issues WHERE url_id IN (SELECT id FROM urls WHERE crawl_id = ?1)", [crawl_id])
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
