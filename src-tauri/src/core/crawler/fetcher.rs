//! HTTP fetcher per PRD §8.5.

use super::normalizer::resolve_url;
use crate::core::crawler::models::FetchResult;
use reqwest::Client;
use std::collections::HashMap;
use std::time::Duration;
use tracing::{debug, warn};

/// Configuration for the HTTP fetcher.
#[derive(Debug, Clone)]
pub struct FetcherConfig {
    pub user_agent: String,
    pub timeout_seconds: u64,
    pub max_response_size_kb: usize,
    pub follow_redirects: bool,
    pub max_redirects: usize,
    pub accept_language: String,
    pub custom_headers: Option<Vec<(String, String)>>,
}

impl Default for FetcherConfig {
    fn default() -> Self {
        Self {
            user_agent: "CrawlDesk SEO Crawler (https://github.com/om-media/Crawldesk)".to_string(),
            timeout_seconds: 30,
            max_response_size_kb: 5120,
            follow_redirects: false, // Manual redirect handling
            max_redirects: 5,
            accept_language: "en-US,en;q=0.9".to_string(),
            custom_headers: None,
        }
    }
}

/// HTTP fetcher with redirect tracking and size limits.
#[derive(Clone)]
pub struct Fetcher {
    client: Client,
    config: FetcherConfig,
}

impl Fetcher {
    pub fn new(config: FetcherConfig) -> Self {
        let client = Client::builder()
            .user_agent(&config.user_agent)
            .timeout(Duration::from_secs(config.timeout_seconds))
            .connect_timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none()) // Manual redirect handling
            .gzip(true)
            .brotli(true)
            .deflate(true)
            .build()
            .expect("Failed to build HTTP client");

        Self { client, config }
    }

    /// Fetch a URL and return the result.
    pub async fn fetch(&self, url: &str) -> FetchResult {
        let start = std::time::Instant::now();

        debug!("Fetching {}", url);

        match self.fetch_with_redirects(url, 0).await {
            Ok(mut result) => {
                let elapsed = start.elapsed().as_secs_f64() * 1000.0;
                result.response_time_ms = elapsed;

                // Check size limit
                if let Some(html) = &result.html_content {
                    let size_kb = html.len() as f64 / 1024.0;
                    if size_kb > self.config.max_response_size_kb as f64 {
                        warn!(
                            "Response too large: {:.1} KB > {} KB limit for {}",
                            size_kb, self.config.max_response_size_kb, url
                        );
                        return FetchResult {
                            status_code: 414,
                            final_url: result.final_url.clone(),
                            requested_url: url.to_string(),
                            headers: result.headers.clone(),
                            content_type: result.content_type.clone(),
                            content_length: Some(html.len()),
                            response_time_ms: elapsed,
                            is_redirect: false,
                            redirect_count: result.redirect_count,
                            was_js_rendered: false,
                            html_content: None,
                            error_message: Some(format!(
                                "Response too large: {:.1} KB (limit: {} KB)",
                                size_kb, self.config.max_response_size_kb
                            )),
                        };
                    }
                }

                result
            }
            Err(e) => {
                let elapsed = start.elapsed().as_secs_f64() * 1000.0;
                warn!("Fetch failed for {}: {}", url, e);
                FetchResult {
                    status_code: 0,
                    final_url: url.to_string(),
                    requested_url: url.to_string(),
                    headers: HashMap::new(),
                    content_type: None,
                    content_length: None,
                    response_time_ms: elapsed,
                    is_redirect: false,
                    redirect_count: 0,
                    was_js_rendered: false,
                    html_content: None,
                    error_message: Some(e.to_string()),
                }
            }
        }
    }

    /// Fetch with manual redirect following.
    async fn fetch_with_redirects(
        &self,
        url: &str,
        depth: usize,
    ) -> Result<FetchResult, anyhow::Error> {
        if depth > self.config.max_redirects {
            return Err(anyhow::anyhow!(
                "Max redirects exceeded ({})",
                self.config.max_redirects
            ));
        }

        let response = self.client.get(url).send().await?;
        let status = response.status();

        // Handle redirect
        if status.is_redirection() && self.config.follow_redirects {
            let location = response
                .headers()
                .get("Location")
                .and_then(|h| h.to_str().ok())
                .ok_or_else(|| anyhow::anyhow!("Redirect without Location header"))?;

            let final_url = resolve_url(url, location)
                .ok_or_else(|| anyhow::anyhow!("Failed to resolve redirect URL: {}", location))?;

            debug!("Redirect {} -> {} (depth {})", url, final_url, depth + 1);

            return Box::pin(self.fetch_with_redirects(&final_url, depth + 1)).await;
        }

        let content_type = response
            .headers()
            .get("Content-Type")
            .and_then(|h| h.to_str().ok())
            .map(String::from);
        let headers: HashMap<String, String> = response
            .headers()
            .iter()
            .filter_map(|(name, value)| {
                value
                    .to_str()
                    .ok()
                    .map(|value| (name.as_str().to_ascii_lowercase(), value.to_string()))
            })
            .collect();

        let body_bytes = response.bytes().await?;

        // Try to decode as UTF-8 text
        let html_content = String::from_utf8(body_bytes.to_vec()).ok();

        Ok(FetchResult {
            status_code: status.as_u16() as i32,
            final_url: url.to_string(),
            requested_url: url.to_string(),
            headers,
            content_type,
            content_length: Some(body_bytes.len()),
            response_time_ms: 0.0, // Will be set by caller
            is_redirect: status.is_redirection(),
            redirect_count: depth as i32,
            was_js_rendered: false,
            html_content,
            error_message: None,
        })
    }

    /// Check if a content type is crawlable (HTML).
    pub fn is_crawlable_content_type(content_type: &str) -> bool {
        content_type.contains("text/html")
            || content_type.contains("application/xhtml")
            || content_type.contains("text/xml")
    }
}
