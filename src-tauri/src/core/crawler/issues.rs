//! SEO issue detection — page-level incremental detectors and registry-backed issue construction.

use super::issue_registry::{issue, IssueType};
use super::models::FetchResult;
use super::models::{IssueSeverity, SeoData, SeoIssue};

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

fn detect_missing_title(
    fetch_result: &FetchResult,
    seo_data: &SeoData,
    issues: &mut Vec<SeoIssue>,
) {
    if fetch_result.status_code >= 200 && fetch_result.status_code < 400 {
        if seo_data.title.is_none()
            || seo_data
                .title
                .as_ref()
                .map(|t| t.trim().is_empty())
                .unwrap_or(true)
        {
            issues.push(issue(
                IssueType::MissingTitle,
                "Page has no title tag or it is empty",
                serde_json::json!({"url": fetch_result.final_url}),
            ));
        }
    }
}

fn detect_title_too_long(
    fetch_result: &FetchResult,
    seo_data: &SeoData,
    issues: &mut Vec<SeoIssue>,
) {
    if let Some(title) = &seo_data.title {
        let len = title.chars().count();
        if len > 60 {
            issues.push(issue(
                IssueType::TitleTooLong,
                format!("Title is {} characters (recommended: 50-60)", len),
                serde_json::json!({"length": len, "url": fetch_result.final_url}),
            ));
        }
    }
}

fn detect_missing_meta_description(
    fetch_result: &FetchResult,
    seo_data: &SeoData,
    issues: &mut Vec<SeoIssue>,
) {
    if fetch_result.status_code >= 200 && fetch_result.status_code < 400 {
        if seo_data.meta_description.is_none()
            || seo_data
                .meta_description
                .as_ref()
                .map(|d| d.trim().is_empty())
                .unwrap_or(true)
        {
            issues.push(issue(
                IssueType::MissingMetaDescription,
                "Page has no meta description tag or it is empty",
                serde_json::json!({"url": fetch_result.final_url}),
            ));
        }
    }
}

fn detect_meta_description_too_long(
    fetch_result: &FetchResult,
    seo_data: &SeoData,
    issues: &mut Vec<SeoIssue>,
) {
    if let Some(desc) = &seo_data.meta_description {
        let len = desc.chars().count();
        if len > 160 {
            issues.push(issue(
                IssueType::MetaDescriptionTooLong,
                format!(
                    "Meta description is {} characters (recommended: 150-160)",
                    len
                ),
                serde_json::json!({"length": len, "url": fetch_result.final_url}),
            ));
        }
    }
}

fn detect_missing_h1(fetch_result: &FetchResult, seo_data: &SeoData, issues: &mut Vec<SeoIssue>) {
    if !seo_data.has_h1 {
        issues.push(issue(
            IssueType::MissingH1,
            "Page has no H1 heading",
            serde_json::json!({"url": fetch_result.final_url}),
        ));
    }
}

fn detect_multiple_h1(fetch_result: &FetchResult, seo_data: &SeoData, issues: &mut Vec<SeoIssue>) {
    if seo_data.h1_count > 1 {
        issues.push(issue(
            IssueType::MultipleH1,
            format!(
                "Page has {} H1 headings (recommended: 1)",
                seo_data.h1_count
            ),
            serde_json::json!({"count": seo_data.h1_count, "url": fetch_result.final_url}),
        ));
    }
}

fn detect_missing_h2(fetch_result: &FetchResult, seo_data: &SeoData, issues: &mut Vec<SeoIssue>) {
    if !seo_data.headings_h2.is_empty() || seo_data.h1_count == 0 {
        // Has H2 or no H1 — fine
    } else if seo_data.has_h1 && seo_data.word_count.map(|w| w > 50).unwrap_or(false) {
        // Long page with H1 but no H2 — suspicious
        issues.push(issue(
            IssueType::MissingH2,
            "Long page has H1 but no H2 headings",
            serde_json::json!({"word_count": seo_data.word_count.unwrap_or(0), "url": fetch_result.final_url}),
        ));
    }
}

fn detect_noindex(fetch_result: &FetchResult, seo_data: &SeoData, issues: &mut Vec<SeoIssue>) {
    if seo_data.noindex && fetch_result.status_code >= 200 && fetch_result.status_code < 400 {
        issues.push(issue(
            IssueType::Noindex,
            "Page has noindex meta tag — not indexed by search engines",
            serde_json::json!({"url": fetch_result.final_url}),
        ));
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

        let mut detected = issue(
            IssueType::Non200Status,
            format!("HTTP status code: {}", fetch_result.status_code),
            serde_json::json!({"status_code": fetch_result.status_code, "url": fetch_result.final_url}),
        );
        detected.severity = severity;
        issues.push(detected);
    }
}

fn detect_slow_response(fetch_result: &FetchResult, issues: &mut Vec<SeoIssue>) {
    if fetch_result.response_time_ms > 3000.0 {
        issues.push(issue(
            IssueType::SlowResponse,
            format!("Response time {:.0}ms exceeds 3s threshold", fetch_result.response_time_ms),
            serde_json::json!({"response_time_ms": fetch_result.response_time_ms, "url": fetch_result.final_url}),
        ));
    }
}

fn detect_missing_canonical(
    fetch_result: &FetchResult,
    seo_data: &SeoData,
    issues: &mut Vec<SeoIssue>,
) {
    if !seo_data.noindex && fetch_result.status_code >= 200 && fetch_result.status_code < 400 {
        if seo_data.canonical_url.is_none() {
            issues.push(issue(
                IssueType::MissingCanonical,
                "Page has no canonical tag",
                serde_json::json!({"url": fetch_result.final_url}),
            ));
        } else if !seo_data.self_referencing_canonical {
            issues.push(issue(
                IssueType::NonSelfReferencingCanonical,
                "Canonical URL points to a different URL",
                serde_json::json!({
                    "canonical": seo_data.canonical_url,
                    "url": fetch_result.final_url
                }),
            ));
        }
    }
}

fn detect_images_without_alt(
    fetch_result: &FetchResult,
    seo_data: &SeoData,
    issues: &mut Vec<SeoIssue>,
) {
    if seo_data.images_without_alt > 0 {
        let ratio = seo_data.images_with_alt as f64
            / (seo_data.images_without_alt + seo_data.images_with_alt) as f64;
        if ratio < 0.8 && seo_data.image_count > 2 {
            issues.push(issue(
                IssueType::ImagesWithoutAlt,
                format!(
                    "{} of {} images have no alt text ({:.0}%)",
                    seo_data.images_without_alt,
                    seo_data.image_count,
                    (seo_data.images_without_alt as f64 / seo_data.image_count as f64) * 100.0
                ),
                serde_json::json!({
                    "missing": seo_data.images_without_alt,
                    "total": seo_data.image_count,
                    "url": fetch_result.final_url
                }),
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fetch(status_code: i32) -> FetchResult {
        FetchResult {
            status_code,
            final_url: "https://example.com/page".to_string(),
            requested_url: "https://example.com/page".to_string(),
            headers: std::collections::HashMap::new(),
            content_type: Some("text/html".to_string()),
            content_length: Some(1024),
            response_time_ms: 120.0,
            is_redirect: false,
            redirect_count: 0,
            was_js_rendered: false,
            html_content: None,
            error_message: None,
        }
    }

    #[test]
    fn detect_issues_uses_registry_ids_and_defaults() {
        let mut seo = SeoData::default();
        seo.has_h1 = false;
        seo.h1_count = 0;

        let issues = detect_issues(&fetch(200), &seo);

        let missing_title = issues
            .iter()
            .find(|issue| issue.issue_type == IssueType::MissingTitle.id())
            .expect("missing title issue");
        assert_eq!(missing_title.severity, IssueSeverity::Critical);

        let missing_meta = issues
            .iter()
            .find(|issue| issue.issue_type == IssueType::MissingMetaDescription.id())
            .expect("missing meta description issue");
        assert_eq!(missing_meta.severity, IssueSeverity::Warning);
    }

    #[test]
    fn non_200_status_can_override_registry_severity() {
        let mut seo = SeoData::default();
        seo.title = Some("A valid title".to_string());
        seo.meta_description = Some("A useful description for the page.".to_string());
        seo.has_h1 = true;
        seo.h1_count = 1;

        let issues = detect_issues(&fetch(404), &seo);
        let status_issue = issues
            .iter()
            .find(|issue| issue.issue_type == IssueType::Non200Status.id())
            .expect("status issue");

        assert_eq!(status_issue.severity, IssueSeverity::Critical);
    }
}
