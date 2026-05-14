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
                &fetch_result.final_url,
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
                &fetch_result.final_url,
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
                &fetch_result.final_url,
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
                &fetch_result.final_url,
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
            &fetch_result.final_url,
            IssueType::MissingH1,
            "Page has no H1 heading",
            serde_json::json!({"url": fetch_result.final_url}),
        ));
    }
}

fn detect_multiple_h1(fetch_result: &FetchResult, seo_data: &SeoData, issues: &mut Vec<SeoIssue>) {
    if seo_data.h1_count > 1 {
        issues.push(issue(
            &fetch_result.final_url,
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
            &fetch_result.final_url,
            IssueType::MissingH2,
            "Long page has H1 but no H2 headings",
            serde_json::json!({"word_count": seo_data.word_count.unwrap_or(0), "url": fetch_result.final_url}),
        ));
    }
}

fn detect_noindex(fetch_result: &FetchResult, seo_data: &SeoData, issues: &mut Vec<SeoIssue>) {
    if seo_data.noindex && fetch_result.status_code >= 200 && fetch_result.status_code < 400 {
        issues.push(issue(
            &fetch_result.final_url,
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
            &fetch_result.final_url,
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
            &fetch_result.final_url,
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
                &fetch_result.final_url,
                IssueType::MissingCanonical,
                "Page has no canonical tag",
                serde_json::json!({"url": fetch_result.final_url}),
            ));
        } else if !seo_data.self_referencing_canonical {
            issues.push(issue(
                &fetch_result.final_url,
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
                &fetch_result.final_url,
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

    fn fetch_slow(status_code: i32, response_time_ms: f64) -> FetchResult {
        FetchResult {
            status_code,
            final_url: "https://example.com/page".to_string(),
            requested_url: "https://example.com/page".to_string(),
            headers: std::collections::HashMap::new(),
            content_type: Some("text/html".to_string()),
            content_length: Some(1024),
            response_time_ms,
            is_redirect: false,
            redirect_count: 0,
            was_js_rendered: false,
            html_content: None,
            error_message: None,
        }
    }

    fn good_seo() -> SeoData {
        SeoData {
            title: Some("A valid page title".to_string()),
            meta_description: Some("A useful description for the page.".to_string()),
            has_h1: true,
            h1_count: 1,
            headings_h2: vec!["Section One".to_string()],
            canonical_url: Some("https://example.com/page".to_string()),
            self_referencing_canonical: true,
            noindex: false,
            word_count: Some(200),
            images_with_alt: 5,
            images_without_alt: 0,
            image_count: 5,
            ..SeoData::default()
        }
    }

    // ── detect_issues (integration of all detectors) ─────────────

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

    #[test]
    fn good_page_produces_no_issues() {
        let issues = detect_issues(&fetch(200), &good_seo());
        // A perfectly good page should produce zero page-level issues
        assert_eq!(
            issues.len(),
            0,
            "expected no issues for a healthy page, got: {:?}",
            issues
        );
    }

    // ── per-detector tests ────────────────────────────────────────

    #[test]
    fn detect_missing_title_fires_when_title_is_empty() {
        let mut seo = SeoData::default();
        seo.title = Some(String::new());
        let issues = detect_issues(&fetch(200), &seo);
        assert!(
            issues
                .iter()
                .any(|i| i.issue_type == IssueType::MissingTitle.id()),
            "empty title should trigger MissingTitle"
        );
    }

    #[test]
    fn detect_missing_title_fires_when_title_is_none() {
        let seo = SeoData::default();
        let issues = detect_issues(&fetch(200), &seo);
        assert!(
            issues
                .iter()
                .any(|i| i.issue_type == IssueType::MissingTitle.id()),
            "None title should trigger MissingTitle"
        );
    }

    #[test]
    fn detect_missing_title_does_not_fire_on_4xx() {
        let mut seo = SeoData::default();
        seo.title = None;
        let issues = detect_issues(&fetch(404), &seo);
        // 4xx pages should not trigger content issues
        assert!(
            !issues
                .iter()
                .any(|i| i.issue_type == IssueType::MissingTitle.id()),
            "4xx pages should not trigger MissingTitle"
        );
    }

    #[test]
    fn detect_title_too_long() {
        let mut seo = good_seo();
        seo.title = Some("A".repeat(80)); // 80 chars > 60 threshold
        let issues = detect_issues(&fetch(200), &seo);
        assert!(
            issues
                .iter()
                .any(|i| i.issue_type == IssueType::TitleTooLong.id()),
            "80-char title should trigger TitleTooLong"
        );
        // Should NOT also fire MissingTitle
        assert!(
            !issues
                .iter()
                .any(|i| i.issue_type == IssueType::MissingTitle.id()),
            "long title should not trigger MissingTitle"
        );
    }

    #[test]
    fn detect_missing_meta_description() {
        let mut seo = good_seo();
        seo.meta_description = None;
        let issues = detect_issues(&fetch(200), &seo);
        assert!(
            issues
                .iter()
                .any(|i| i.issue_type == IssueType::MissingMetaDescription.id()),
            "no meta description should trigger issue"
        );
    }

    #[test]
    fn detect_meta_description_too_long() {
        let mut seo = good_seo();
        seo.meta_description = Some("x".repeat(200)); // 200 chars > 160 threshold
        let issues = detect_issues(&fetch(200), &seo);
        assert!(
            issues
                .iter()
                .any(|i| i.issue_type == IssueType::MetaDescriptionTooLong.id()),
            "200-char meta description should trigger issue"
        );
    }

    #[test]
    fn detect_missing_h1() {
        let mut seo = good_seo();
        seo.has_h1 = false;
        seo.h1_count = 0;
        let issues = detect_issues(&fetch(200), &seo);
        assert!(
            issues
                .iter()
                .any(|i| i.issue_type == IssueType::MissingH1.id()),
            "no H1 should trigger issue"
        );
    }

    #[test]
    fn detect_multiple_h1() {
        let mut seo = good_seo();
        seo.has_h1 = true;
        seo.h1_count = 3;
        let issues = detect_issues(&fetch(200), &seo);
        assert!(
            issues
                .iter()
                .any(|i| i.issue_type == IssueType::MultipleH1.id()),
            "3 H1 tags should trigger issue"
        );
    }

    #[test]
    fn detect_missing_h2_on_long_page() {
        let mut seo = good_seo();
        seo.headings_h2 = vec![]; // no H2
        seo.word_count = Some(500); // long page
        let issues = detect_issues(&fetch(200), &seo);
        assert!(
            issues
                .iter()
                .any(|i| i.issue_type == IssueType::MissingH2.id()),
            "long page with H1 but no H2 should trigger issue"
        );
    }

    #[test]
    fn detect_missing_h2_not_triggered_on_short_page() {
        let mut seo = good_seo();
        seo.headings_h2 = vec![];
        seo.word_count = Some(30); // short page
        let issues = detect_issues(&fetch(200), &seo);
        assert!(
            !issues
                .iter()
                .any(|i| i.issue_type == IssueType::MissingH2.id()),
            "short page without H2 should NOT trigger issue"
        );
    }

    #[test]
    fn detect_noindex() {
        let mut seo = good_seo();
        seo.noindex = true;
        let issues = detect_issues(&fetch(200), &seo);
        assert!(
            issues
                .iter()
                .any(|i| i.issue_type == IssueType::Noindex.id()),
            "noindex page should trigger issue"
        );
    }

    #[test]
    fn detect_noindex_not_fired_on_4xx() {
        let mut seo = good_seo();
        seo.noindex = true;
        let issues = detect_issues(&fetch(404), &seo);
        assert!(
            !issues
                .iter()
                .any(|i| i.issue_type == IssueType::Noindex.id()),
            "4xx page with noindex should not trigger Noindex issue"
        );
    }

    #[test]
    fn detect_non_200_status_404_is_critical() {
        let seo = good_seo();
        let issues = detect_issues(&fetch(404), &seo);
        let status_issue = issues
            .iter()
            .find(|i| i.issue_type == IssueType::Non200Status.id())
            .expect("404 should trigger Non200Status");
        assert_eq!(status_issue.severity, IssueSeverity::Critical);
    }

    #[test]
    fn detect_non_200_status_500_is_critical() {
        let seo = good_seo();
        let issues = detect_issues(&fetch(500), &seo);
        let status_issue = issues
            .iter()
            .find(|i| i.issue_type == IssueType::Non200Status.id())
            .expect("500 should trigger Non200Status");
        assert_eq!(status_issue.severity, IssueSeverity::Critical);
    }

    #[test]
    fn detect_non_200_status_4xx_not_404_is_warning() {
        let seo = good_seo();
        let issues = detect_issues(&fetch(403), &seo);
        let status_issue = issues
            .iter()
            .find(|i| i.issue_type == IssueType::Non200Status.id())
            .expect("403 should trigger Non200Status");
        assert_eq!(status_issue.severity, IssueSeverity::Warning);
    }

    #[test]
    fn detect_200_status_no_issue() {
        let issues = detect_issues(&fetch(200), &good_seo());
        assert!(
            !issues
                .iter()
                .any(|i| i.issue_type == IssueType::Non200Status.id()),
            "200 status should not trigger Non200Status"
        );
    }

    #[test]
    fn detect_slow_response() {
        let seo = good_seo();
        let issues = detect_issues(&fetch_slow(200, 5000.0), &seo);
        assert!(
            issues
                .iter()
                .any(|i| i.issue_type == IssueType::SlowResponse.id()),
            "5s response time should trigger SlowResponse"
        );
    }

    #[test]
    fn detect_fast_response_no_issue() {
        let issues = detect_issues(&fetch_slow(200, 200.0), &good_seo());
        assert!(
            !issues
                .iter()
                .any(|i| i.issue_type == IssueType::SlowResponse.id()),
            "200ms response time should not trigger SlowResponse"
        );
    }

    #[test]
    fn detect_missing_canonical() {
        let mut seo = good_seo();
        seo.canonical_url = None;
        seo.self_referencing_canonical = false;
        let issues = detect_issues(&fetch(200), &seo);
        assert!(
            issues
                .iter()
                .any(|i| i.issue_type == IssueType::MissingCanonical.id()),
            "page without canonical should trigger MissingCanonical"
        );
    }

    #[test]
    fn detect_non_self_referencing_canonical() {
        let mut seo = good_seo();
        seo.canonical_url = Some("https://example.com/other-page".to_string());
        seo.self_referencing_canonical = false;
        let issues = detect_issues(&fetch(200), &seo);
        assert!(
            issues
                .iter()
                .any(|i| i.issue_type == IssueType::NonSelfReferencingCanonical.id()),
            "canonical pointing elsewhere should trigger issue"
        );
    }

    #[test]
    fn detect_self_referencing_canonical_no_issue() {
        let seo = good_seo(); // canonical = page URL, self_referencing = true
        let issues = detect_issues(&fetch(200), &seo);
        assert!(
            !issues
                .iter()
                .any(|i| i.issue_type == IssueType::MissingCanonical.id()),
            "self-referencing canonical should not trigger MissingCanonical"
        );
        assert!(
            !issues
                .iter()
                .any(|i| i.issue_type == IssueType::NonSelfReferencingCanonical.id()),
            "self-referencing canonical should not trigger NonSelfReferencingCanonical"
        );
    }

    #[test]
    fn detect_missing_canonical_skipped_for_noindex() {
        let mut seo = good_seo();
        seo.canonical_url = None;
        seo.noindex = true;
        let issues = detect_issues(&fetch(200), &seo);
        // noindex pages should not get MissingCanonical
        assert!(
            !issues
                .iter()
                .any(|i| i.issue_type == IssueType::MissingCanonical.id()),
            "noindex page should not trigger MissingCanonical"
        );
    }

    #[test]
    fn detect_images_without_alt() {
        let mut seo = good_seo();
        seo.images_with_alt = 2;
        seo.images_without_alt = 5;
        seo.image_count = 7;
        let issues = detect_issues(&fetch(200), &seo);
        assert!(
            issues
                .iter()
                .any(|i| i.issue_type == IssueType::ImagesWithoutAlt.id()),
            "5/7 images without alt (>20% missing) should trigger issue"
        );
    }

    #[test]
    fn detect_images_ok_with_most_alt() {
        let mut seo = good_seo();
        seo.images_with_alt = 9;
        seo.images_without_alt = 1;
        seo.image_count = 10;
        let issues = detect_issues(&fetch(200), &seo);
        // 90% have alt — above 80% threshold
        assert!(
            !issues
                .iter()
                .any(|i| i.issue_type == IssueType::ImagesWithoutAlt.id()),
            "90% images with alt should not trigger issue"
        );
    }

    #[test]
    fn detect_images_not_triggered_below_3_images() {
        let mut seo = good_seo();
        seo.images_with_alt = 0;
        seo.images_without_alt = 2;
        seo.image_count = 2;
        let issues = detect_issues(&fetch(200), &seo);
        // Only 2 images total — below the 3-image threshold
        assert!(
            !issues
                .iter()
                .any(|i| i.issue_type == IssueType::ImagesWithoutAlt.id()),
            "only 2 images total should not trigger ImagesWithoutAlt"
        );
    }

    #[test]
    fn issue_url_matches_page_url() {
        let seo = SeoData::default();
        let issues = detect_issues(&fetch(200), &seo);
        // Every issue should have the page's URL
        for issue in &issues {
            assert_eq!(
                issue.url, "https://example.com/page",
                "issue {:?} has wrong URL: {}",
                issue.issue_type, issue.url
            );
        }
    }
}
