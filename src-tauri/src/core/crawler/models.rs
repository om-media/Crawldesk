//! Crawl engine models — URL records, SEO data, fetch results, and page-level issue types.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// URL frontier states per PRD §8.4
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FrontierState {
    Discovered,
    Queued,
    Fetching,
    Fetched,
    Failed,
    Skipped,
    Blocked,
}

/// URL record in the frontier queue
#[derive(Debug, Clone)]
pub struct FrontierEntry {
    pub url: String,
    pub depth: i32,
    pub state: FrontierState,
    pub discovered_at: std::time::Instant,
}

/// Fetch result from HTTP request
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchResult {
    pub status_code: i32,
    pub final_url: String,
    pub requested_url: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    pub content_type: Option<String>,
    pub content_length: Option<usize>,
    pub response_time_ms: f64,
    pub is_redirect: bool,
    pub redirect_count: i32,
    pub was_js_rendered: bool,
    pub html_content: Option<String>,
    pub error_message: Option<String>,
}

/// SEO data extracted from HTML
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeoData {
    pub title: Option<String>,
    pub meta_description: Option<String>,
    pub canonical_url: Option<String>,
    pub robots_meta: Option<String>,
    pub noindex: bool,
    pub nofollow: bool,
    pub http_status: Option<i32>,
    pub response_time_ms: Option<f64>,
    pub word_count: Option<i32>,
    pub has_h1: bool,
    pub h1_count: i32,
    pub h1_text: Option<String>,
    pub headings_h2: Vec<String>,
    pub headings_h3: Vec<String>,
    pub headings_h4: Vec<String>,
    pub headings_h5: Vec<String>,
    pub headings_h6: Vec<String>,
    pub image_count: i32,
    pub images_without_alt: i32,
    pub images_with_alt: i32,
    #[serde(default)]
    pub images_missing_dimensions: i32,
    #[serde(default)]
    pub images_missing_lazy_loading: i32,
    pub total_image_size_kb: f64,
    pub social_meta_open_graph: serde_json::Value,
    pub social_meta_twitter_card: serde_json::Value,
    pub structured_data_json: Vec<serde_json::Value>,
    pub has_schema_org: bool,
    pub hreflang_alternates: Vec<String>,
    #[serde(default)]
    pub amp_html_url: Option<String>,
    #[serde(default)]
    pub is_amp: bool,
    pub self_referencing_canonical: bool,
    pub redirect_chain: Vec<String>,
    pub final_url: Option<String>,
    pub js_rendered_html: Option<String>,
    pub carbon_footprint_grams: Option<f64>,
    pub anchor_text_distribution: serde_json::Value,
    pub internal_link_count: i32,
    pub external_link_count: i32,
    pub broken_links: i32,
    pub pagination_next: Option<String>,
    pub pagination_prev: Option<String>,
    pub is_paged: bool,
    pub content_hash: Option<String>,
    pub extractable_text: Option<String>,
    pub extraction_results: Vec<serde_json::Value>,
    pub keyword_density: serde_json::Value,
}

/// Extracted link from HTML
#[derive(Debug, Clone)]
pub struct ExtractedLink {
    pub href: String,
    pub anchor_text: Option<String>,
    pub rel: Option<String>,
    pub is_internal: bool,
    pub is_no_follow: bool,
    pub link_type: LinkType,
}

#[derive(Debug, Clone, PartialEq)]
pub enum LinkType {
    HtmlA,
    Canonical,
    Image,
    Script,
    Css,
    IFrame,
}

/// SEO issues detected on a page
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeoIssue {
    pub issue_type: String,
    pub severity: IssueSeverity,
    pub category: IssueCategory,
    pub message: String,
    pub details: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IssueSeverity {
    Critical,
    Warning,
    Info,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IssueCategory {
    Content,
    Structure,
    Links,
    Performance,
    Security,
    Social,
    Technical,
    Internationalization,
}

/// Crawl session state per PRD §8.1
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CrawlSessionState {
    Created,
    Initializing,
    LoadingRobots,
    LoadingSitemaps,
    Crawling,
    Paused,
    Stopping,
    Completed,
    Failed(String),
    Cancelled,
}

impl std::fmt::Display for CrawlSessionState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CrawlSessionState::Created => write!(f, "created"),
            CrawlSessionState::Initializing => write!(f, "initializing"),
            CrawlSessionState::LoadingRobots => write!(f, "loading_robots"),
            CrawlSessionState::LoadingSitemaps => write!(f, "loading_sitemaps"),
            CrawlSessionState::Crawling => write!(f, "crawling"),
            CrawlSessionState::Paused => write!(f, "paused"),
            CrawlSessionState::Stopping => write!(f, "stopping"),
            CrawlSessionState::Completed => write!(f, "completed"),
            CrawlSessionState::Failed(e) => write!(f, "failed({})", e),
            CrawlSessionState::Cancelled => write!(f, "cancelled"),
        }
    }
}
