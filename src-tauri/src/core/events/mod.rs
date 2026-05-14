//! Event system for Tauri events — progress and state updates for the frontend.
//! Per PRD §8.8: progress events streamed to frontend without blocking crawl.

use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

/// Crawl progress state sent to frontend via Tauri events.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrawlProgressEvent {
    pub status: String,
    pub total_urls: i64,
    pub crawled_urls: i64,
    pub queued_urls: i64,
    pub issue_count: i64,
    pub link_count: i64,
    pub current_url: Option<String>,
    pub started_at: Option<String>,
    pub elapsed_seconds: Option<f64>,
}

/// Event emitted when a URL is successfully fetched.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlFetchedEvent {
    pub url: String,
    pub status_code: i32,
    pub response_time_ms: f64,
    pub depth: i32,
}

/// Event emitted when an SEO issue is detected.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueFoundEvent {
    pub issue_type: String,
    pub severity: String,
    pub url: String,
    pub message: String,
}

/// Event emitted when crawl reaches completion.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrawlCompletedEvent {
    pub crawl_id: i64,
    pub total_urls_crawled: i64,
    pub total_issues_found: i64,
    pub total_links_discovered: i64,
    pub elapsed_seconds: f64,
}

/// Crawl state holder — shared across tasks for progress tracking.
#[derive(Debug, Clone)]
pub struct CrawlState {
    pub crawl_id: i64,
    pub project_id: i64,
    pub status: String,
    pub total_urls: i64,
    pub crawled_urls: i64,
    pub queued_urls: i64,
    pub issue_count: i64,
    pub link_count: i64,
    pub current_url: Option<String>,
    pub started_at: Option<std::time::Instant>,
}

impl CrawlState {
    pub fn new(crawl_id: i64, project_id: i64) -> Self {
        Self {
            crawl_id,
            project_id,
            status: "initializing".to_string(),
            total_urls: 0,
            crawled_urls: 0,
            queued_urls: 0,
            issue_count: 0,
            link_count: 0,
            current_url: None,
            started_at: None,
        }
    }

    pub fn to_progress_event(&self) -> CrawlProgressEvent {
        let elapsed = self.started_at.map(|s| s.elapsed().as_secs_f64());

        CrawlProgressEvent {
            status: self.status.clone(),
            total_urls: self.total_urls,
            crawled_urls: self.crawled_urls,
            queued_urls: self.queued_urls,
            issue_count: self.issue_count,
            link_count: self.link_count,
            current_url: self.current_url.clone(),
            started_at: None, // Will be set by command handler
            elapsed_seconds: elapsed,
        }
    }
}

/// Shared state for managing active crawls.
#[derive(Debug, Default)]
pub struct CrawlManager {
    states: std::sync::Arc<RwLock<std::collections::HashMap<i64, Arc<CrawlState>>>>,
}

impl Clone for CrawlManager {
    fn clone(&self) -> Self {
        Self {
            states: std::sync::Arc::clone(&self.states),
        }
    }
}

impl CrawlManager {
    pub fn new() -> Self {
        Self {
            states: std::sync::Arc::new(RwLock::new(std::collections::HashMap::new())),
        }
    }

    /// Register a new crawl state.
    pub async fn register(&self, state: Arc<CrawlState>) {
        let mut map = self.states.write().await;
        let crawl_id = state.crawl_id;
        map.insert(crawl_id, state);
        info!("Crawl {} registered", crawl_id);
    }

    /// Get a reference to a crawl state.
    pub async fn get(&self, crawl_id: i64) -> Option<Arc<CrawlState>> {
        let map = self.states.read().await;
        map.get(&crawl_id).cloned()
    }

    /// Update the status of a crawl.
    pub async fn update_status(&self, crawl_id: i64, status: &str) {
        if let Some(state) = self.get(crawl_id).await {
            let mut s = (*state).clone();
            s.status = status.to_string();
            self.register(Arc::new(s)).await;
        }
    }

    /// Update crawled URL count.
    pub async fn update_crawled(&self, crawl_id: i64, count: i64) {
        if let Some(state) = self.get(crawl_id).await {
            let mut s = (*state).clone();
            s.crawled_urls += count;
            self.register(Arc::new(s)).await;
        }
    }

    /// Update current URL being processed.
    pub async fn update_current_url(&self, crawl_id: i64, url: Option<String>) {
        if let Some(state) = self.get(crawl_id).await {
            let mut s = (*state).clone();
            s.current_url = url;
            self.register(Arc::new(s)).await;
        }
    }

    /// Update issue count.
    pub async fn update_issues(&self, crawl_id: i64, count: i64) {
        if let Some(state) = self.get(crawl_id).await {
            let mut s = (*state).clone();
            s.issue_count += count;
            self.register(Arc::new(s)).await;
        }
    }

    /// Update link count.
    pub async fn update_links(&self, crawl_id: i64, count: i64) {
        if let Some(state) = self.get(crawl_id).await {
            let mut s = (*state).clone();
            s.link_count += count;
            self.register(Arc::new(s)).await;
        }
    }

    /// Apply a full progress snapshot in one write to avoid repeated lock churn per URL.
    pub async fn update_progress(
        &self,
        crawl_id: i64,
        crawled_urls: i64,
        queued_urls: i64,
        issue_count: i64,
        link_count: i64,
        current_url: Option<String>,
    ) {
        if let Some(state) = self.get(crawl_id).await {
            let mut s = (*state).clone();
            s.crawled_urls = crawled_urls;
            s.queued_urls = queued_urls;
            s.issue_count = issue_count;
            s.link_count = link_count;
            s.current_url = current_url;
            self.register(Arc::new(s)).await;
        }
    }

    /// List all active crawl IDs.
    pub async fn list_active(&self) -> Vec<i64> {
        let map = self.states.read().await;
        map.iter()
            .filter(|(_, s)| !["completed", "failed", "cancelled"].contains(&s.status.as_str()))
            .map(|(id, _)| *id)
            .collect()
    }

    /// Remove a completed crawl state.
    pub async fn remove(&self, crawl_id: i64) {
        let mut map = self.states.write().await;
        map.remove(&crawl_id);
        info!("Crawl {} removed from active state", crawl_id);
    }
}
