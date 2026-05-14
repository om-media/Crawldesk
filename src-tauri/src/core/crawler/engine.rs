//! Main crawl engine — orchestrates fetcher, parser, frontier, scope, and issue detection.
//! Replaces src/worker/engine/crawl-engine.ts with tokio async tasks.

use std::sync::Arc;
use futures::stream::{FuturesUnordered, StreamExt};
use tokio::sync::Mutex;
use tokio::time::{sleep, timeout, Duration};
use tracing::{debug, info, warn};

use super::models::*;
use super::fetcher::{Fetcher, FetcherConfig};
use super::frontier::UrlFrontier;
use super::scope::ScopeService;
use super::normalizer::normalize_url;
use super::robots::RobotsService;
use super::parser::{extract_html_links, parse_html};
use super::issues::detect_issues;

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
        }
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

        info!("Starting crawl: {} (max_urls={}, concurrency={})", 
              self.config.root_url, self.config.max_urls, self.config.concurrency);

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

        let fetcher = Arc::new(Fetcher::new(FetcherConfig {
            custom_headers: self.config.custom_headers.clone(),
            ..self.config.fetcher_config.clone()
        }));
        let concurrency = self.config.concurrency.max(1);
        let timeout_seconds = self.config.fetcher_config.timeout_seconds.saturating_add(5).max(1);
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
                            self.frontier.lock().await.enqueue(norm_url.clone(), result.depth + 1);
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

        // Final stats
        let elapsed = start.elapsed().as_millis() as u64;
        let mut s = self.stats.lock().await;
        
        info!(
            "Crawl completed: {} URLs crawled, {} issues, {} links, {:.0}s",
            s.total_crawled, s.total_issues, s.total_links, elapsed as f64 / 1000.0
        );

        // Emit completion event
        if let Some(ref callback) = self.callback {
            callback(&CrawlEvent::Completed {
                total_crawled: s.total_crawled,
                total_issues: s.total_issues,
                total_links: s.total_links,
                elapsed_ms: elapsed,
            });
        }

        std::mem::take(&mut *s)
    }

    async fn crawl_entry(entry: FrontierEntry, fetcher: Arc<Fetcher>, timeout_seconds: u64) -> CrawlResult {
        let url = entry.url;
        let depth = entry.depth;
        let fetch_result = match timeout(Duration::from_secs(timeout_seconds), fetcher.fetch(&url)).await {
            Ok(result) => result,
            Err(_) => {
                warn!("Fetch timed out after {}s for {}", timeout_seconds, url);
                FetchResult {
                    status_code: 0,
                    final_url: url.clone(),
                    requested_url: url.clone(),
                    content_type: None,
                    content_length: None,
                    response_time_ms: timeout_seconds as f64 * 1000.0,
                    is_redirect: false,
                    redirect_count: 0,
                    was_js_rendered: false,
                    html_content: None,
                    error_message: Some(format!("Fetch timed out after {} seconds", timeout_seconds)),
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
            debug!("Recording non-crawlable attempt: {} ({})", url, fetch_result.status_code);
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

    /// Check if a fetch result is crawlable.
    fn is_crawlable(result: &FetchResult) -> bool {
        result.status_code >= 200 && result.status_code < 400
            && result.html_content.is_some()
            && Fetcher::is_crawlable_content_type(
                result.content_type.as_deref().unwrap_or("text/html")
            )
    }

}
