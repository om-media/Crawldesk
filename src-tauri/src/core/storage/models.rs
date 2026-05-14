//! Shared Rust type definitions — serialized with camelCase to match frontend TypeScript interfaces.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ─── Project Types ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub root_url: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectInput {
    pub name: String,
    pub root_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectInput {
    pub name: Option<String>,
    pub root_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub project: Project,
    pub url_count: i64,
    pub crawl_count: i64,
    pub issue_count: i64,
}

// ─── Crawl Types ─────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CrawlStatus {
    Created,
    Initializing,
    LoadingRobots,
    LoadingSitemaps,
    Crawling,
    Paused,
    Stopping,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Crawl {
    pub id: i64,
    pub project_id: i64,
    pub status: String,                // stored as string for DB compatibility
    pub settings_json: Option<String>, // JSON-serialized CrawlSettings
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
    pub url_count: i64,
    pub issue_count: i64,
    pub link_count: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrawlProgress {
    pub status: String,
    pub total_urls: i64,
    pub crawled_urls: i64,
    pub queued_urls: i64,
    pub issue_count: i64,
    pub link_count: i64,
    pub current_url: Option<String>,
    pub started_at: Option<DateTime<Utc>>,
    pub elapsed_seconds: Option<f64>,
}

// ─── URL Types (matches SeoData + UrlRecord with 48+ columns) ───

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
    pub headings_h2: Option<String>, // JSON array
    pub headings_h3: Option<String>,
    pub headings_h4: Option<String>,
    pub headings_h5: Option<String>,
    pub headings_h6: Option<String>,
    pub image_count: i32,
    pub images_without_alt: i32,
    pub images_with_alt: i32,
    #[serde(default)]
    pub images_missing_dimensions: i32,
    #[serde(default)]
    pub images_missing_lazy_loading: i32,
    pub total_image_size_kb: f64,
    pub social_meta_open_graph: Option<String>, // JSON object
    pub social_meta_twitter_card: Option<String>,
    pub structured_data_json: Option<String>, // JSON-LD blocks
    pub has_schema_org: bool,
    pub hreflang_alternates: Option<String>, // JSON array
    #[serde(default)]
    pub hreflang_links: Option<String>, // JSON array of { hreflang, href }
    #[serde(default)]
    pub amp_html_url: Option<String>,
    #[serde(default)]
    pub is_amp: bool,
    pub self_referencing_canonical: bool,
    pub redirect_chain: Option<String>, // JSON array of URLs
    pub final_url: Option<String>,
    pub js_rendered_html: Option<String>, // Only for JS-rendered pages
    pub carbon_footprint_grams: Option<f64>,
    pub anchor_text_distribution: Option<String>, // JSON object
    pub internal_link_count: i32,
    pub external_link_count: i32,
    pub broken_links: i32,
    pub pagination_next: Option<String>,
    pub pagination_prev: Option<String>,
    pub is_paged: bool,
    pub content_hash: Option<String>,       // SHA-256 hex
    pub extractable_text: Option<String>,   // Plain text extraction
    pub extraction_results: Option<String>, // JSON array of ExtractionResult
    pub keyword_density: Option<String>,    // JSON object from N-gram analysis
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlRecord {
    pub id: i64,
    pub url: String,
    pub project_id: i64,
    pub crawl_id: Option<i64>,
    // Direct columns for fast filtering/display (avoid JSON parsing)
    pub normalized_url: Option<String>,
    pub final_url: Option<String>,
    pub status_code: Option<i32>,
    pub content_type: Option<String>,
    pub title: Option<String>,
    pub title_length: Option<i32>,
    pub meta_description: Option<String>,
    pub meta_description_length: Option<i32>,
    pub h1: Option<String>,
    pub h1_count: Option<i32>,
    pub word_count: Option<i32>,
    pub canonical_url: Option<String>,
    pub meta_robots: Option<String>,
    pub response_time_ms: Option<f64>,
    pub size_bytes: Option<i32>,
    pub language: Option<String>,
    pub inlinks_count: Option<i32>,
    pub outlinks_count: Option<i32>,
    pub content_hash: Option<String>,
    pub indexability: String,
    pub depth: i32,
    // Full JSON blobs for inspector panel detail
    pub fetch_result_json: Option<String>,
    pub seo_data_json: Option<String>,
    pub discovered_at: Option<DateTime<Utc>>,
    pub fetched_at: Option<DateTime<Utc>>,
    pub last_crawled_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchResult {
    pub status_code: i32,
    pub final_url: String,
    pub requested_url: String,
    pub headers_json: Option<String>,
    pub content_type: Option<String>,
    pub content_length: Option<i64>,
    pub response_time_ms: f64,
    pub is_redirect: bool,
    pub redirect_count: i32,
    pub was_js_rendered: bool,
    pub html_content: Option<String>, // Full HTML for parsing
    pub error_message: Option<String>,
}

// ─── Issue Types (19 issue types per PRD §15) ───────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum IssueSeverity {
    Critical,
    Warning,
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueRecord {
    pub id: i64,
    pub issue_type: String, // e.g., "missing_title", "duplicate_h1"
    pub severity: String,   // stored as string for DB compatibility
    pub category: String,   // stored as string for DB compatibility
    pub url_id: Option<i64>,
    pub url: String,
    pub message: String,
    pub details_json: Option<String>,
    pub detected_at: DateTime<Utc>,
    pub is_fixed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueSummary {
    pub issue_type: String,
    pub severity: String,
    pub category: String,
    pub count: i64,
    pub label: Option<String>,
    pub explanation: Option<String>,
    pub recommendation: Option<String>,
}

// ─── Link Types ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum LinkRelation {
    HtmlA,
    Canonical,
    Image,
    Script,
    Css,
    IFrame,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkRecord {
    pub id: i64,
    pub source_url_id: i64,
    pub source_url: String,
    pub target_url: String,
    pub link_relation: String, // stored as string for DB compatibility
    pub anchor_text: Option<String>,
    pub is_internal: bool,
    pub is_no_follow: bool,
    pub detected_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkSummary {
    pub total_links: i64,
    pub total_internal: i64,
    pub total_external: i64,
    pub nofollow_links: i64,
    pub broken_count: i64,
    pub link_relation_counts: Vec<LinkRelationCount>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkRelationCount {
    pub relation: String,
    pub count: i64,
}

// ─── Pagination ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedResult<T> {
    pub items: Vec<T>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
    pub total_pages: i64,
}

// ─── Crawl Settings ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrawlSettings {
    pub max_urls: i32,
    pub max_depth: i32,
    pub concurrency: i32,
    pub delay_between_requests_ms: i64,
    pub user_agent: String,
    pub accept_language: String,
    pub max_response_size_kb: i32,
    pub timeout_seconds: i32,
    pub follow_redirects: bool,
    pub max_redirects: i32,
    pub respect_robots_txt: bool,
    pub respect_sitemaps: bool,
    pub include_patterns: Vec<String>,
    pub exclude_patterns: Vec<String>,
    pub allowed_hostnames: Vec<String>,
    pub blocked_hostnames: Vec<String>,
    pub max_url_length: i32,
    pub disable_private_ip_access: bool,
    pub enable_js_rendering: bool,
    pub custom_headers: Option<String>, // JSON object
    pub start_url: Option<String>,      // Optional override for the starting URL
}

impl Default for CrawlSettings {
    fn default() -> Self {
        Self {
            max_urls: 1000,
            max_depth: 10,
            concurrency: 5,
            delay_between_requests_ms: 500,
            user_agent: "CrawlDesk SEO Crawler (https://github.com/om-media/Crawldesk)".to_string(),
            accept_language: "en-US,en;q=0.9".to_string(),
            max_response_size_kb: 5120,
            timeout_seconds: 30,
            follow_redirects: true,
            max_redirects: 5,
            respect_robots_txt: true,
            respect_sitemaps: true,
            include_patterns: vec![],
            exclude_patterns: vec!["*.pdf$".to_string(), "*.doc$".to_string()],
            allowed_hostnames: vec![],
            blocked_hostnames: vec![],
            max_url_length: 2048,
            disable_private_ip_access: true,
            enable_js_rendering: false,
            custom_headers: None,
            start_url: None,
        }
    }
}

// ─── App Settings ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: String, // "dark" | "light"
    pub language: String,
    pub auto_save: bool,
    pub max_concurrent_crawls: i32,
    pub data_retention_days: i32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            language: "en".to_string(),
            auto_save: true,
            max_concurrent_crawls: 3,
            data_retention_days: 365,
        }
    }
}

// ─── Sitemap Types ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SitemapRecord {
    pub id: i64,
    pub project_id: i64,
    pub url: String,
    pub sitemap_type: String, // "xml" | "html" | "sitemap_index"
    pub parsed_at: DateTime<Utc>,
}

// ─── Robots Rules Types ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RobotsRuleRecord {
    pub id: i64,
    pub project_id: i64,
    pub hostname: String,
    pub path_pattern: String,
    pub allow: bool,
    pub user_agent: String,
}

// ─── Crawl Diff Types ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrawlDiffRecord {
    pub id: i64,
    pub project_id: i64,
    pub crawl_a_id: i64,
    pub crawl_b_id: i64,
    pub urls_added: i64,
    pub urls_removed: i64,
    pub urls_changed: i64,
    pub urls_unchanged: i64,
    pub generated_at: DateTime<Utc>,
}

// ─── URL Summary Types ──────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlSummary {
    pub total_urls: i64,
    pub indexable: i64,
    pub noindex: i64,
    pub blocked_by_robots: i64,
    pub non_200_status: i64,
    pub average_depth: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_response_time_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_code_distribution: Option<std::collections::HashMap<String, i64>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub depth_distribution: Option<std::collections::HashMap<String, i64>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub indexable_count: Option<i64>,
}

// ─── PSI Result Types ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PsiResultRecord {
    pub id: i64,
    pub url_id: Option<i64>,
    pub url: String,
    pub psi_config_json: Option<String>, // JSON-serialized PsiConfigInput
    pub performance_score: Option<f64>,
    pub accessibility_score: Option<f64>,
    pub best_practices_score: Option<f64>,
    pub seo_score: Option<f64>,
    pub lcp_ms: Option<f64>,
    pub fid_ms: Option<f64>,
    pub cls: Option<f64>,
    pub fetched_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crawl_settings_deserialize_start_url() {
        // This is the exact JSON the frontend sends via Tauri invoke
        let json = r#"{
            "startUrl": "https://silentjamzone.com",
            "maxUrls": 10000,
            "maxDepth": 10,
            "concurrency": 10,
            "delayBetweenRequestsMs": 0,
            "userAgent": "CrawlDeskBot/0.1",
            "acceptLanguage": "en-US,en;q=0.9",
            "maxResponseSizeKb": 5120,
            "timeoutSeconds": 15,
            "followRedirects": true,
            "maxRedirects": 5,
            "respectRobotsTxt": true,
            "respectSitemaps": true,
            "includePatterns": [],
            "excludePatterns": [],
            "allowedHostnames": [],
            "blockedHostnames": [],
            "maxUrlLength": 2048,
            "disablePrivateIpAccess": true,
            "enableJsRendering": false,
            "customHeaders": null
        }"#;

        let settings: CrawlSettings =
            serde_json::from_str(json).expect("Failed to deserialize CrawlSettings");
        assert_eq!(
            settings.start_url,
            Some("https://silentjamzone.com".to_string()),
            "startUrl should be deserialized to start_url with the correct value"
        );
        assert_eq!(settings.max_urls, 10000);
        assert_eq!(settings.max_depth, 10);
    }

    #[test]
    fn test_crawl_settings_start_url_null_falls_back() {
        let json = r#"{
            "startUrl": null,
            "maxUrls": 500,
            "maxDepth": 5,
            "concurrency": 5,
            "delayBetweenRequestsMs": 100,
            "userAgent": "Test",
            "acceptLanguage": "en",
            "maxResponseSizeKb": 1024,
            "timeoutSeconds": 30,
            "followRedirects": true,
            "maxRedirects": 3,
            "respectRobotsTxt": true,
            "respectSitemaps": true,
            "includePatterns": [],
            "excludePatterns": [],
            "allowedHostnames": [],
            "blockedHostnames": [],
            "maxUrlLength": 2048,
            "disablePrivateIpAccess": true,
            "enableJsRendering": false,
            "customHeaders": null
        }"#;

        let settings: CrawlSettings =
            serde_json::from_str(json).expect("Failed to deserialize CrawlSettings");
        assert_eq!(
            settings.start_url, None,
            "startUrl=null should deserialize to None"
        );
    }

    #[test]
    fn test_crawl_settings_missing_start_url() {
        let json = r#"{
            "maxUrls": 1000,
            "maxDepth": 10,
            "concurrency": 5,
            "delayBetweenRequestsMs": 0,
            "userAgent": "Test",
            "acceptLanguage": "en",
            "maxResponseSizeKb": 5120,
            "timeoutSeconds": 30,
            "followRedirects": true,
            "maxRedirects": 5,
            "respectRobotsTxt": true,
            "respectSitemaps": true,
            "includePatterns": [],
            "excludePatterns": [],
            "allowedHostnames": [],
            "blockedHostnames": [],
            "maxUrlLength": 2048,
            "disablePrivateIpAccess": true,
            "enableJsRendering": false,
            "customHeaders": null
        }"#;

        // When startUrl is missing from JSON, serde should use the Default value (None)
        let settings: CrawlSettings =
            serde_json::from_str(json).expect("Failed to deserialize without startUrl");
        // Note: missing field with no default will fail deserialization unless #[serde(default)]
        // CrawlSettings needs #[serde(default)] or each field needs a default
        // Let's verify what actually happens:
        assert!(
            settings.start_url.is_none(),
            "Missing startUrl should result in None"
        );
    }
}
