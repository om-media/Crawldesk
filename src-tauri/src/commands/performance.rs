//! Crawl performance commands backed by stored response timings and sizes.

use crate::core::storage::db;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceRow {
    pub id: String,
    pub url: String,
    pub strategy: String,
    pub performance_score: Option<i64>,
    pub accessibility_score: Option<i64>,
    pub best_practices_score: Option<i64>,
    pub seo_score: Option<i64>,
    pub lcp_ms: Option<f64>,
    pub fid_ms: Option<f64>,
    pub cls: Option<f64>,
    pub fcp_ms: Option<f64>,
    pub ttfb_ms: Option<f64>,
    pub speed_index: Option<f64>,
    pub size_bytes: Option<i64>,
    pub fetched_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceSummary {
    pub avg_performance: Option<i64>,
    pub avg_accessibility: Option<i64>,
    pub avg_best_practices: Option<i64>,
    pub avg_seo: Option<i64>,
    pub avg_lcp_ms: Option<f64>,
    pub avg_cls: Option<f64>,
    pub avg_ttfb_ms: Option<f64>,
    pub avg_size_bytes: Option<i64>,
    pub total_urls_with_psi: i64,
    pub slow_pages: i64,
    pub large_pages: i64,
}

#[tauri::command]
pub fn list_performance_by_crawl(crawl_id: i64) -> Result<Vec<PerformanceRow>, String> {
    let conn = db::get_connection().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, url, response_time_ms, size_bytes, fetched_at
             FROM urls
             WHERE crawl_id = ?1
               AND (response_time_ms IS NOT NULL OR size_bytes IS NOT NULL)
             ORDER BY response_time_ms DESC NULLS LAST, size_bytes DESC NULLS LAST, id ASC
             LIMIT 1000",
        )
        .map_err(|e| format!("Failed to prepare performance rows: {}", e))?;

    let rows = stmt
        .query_map(rusqlite::params![crawl_id], |row| {
            let id: i64 = row.get("id")?;
            let url: String = row.get("url")?;
            let response_time_ms: Option<f64> = row.get("response_time_ms")?;
            let size_bytes: Option<i64> = row.get("size_bytes")?;
            let fetched_at: Option<String> = row.get("fetched_at")?;
            Ok(performance_row(id, url, response_time_ms, size_bytes, fetched_at))
        })
        .map_err(|e| format!("Failed to query performance rows: {}", e))?;

    Ok(rows.filter_map(|row| row.ok()).collect())
}

#[tauri::command]
pub fn summarize_performance(crawl_id: i64) -> Result<PerformanceSummary, String> {
    let rows = list_performance_by_crawl(crawl_id)?;
    let total_urls_with_psi = rows.len() as i64;
    let avg_ttfb_ms = average_f64(rows.iter().filter_map(|row| row.ttfb_ms));
    let avg_size_bytes = average_i64(rows.iter().filter_map(|row| row.size_bytes));
    let avg_performance = average_i64(rows.iter().filter_map(|row| row.performance_score));
    let slow_pages = rows
        .iter()
        .filter(|row| row.ttfb_ms.map(|value| value > 1000.0).unwrap_or(false))
        .count() as i64;
    let large_pages = rows
        .iter()
        .filter(|row| row.size_bytes.map(|value| value > 1_000_000).unwrap_or(false))
        .count() as i64;

    Ok(PerformanceSummary {
        avg_performance,
        avg_accessibility: None,
        avg_best_practices: None,
        avg_seo: None,
        avg_lcp_ms: None,
        avg_cls: None,
        avg_ttfb_ms,
        avg_size_bytes,
        total_urls_with_psi,
        slow_pages,
        large_pages,
    })
}

fn performance_row(
    id: i64,
    url: String,
    response_time_ms: Option<f64>,
    size_bytes: Option<i64>,
    fetched_at: Option<String>,
) -> PerformanceRow {
    let performance_score = response_time_ms.map(score_response_time);
    PerformanceRow {
        id: id.to_string(),
        url,
        strategy: "crawl".to_string(),
        performance_score,
        accessibility_score: None,
        best_practices_score: None,
        seo_score: None,
        lcp_ms: None,
        fid_ms: None,
        cls: None,
        fcp_ms: response_time_ms,
        ttfb_ms: response_time_ms,
        speed_index: response_time_ms,
        size_bytes,
        fetched_at,
    }
}

fn score_response_time(response_time_ms: f64) -> i64 {
    if response_time_ms <= 200.0 {
        100
    } else if response_time_ms <= 500.0 {
        90
    } else if response_time_ms <= 1000.0 {
        70
    } else if response_time_ms <= 2500.0 {
        45
    } else {
        20
    }
}

fn average_f64(values: impl Iterator<Item = f64>) -> Option<f64> {
    let mut count = 0.0;
    let mut total = 0.0;
    for value in values {
        count += 1.0;
        total += value;
    }
    if count == 0.0 {
        None
    } else {
        Some(((total / count) * 100.0).round() / 100.0)
    }
}

fn average_i64(values: impl Iterator<Item = i64>) -> Option<i64> {
    let mut count = 0;
    let mut total = 0;
    for value in values {
        count += 1;
        total += value;
    }
    if count == 0 {
        None
    } else {
        Some((total as f64 / count as f64).round() as i64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn response_time_score_uses_bands() {
        assert_eq!(score_response_time(100.0), 100);
        assert_eq!(score_response_time(700.0), 70);
        assert_eq!(score_response_time(3000.0), 20);
    }

    #[test]
    fn performance_row_maps_crawl_timings_to_ui_shape() {
        let row = performance_row(
            7,
            "https://example.com/".to_string(),
            Some(450.0),
            Some(25_000),
            Some("2026-05-17T08:00:00Z".to_string()),
        );

        assert_eq!(row.id, "7");
        assert_eq!(row.strategy, "crawl");
        assert_eq!(row.performance_score, Some(90));
        assert_eq!(row.ttfb_ms, Some(450.0));
        assert_eq!(row.size_bytes, Some(25_000));
    }
}
