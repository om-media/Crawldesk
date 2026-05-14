//! SEO issue detection — replaces src/worker/engine/issue-detector.ts.

use super::models::{SeoData, SeoIssue, IssueSeverity, IssueCategory};
use super::models::FetchResult;

/// Run all incremental issue detectors on a fetched page result.
pub fn detect_issues(fetch_result: &FetchResult, seo_data: &SeoData) -> Vec<SeoIssue> {
    let mut issues = Vec::new();

    // Content issues
    detect_missing_title(fetch_result, seo_data, &mut issues);
    detect_title_too_long(fetch_result, seo_data, &mut issues);
    detect_missing_meta_description(fetch_result, seo_data, &mut issues);
    detect_meta_description_too_long(fetch_result, seo_data, &mut issues);
    
    // Structure issues
    detect_missing_h1(fetch_result, seo_data, &mut issues);
    detect_multiple_h1(fetch_result, seo_data, &mut issues);
    detect_missing_h2(fetch_result, seo_data, &mut issues);

    // Technical issues
    detect_noindex(fetch_result, seo_data, &mut issues);
    detect_non_200_status(fetch_result, &mut issues);
    detect_slow_response(fetch_result, &mut issues);
    detect_missing_canonical(fetch_result, seo_data, &mut issues);

    // Image issues
    detect_images_without_alt(fetch_result, seo_data, &mut issues);

    issues
}

fn detect_missing_title(fetch_result: &FetchResult, seo_data: &SeoData, issues: &mut Vec<SeoIssue>) {
    if fetch_result.status_code >= 200 && fetch_result.status_code < 400 {
        if seo_data.title.is_none() || seo_data.title.as_ref().map(|t| t.trim().is_empty()).unwrap_or(true) {
            issues.push(SeoIssue {
                issue_type: "missing_title".to_string(),
                severity: IssueSeverity::Critical,
                category: IssueCategory::Content,
                message: "Page has no title tag or it is empty".to_string(),
                details: serde_json::json!({"url": fetch_result.final_url}),
            });
        }
    }
}

fn detect_title_too_long(fetch_result: &FetchResult, seo_data: &SeoData, issues: &mut Vec<SeoIssue>) {
    if let Some(title) = &seo_data.title {
        let len = title.chars().count();
        if len > 60 {
            issues.push(SeoIssue {
                issue_type: "title_too_long".to_string(),
                severity: IssueSeverity::Warning,
                category: IssueCategory::Content,
                message: format!("Title is {} characters (recommended: 50-60)", len),
                details: serde_json::json!({"length": len, "url": fetch_result.final_url}),
            });
        }
    }
}

fn detect_missing_meta_description(fetch_result: &FetchResult, seo_data: &SeoData, issues: &mut Vec<SeoIssue>) {
    if fetch_result.status_code >= 200 && fetch_result.status_code < 400 {
        if seo_data.meta_description.is_none() || seo_data.meta_description.as_ref().map(|d| d.trim().is_empty()).unwrap_or(true) {
            issues.push(SeoIssue {
                issue_type: "missing_meta_description".to_string(),
                severity: IssueSeverity::Warning,
                category: IssueCategory::Content,
                message: "Page has no meta description tag or it is empty".to_string(),
                details: serde_json::json!({"url": fetch_result.final_url}),
            });
        }
    }
}

fn detect_meta_description_too_long(fetch_result: &FetchResult, seo_data: &SeoData, issues: &mut Vec<SeoIssue>) {
    if let Some(desc) = &seo_data.meta_description {
        let len = desc.chars().count();
        if len > 160 {
            issues.push(SeoIssue {
                issue_type: "meta_description_too_long".to_string(),
                severity: IssueSeverity::Warning,
                category: IssueCategory::Content,
                message: format!("Meta description is {} characters (recommended: 150-160)", len),
                details: serde_json::json!({"length": len, "url": fetch_result.final_url}),
            });
        }
    }
}

fn detect_missing_h1(fetch_result: &FetchResult, seo_data: &SeoData, issues: &mut Vec<SeoIssue>) {
    if !seo_data.has_h1 {
        issues.push(SeoIssue {
            issue_type: "missing_h1".to_string(),
            severity: IssueSeverity::Critical,
            category: IssueCategory::Structure,
            message: "Page has no H1 heading".to_string(),
            details: serde_json::json!({"url": fetch_result.final_url}),
        });
    }
}

fn detect_multiple_h1(fetch_result: &FetchResult, seo_data: &SeoData, issues: &mut Vec<SeoIssue>) {
    if seo_data.h1_count > 1 {
        issues.push(SeoIssue {
            issue_type: "multiple_h1".to_string(),
            severity: IssueSeverity::Warning,
            category: IssueCategory::Structure,
            message: format!("Page has {} H1 headings (recommended: 1)", seo_data.h1_count),
            details: serde_json::json!({"count": seo_data.h1_count, "url": fetch_result.final_url}),
        });
    }
}

fn detect_missing_h2(fetch_result: &FetchResult, seo_data: &SeoData, issues: &mut Vec<SeoIssue>) {
    if !seo_data.headings_h2.is_empty() || seo_data.h1_count == 0 {
        // Has H2 or no H1 — fine
    } else if seo_data.has_h1 && seo_data.word_count.map(|w| w > 50).unwrap_or(false) {
        // Long page with H1 but no H2 — suspicious
        issues.push(SeoIssue {
            issue_type: "missing_h2".to_string(),
            severity: IssueSeverity::Info,
            category: IssueCategory::Structure,
            message: "Long page has H1 but no H2 headings".to_string(),
            details: serde_json::json!({"word_count": seo_data.word_count.unwrap_or(0), "url": fetch_result.final_url}),
        });
    }
}

fn detect_noindex(fetch_result: &FetchResult, seo_data: &SeoData, issues: &mut Vec<SeoIssue>) {
    if seo_data.noindex && fetch_result.status_code >= 200 && fetch_result.status_code < 400 {
        issues.push(SeoIssue {
            issue_type: "noindex".to_string(),
            severity: IssueSeverity::Critical,
            category: IssueCategory::Technical,
            message: "Page has noindex meta tag — not indexed by search engines".to_string(),
            details: serde_json::json!({"url": fetch_result.final_url}),
        });
    }
}

fn detect_non_200_status(fetch_result: &FetchResult, issues: &mut Vec<SeoIssue>) {
    if fetch_result.status_code >= 400 {
        let severity = if fetch_result.status_code == 404 {
            IssueSeverity::Critical
        } else if fetch_result.status_code >= 500 {
            IssueSeverity::Critical
        } else {
            IssueSeverity::Warning
        };

        issues.push(SeoIssue {
            issue_type: "non_200_status".to_string(),
            severity,
            category: IssueCategory::Technical,
            message: format!("HTTP status code: {}", fetch_result.status_code),
            details: serde_json::json!({"status_code": fetch_result.status_code, "url": fetch_result.final_url}),
        });
    }
}

fn detect_slow_response(fetch_result: &FetchResult, issues: &mut Vec<SeoIssue>) {
    if fetch_result.response_time_ms > 3000.0 {
        issues.push(SeoIssue {
            issue_type: "slow_response".to_string(),
            severity: IssueSeverity::Warning,
            category: IssueCategory::Performance,
            message: format!("Response time {:.0}ms exceeds 3s threshold", fetch_result.response_time_ms),
            details: serde_json::json!({"response_time_ms": fetch_result.response_time_ms, "url": fetch_result.final_url}),
        });
    }
}

fn detect_missing_canonical(fetch_result: &FetchResult, seo_data: &SeoData, issues: &mut Vec<SeoIssue>) {
    if !seo_data.noindex && fetch_result.status_code >= 200 && fetch_result.status_code < 400 {
        if seo_data.canonical_url.is_none() {
            issues.push(SeoIssue {
                issue_type: "missing_canonical".to_string(),
                severity: IssueSeverity::Warning,
                category: IssueCategory::Technical,
                message: "Page has no canonical tag".to_string(),
                details: serde_json::json!({"url": fetch_result.final_url}),
            });
        } else if !seo_data.self_referencing_canonical {
            issues.push(SeoIssue {
                issue_type: "non_self_referencing_canonical".to_string(),
                severity: IssueSeverity::Info,
                category: IssueCategory::Technical,
                message: "Canonical URL points to a different URL".to_string(),
                details: serde_json::json!({
                    "canonical": seo_data.canonical_url,
                    "url": fetch_result.final_url
                }),
            });
        }
    }
}

fn detect_images_without_alt(fetch_result: &FetchResult, seo_data: &SeoData, issues: &mut Vec<SeoIssue>) {
    if seo_data.images_without_alt > 0 {
        let ratio = seo_data.images_with_alt as f64 / (seo_data.images_without_alt + seo_data.images_with_alt) as f64;
        if ratio < 0.8 && seo_data.image_count > 2 {
            issues.push(SeoIssue {
                issue_type: "images_without_alt".to_string(),
                severity: IssueSeverity::Warning,
                category: IssueCategory::Content,
                message: format!(
                    "{} of {} images have no alt text ({:.0}%)",
                    seo_data.images_without_alt,
                    seo_data.image_count,
                    (seo_data.images_without_alt as f64 / seo_data.image_count as f64) * 100.0
                ),
                details: serde_json::json!({
                    "missing": seo_data.images_without_alt,
                    "total": seo_data.image_count,
                    "url": fetch_result.final_url
                }),
            });
        }
    }
}
