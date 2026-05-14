//! Main crawl engine — orchestrates fetcher, parser, frontier, scope, and issue detection.
//! Wires CrawlResult data through the writer channel to SQLite for persistence.

use futures::stream::{FuturesUnordered, StreamExt};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{sleep, timeout, Duration};
use tracing::{debug, info, warn};

use super::fetcher::{Fetcher, FetcherConfig};
use super::frontier::UrlFrontier;
use super::issues::detect_issues;
use super::models::*;
use super::normalizer::normalize_url;
use super::parser::{extract_html_links, parse_html};
use super::robots::RobotsService;
use super::scope::ScopeService;
use super::sitemap;
use crate::core::storage::writer::{
    IssueWriteRecord, LinkWriteRecord, PageCrawledData, WriteHandle,
};
use std::collections::HashSet;

/// Configuration for the crawl engine.
#[derive(Debug, Clone)]
pub struct CrawlEngineConfig {
    pub root_url: String,
    pub max_urls: usize,
    pub max_depth: i32,
    pub concurrency: usize,
    pub delay_between_requests_ms: u64,
    pub fetcher_config: FetcherConfig,
    pub respect_robots_txt: bool,
    pub respect_sitemaps: bool,
    pub custom_headers: Option<Vec<(String, String)>>,
}

/// Result of crawling a single URL.
#[derive(Debug, Clone)]
pub struct CrawlResult {
    pub url: String,
    pub fetch_result: FetchResult,
    pub seo_data: SeoData,
    pub extracted_links: Vec<ExtractedLink>,
    pub issues: Vec<SeoIssue>,
    pub depth: i32,
}

/// Event callback type for crawl progress.
pub type CrawlCallback = Arc<dyn Fn(&CrawlEvent) + Send + Sync>;

/// Events emitted during crawling.
#[derive(Debug)]
pub enum CrawlEvent {
    /// A URL was successfully fetched and parsed.
    UrlFetched(CrawlResult),
    /// Crawl progress update.
    Progress {
        crawled: usize,
        total_queued: usize,
        issues_found: usize,
        links_discovered: usize,
    },
    /// Crawl completed (success or failure).
    Completed {
        total_crawled: usize,
        total_issues: usize,
        total_links: usize,
        elapsed_ms: u64,
        sitemap_urls: Vec<String>,
    },
}

/// The main crawl engine.
pub struct CrawlEngine {
    config: CrawlEngineConfig,
    frontier: Arc<Mutex<UrlFrontier>>,
    scope: ScopeService,
    robots: Arc<Mutex<RobotsService>>,
    callback: Option<CrawlCallback>,
    stats: Arc<Mutex<CrawlStats>>,
    sitemap_urls: Arc<Mutex<HashSet<String>>>,
    writer: Option<WriteHandle>,
    /// Project ID and crawl ID for SQLite persistence.
    project_id: i64,
    crawl_id: i64,
}

impl Clone for CrawlEngine {
    fn clone(&self) -> Self {
        Self {
            config: self.config.clone(),
            frontier: Arc::clone(&self.frontier),
            scope: ScopeService::new(&self.config.root_url),
            robots: Arc::clone(&self.robots),
            callback: None, // callbacks are not cloned
            stats: Arc::clone(&self.stats),
            sitemap_urls: Arc::clone(&self.sitemap_urls),
            writer: self.writer.clone(),
            project_id: self.project_id,
            crawl_id: self.crawl_id,
        }
    }
}

#[derive(Debug, Default)]
pub struct CrawlStats {
    pub total_crawled: usize,
    pub total_issues: usize,
    pub total_links: usize,
    pub started_at: Option<std::time::Instant>,
}

/// Determine indexability from SEO data and HTTP status.
fn determine_indexability(seo_data: &SeoData, status_code: i32) -> String {
    if seo_data.noindex || status_code >= 400 {
        "non_indexable"
    } else {
        "indexable"
    }
    .to_string()
}

/// Convert a CrawlResult to a PageCrawledData for the writer channel.
fn result_to_page_data(result: &CrawlResult, project_id: i64, crawl_id: i64) -> PageCrawledData {
    let indexability = determine_indexability(&result.seo_data, result.fetch_result.status_code);

    // Serialize fetch_result and seo_data to JSON strings
    let fetch_result_json = serde_json::json!({
        "statusCode": result.fetch_result.status_code,
        "finalUrl": result.fetch_result.final_url,
        "requestedUrl": result.fetch_result.requested_url,
        "headers": result.fetch_result.headers,
        "headersJson": serde_json::to_string(&result.fetch_result.headers).ok(),
        "contentType": result.fetch_result.content_type,
        "contentLength": result.fetch_result.content_length,
        "responseTimeMs": result.fetch_result.response_time_ms,
        "isRedirect": result.fetch_result.is_redirect,
        "redirectCount": result.fetch_result.redirect_count,
        "wasJsRendered": result.fetch_result.was_js_rendered,
        "errorMessage": result.fetch_result.error_message,
    })
    .to_string();

    let seo_data_json =
        serde_json::to_string(&result.seo_data).unwrap_or_else(|_| "{}".to_string());

    // Convert issues to IssueWriteRecords
    let issues: Vec<IssueWriteRecord> = result
        .issues
        .iter()
        .map(|issue| {
            let severity = serde_json::to_string(&issue.severity)
                .unwrap_or_else(|_| format!("{:?}", issue.severity))
                .trim_matches('"')
                .to_string();
            let category = serde_json::to_string(&issue.category)
                .unwrap_or_else(|_| format!("{:?}", issue.category))
                .trim_matches('"')
                .to_string();
            let details_json =
                serde_json::to_string(&issue.details).unwrap_or_else(|_| "null".to_string());
            IssueWriteRecord {
                issue_type: issue.issue_type.clone(),
                severity,
                category,
                url_id: None, // Will be set by writer after URL insert
                url: result.url.clone(),
                message: issue.message.clone(),
                details_json: Some(details_json),
            }
        })
        .collect();

    // Convert extracted links to LinkWriteRecords
    let links: Vec<LinkWriteRecord> = result
        .extracted_links
        .iter()
        .map(|link| {
            let relation = match link.link_type {
                LinkType::HtmlA => "HtmlA",
                LinkType::Canonical => "Canonical",
                LinkType::Image => "Image",
                LinkType::Script => "Script",
                LinkType::Css => "Css",
                LinkType::IFrame => "IFrame",
            }
            .to_string();
            LinkWriteRecord {
                source_url_id: 0, // Will be set by writer after URL insert
                source_url: result.url.clone(),
                target_url: link.href.clone(),
                link_relation: relation,
                anchor_text: link.anchor_text.clone(),
                is_internal: link.is_internal,
                is_no_follow: link.is_no_follow,
            }
        })
        .collect();

    PageCrawledData {
        project_id,
        crawl_id,
        url: result.url.clone(),
        depth: result.depth,
        indexability,
        fetch_result_json,
        seo_data_json,
        issues,
        links,
    }
}

impl CrawlEngine {
    pub fn new(config: CrawlEngineConfig) -> Self {
        let root_url = config.root_url.clone();
        let max_urls = config.max_urls;
        let max_depth = config.max_depth;
        Self {
            config,
            frontier: Arc::new(Mutex::new(UrlFrontier::new(max_urls, max_depth))),
            scope: ScopeService::new(&root_url),
            robots: Arc::new(Mutex::new(RobotsService::new())),
            callback: None,
            stats: Arc::new(Mutex::new(CrawlStats::default())),
            sitemap_urls: Arc::new(Mutex::new(HashSet::new())),
            writer: None,
            project_id: 0,
            crawl_id: 0,
        }
    }

    /// Set the writer handle for persisting crawl data to SQLite.
    pub fn set_writer(&mut self, writer: WriteHandle) {
        self.writer = Some(writer);
    }

    /// Set the project_id and crawl_id for database persistence.
    pub fn set_project_context(&mut self, project_id: i64, crawl_id: i64) {
        self.project_id = project_id;
        self.crawl_id = crawl_id;
    }

    /// Set the event callback for progress reporting.
    pub fn on_event<F>(&mut self, handler: F)
    where
        F: Fn(&CrawlEvent) + Send + Sync + 'static,
    {
        self.callback = Some(Arc::new(handler));
    }

    /// Add URLs to the frontier (e.g., from sitemap or seed URLs).
    pub async fn seed_urls(&self, urls: Vec<String>, depth: i32) -> usize {
        let mut frontier = self.frontier.lock().await;
        let mut added = 0;
        for url in urls {
            if let Some(normalized) = normalize_url(&url) {
                if self.scope.is_in_scope(&normalized) {
                    if frontier.enqueue(normalized, depth) {
                        added += 1;
                    }
                }
            }
        }
        info!("Seeded {} URLs (depth {})", added, depth);
        added
    }

    /// Run the crawl — main loop.
    pub async fn run(&self) -> CrawlStats {
        let start = std::time::Instant::now();
        {
            let mut stats = self.stats.lock().await;
            stats.started_at = Some(start);
        }

        info!(
            "Starting crawl: {} (max_urls={}, concurrency={})",
            self.config.root_url, self.config.max_urls, self.config.concurrency
        );

        if let Some(root_url) = normalize_url(&self.config.root_url) {
            let mut frontier = self.frontier.lock().await;
            frontier.enqueue(root_url, 0);
        } else {
            warn!("Invalid root URL: {}", self.config.root_url);
        }

        // Fetch robots.txt first if enabled
        if self.config.respect_robots_txt {
            if let Err(e) = self.fetch_robots().await {
                warn!("Failed to fetch robots.txt: {}", e);
            }
        }

        if self.config.respect_sitemaps {
            match self.fetch_sitemap_urls().await {
                Ok(urls) => {
                    let seeded = self.seed_urls(urls.clone(), 0).await;
                    self.sitemap_urls.lock().await.extend(urls);
                    info!("Loaded sitemap URLs; seeded {} in-scope URL(s)", seeded);
                }
                Err(e) => warn!("Failed to fetch sitemap URLs: {}", e),
            }
        }

        let fetcher = Arc::new(Fetcher::new(FetcherConfig {
            custom_headers: self.config.custom_headers.clone(),
            ..self.config.fetcher_config.clone()
        }));
        let concurrency = self.config.concurrency.max(1);
        let timeout_seconds = self
            .config
            .fetcher_config
            .timeout_seconds
            .saturating_add(5)
            .max(1);
        let mut in_flight = FuturesUnordered::new();

        // Crawl loop — keep up to `concurrency` URL fetches active until frontier is empty or max reached.
        loop {
            while in_flight.len() < concurrency {
                let total_crawled = self.stats.lock().await.total_crawled;
                if total_crawled + in_flight.len() >= self.config.max_urls {
                    info!("Reached max_urls limit ({})", self.config.max_urls);
                    break;
                }

                let entry = {
                    let mut frontier = self.frontier.lock().await;
                    frontier.dequeue()
                };

                let entry = match entry {
                    Some(entry) => entry,
                    None => break,
                };
                let url = entry.url.clone();

                // Mark when scheduled so other concurrent pages cannot enqueue the same URL again.
                self.frontier.lock().await.mark_visited(&url);

                // Check robots.txt
                if self.config.respect_robots_txt {
                    let robots = self.robots.lock().await;
                    if let Some(parsed) = url::Url::parse(&url).ok() {
                        let hostname = parsed.host_str().unwrap_or("");
                        let path = parsed.path();
                        if !robots.is_allowed(hostname, path) {
                            debug!("Blocked by robots.txt: {}", url);
                            continue;
                        }
                    }
                }

                let fetcher = Arc::clone(&fetcher);
                in_flight.push(Self::crawl_entry(entry, fetcher, timeout_seconds));

                if self.config.delay_between_requests_ms > 0 {
                    sleep(Duration::from_millis(self.config.delay_between_requests_ms)).await;
                }
            }

            if in_flight.is_empty() {
                info!("Frontier exhausted");
                break;
            };

            let Some(result) = in_flight.next().await else {
                continue;
            };

            // Persist to SQLite via writer channel (awaited directly, not
            // spawned, so that flush() later guarantees all writes landed)
            if let Some(ref writer) = self.writer {
                let page_data = result_to_page_data(&result, self.project_id, self.crawl_id);
                if let Err(e) = writer.page_crawled(page_data).await {
                    warn!("Failed to send page data to writer: {}", e);
                }
            }

            // Emit event
            if let Some(ref callback) = self.callback {
                callback(&CrawlEvent::UrlFetched(result.clone()));
            }

            // Update stats
            let (total_crawled, total_issues, total_links) = {
                let mut s = self.stats.lock().await;
                s.total_crawled += 1;
                s.total_issues += result.issues.len();
                s.total_links += result.extracted_links.len();
                (s.total_crawled, s.total_issues, s.total_links)
            };

            // Add discovered links to frontier
            for link in &result.extracted_links {
                if link.link_type == LinkType::HtmlA && !link.is_no_follow {
                    let normalized = normalize_url(&link.href);
                    if let Some(ref norm_url) = normalized {
                        if self.scope.is_in_scope(norm_url) {
                            self.frontier
                                .lock()
                                .await
                                .enqueue(norm_url.clone(), result.depth + 1);
                        }
                    }
                }
            }

            // Emit progress event periodically
            let frontier = self.frontier.lock().await;
            if let Some(ref callback) = self.callback {
                callback(&CrawlEvent::Progress {
                    crawled: total_crawled,
                    total_queued: frontier.queued_count() + in_flight.len(),
                    issues_found: total_issues,
                    links_discovered: total_links,
                });
            }
        }

        // Flush remaining data: wait for all pending writes to be committed
        // before declaring crawl complete. This guarantees every
        // PageCrawled message has been persisted to SQLite.
        if let Some(ref writer) = self.writer {
            if let Err(e) = writer.flush().await {
                warn!("Failed to flush writer: {}", e);
            }
        }

        // Final stats
        let elapsed = start.elapsed().as_millis() as u64;
        let mut s = self.stats.lock().await;

        info!(
            "Crawl completed: {} URLs crawled, {} issues, {} links, {:.0}s",
            s.total_crawled,
            s.total_issues,
            s.total_links,
            elapsed as f64 / 1000.0
        );

        // Emit completion event
        if let Some(ref callback) = self.callback {
            let sitemap_urls: Vec<String> =
                self.sitemap_urls.lock().await.iter().cloned().collect();
            callback(&CrawlEvent::Completed {
                total_crawled: s.total_crawled,
                total_issues: s.total_issues,
                total_links: s.total_links,
                elapsed_ms: elapsed,
                sitemap_urls,
            });
        }

        std::mem::take(&mut *s)
    }

    async fn crawl_entry(
        entry: FrontierEntry,
        fetcher: Arc<Fetcher>,
        timeout_seconds: u64,
    ) -> CrawlResult {
        let url = entry.url;
        let depth = entry.depth;
        let fetch_result =
            match timeout(Duration::from_secs(timeout_seconds), fetcher.fetch(&url)).await {
                Ok(result) => result,
                Err(_) => {
                    warn!("Fetch timed out after {}s for {}", timeout_seconds, url);
                    FetchResult {
                        status_code: 0,
                        final_url: url.clone(),
                        requested_url: url.clone(),
                        headers: std::collections::HashMap::new(),
                        content_type: None,
                        content_length: None,
                        response_time_ms: timeout_seconds as f64 * 1000.0,
                        is_redirect: false,
                        redirect_count: 0,
                        was_js_rendered: false,
                        html_content: None,
                        error_message: Some(format!(
                            "Fetch timed out after {} seconds",
                            timeout_seconds
                        )),
                    }
                }
            };

        // Parse crawlable HTML; still record failed/non-HTML attempts so progress never goes silent.
        let (seo_data, extracted_links) = if Self::is_crawlable(&fetch_result) {
            match &fetch_result.html_content {
                Some(html) => (parse_html(&url, html), extract_html_links(&url, html)),
                None => {
                    warn!("No HTML content for: {}", url);
                    (SeoData::default(), Vec::new())
                }
            }
        } else {
            debug!(
                "Recording non-crawlable attempt: {} ({})",
                url, fetch_result.status_code
            );
            (SeoData::default(), Vec::new())
        };

        let issues = detect_issues(&fetch_result, &seo_data);

        CrawlResult {
            url: fetch_result.final_url.clone(),
            fetch_result,
            seo_data,
            extracted_links,
            issues,
            depth,
        }
    }

    /// Fetch and parse robots.txt for the root hostname.
    async fn fetch_robots(&self) -> Result<(), anyhow::Error> {
        let base_url = url::Url::parse(&self.config.root_url)?;
        let hostname = base_url.host_str().unwrap_or("");
        let scheme = base_url.scheme();

        let robots_url = format!("{}://{}/robots.txt", scheme, hostname);
        let fetcher = Fetcher::new(self.config.fetcher_config.clone());
        let result = fetcher.fetch(&robots_url).await;

        if result.status_code == 200 {
            if let Some(html) = result.html_content {
                let mut robots = self.robots.lock().await;
                robots.parse(hostname, &html);
                info!("Loaded robots.txt for {}", hostname);
            }
        } else {
            debug!("No robots.txt found (status {})", result.status_code);
        }

        Ok(())
    }

    /// Fetch and parse sitemap.xml for the root hostname.
    async fn fetch_sitemap_urls(&self) -> Result<Vec<String>, anyhow::Error> {
        let base_url = url::Url::parse(&self.config.root_url)?;
        let hostname = base_url.host_str().unwrap_or("");
        let scheme = base_url.scheme();
        let sitemap_url = format!("{}://{}/sitemap.xml", scheme, hostname);
        let fetcher = Fetcher::new(self.config.fetcher_config.clone());

        self.fetch_sitemap_tree(&fetcher, &sitemap_url, 0).await
    }

    async fn fetch_sitemap_tree(
        &self,
        fetcher: &Fetcher,
        sitemap_url: &str,
        depth: usize,
    ) -> Result<Vec<String>, anyhow::Error> {
        if depth > 2 {
            return Ok(Vec::new());
        }

        let result = fetcher.fetch(sitemap_url).await;
        if result.status_code != 200 {
            debug!(
                "No sitemap found at {} (status {})",
                sitemap_url, result.status_code
            );
            return Ok(Vec::new());
        }

        let Some(content) = result.html_content else {
            return Ok(Vec::new());
        };

        let mut urls: Vec<String> = sitemap::parse_sitemap(&content)
            .map_err(anyhow::Error::msg)?
            .into_iter()
            .filter_map(|entry| normalize_url(&entry.loc))
            .collect();

        if urls.is_empty() {
            for child_sitemap in
                sitemap::parse_sitemap_index(&content).map_err(anyhow::Error::msg)?
            {
                let Some(child_url) = super::normalizer::resolve_url(sitemap_url, &child_sitemap)
                else {
                    continue;
                };
                let mut child_urls =
                    Box::pin(self.fetch_sitemap_tree(fetcher, &child_url, depth + 1)).await?;
                urls.append(&mut child_urls);
            }
        }

        urls.sort();
        urls.dedup();
        Ok(urls)
    }

    /// Check if a fetch result is crawlable.
    fn is_crawlable(result: &FetchResult) -> bool {
        result.status_code >= 200
            && result.status_code < 400
            && result.html_content.is_some()
            && Fetcher::is_crawlable_content_type(
                result.content_type.as_deref().unwrap_or("text/html"),
            )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_determine_indexability_indexable() {
        let seo_data = SeoData::default();
        assert_eq!(determine_indexability(&seo_data, 200), "indexable");
    }

    #[test]
    fn test_determine_indexability_noindex() {
        let mut seo_data = SeoData::default();
        seo_data.noindex = true;
        assert_eq!(determine_indexability(&seo_data, 200), "non_indexable");
    }

    #[test]
    fn test_determine_indexability_404() {
        let seo_data = SeoData::default();
        assert_eq!(determine_indexability(&seo_data, 404), "non_indexable");
    }

    #[test]
    fn test_result_to_page_data_basic() {
        let result = CrawlResult {
            url: "https://example.com/".to_string(),
            fetch_result: FetchResult {
                status_code: 200,
                final_url: "https://example.com/".to_string(),
                requested_url: "https://example.com/".to_string(),
                headers: std::collections::HashMap::new(),
                content_type: Some("text/html".to_string()),
                content_length: Some(1234),
                response_time_ms: 150.0,
                is_redirect: false,
                redirect_count: 0,
                was_js_rendered: false,
                html_content: Some("<html></html>".to_string()),
                error_message: None,
            },
            seo_data: SeoData::default(),
            extracted_links: vec![],
            issues: vec![],
            depth: 0,
        };

        let page_data = result_to_page_data(&result, 1, 42);
        assert_eq!(page_data.project_id, 1);
        assert_eq!(page_data.crawl_id, 42);
        assert_eq!(page_data.url, "https://example.com/");
        assert_eq!(page_data.indexability, "indexable");
        assert!(page_data.issues.is_empty());
        assert!(page_data.links.is_empty());
    }

    #[test]
    fn test_result_to_page_data_with_issues_and_links() {
        let result = CrawlResult {
            url: "https://example.com/page".to_string(),
            fetch_result: FetchResult {
                status_code: 200,
                final_url: "https://example.com/page".to_string(),
                requested_url: "https://example.com/page".to_string(),
                headers: std::collections::HashMap::new(),
                content_type: Some("text/html".to_string()),
                content_length: Some(5678),
                response_time_ms: 300.0,
                is_redirect: false,
                redirect_count: 0,
                was_js_rendered: false,
                html_content: Some("<html><head><title>Test</title></head><body><a href='/'>Home</a></body></html>".to_string()),
                error_message: None,
            },
            seo_data: SeoData::default(),
            extracted_links: vec![
                ExtractedLink {
                    href: "https://example.com/".to_string(),
                    anchor_text: Some("Home".to_string()),
                    rel: None,
                    is_internal: true,
                    is_no_follow: false,
                    link_type: LinkType::HtmlA,
                },
            ],
            issues: vec![
                SeoIssue {
                    url: "https://example.com/page".to_string(),
                    issue_type: "missing_meta_description".to_string(),
                    severity: IssueSeverity::Warning,
                    category: IssueCategory::Content,
                    message: "Page is missing a meta description".to_string(),
                    details: serde_json::json!({}),
                },
            ],
            depth: 1,
        };

        let page_data = result_to_page_data(&result, 10, 99);
        assert_eq!(page_data.issues.len(), 1);
        assert_eq!(page_data.issues[0].issue_type, "missing_meta_description");
        assert_eq!(page_data.issues[0].severity, "warning");
        assert_eq!(page_data.issues[0].category, "content");
        assert_eq!(page_data.links.len(), 1);
        assert_eq!(page_data.links[0].link_relation, "HtmlA");
        assert_eq!(page_data.links[0].target_url, "https://example.com/");
    }
}
