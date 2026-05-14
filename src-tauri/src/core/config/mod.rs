//! Application configuration.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Application-wide configuration loaded from settings or defaults.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub data_dir: PathBuf,
    pub db_filename: String,
    pub max_concurrent_crawls: i32,
    pub default_user_agent: String,
    pub default_concurrency: i32,
    pub default_delay_ms: i64,
    pub default_max_urls: i32,
    pub default_max_depth: i32,
    pub default_timeout_seconds: i32,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            data_dir: std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                .unwrap_or_else(|| PathBuf::from(".")),
            db_filename: "crawldesk.sqlite".to_string(),
            max_concurrent_crawls: 3,
            default_user_agent: "CrawlDesk SEO Crawler (https://github.com/om-media/Crawldesk)"
                .to_string(),
            default_concurrency: 5,
            default_delay_ms: 500,
            default_max_urls: 1000,
            default_max_depth: 10,
            default_timeout_seconds: 30,
        }
    }
}

impl AppConfig {
    /// Get the database file path.
    pub fn db_path(&self) -> PathBuf {
        self.data_dir.join(&self.db_filename)
    }
}
