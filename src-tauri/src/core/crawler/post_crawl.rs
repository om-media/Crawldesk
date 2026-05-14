//! Post-crawl analysis detectors — canonical, content, hreflang, image, security,
//! social, structured data, JS rendering, and cross-page duplicate/cluster detectors.
//! DB-dependent detectors (link-graph, sitemap-comparison, pagination) accept
//! pre-fetched data structures so they remain testable without a live DB connection.

use super::issue_registry::{issue_with, IssueType};
use super::models::{FetchResult, IssueCategory, IssueSeverity, SeoData, SeoIssue};
use super::normalizer::are_same_url;
use crate::core::storage::models::UrlRecord;
use std::collections::HashMap;
use tracing::info;
use url::Url;

// ─────────────────────────────────────────────────────────────────
// Main orchestrator
// ─────────────────────────────────────────────────────────────────

/// Run all post-crawl detectors on a complete set of URL records.
///
/// The `seo_data_map` keys are URLs (the page URL) and values are the
/// extracted SEO data for that page.
///
/// For per-page detectors we iterate over (url, seo) pairs.
/// For cross-page detectors we pass the whole map.
pub fn run_post_crawl_analysis(
    urls: &[UrlRecord],
    seo_data_map: &HashMap<String, SeoData>,
    fetch_results: &HashMap<String, FetchResult>,
) -> Vec<SeoIssue> {
    let mut issues = Vec::new();

    // ── Per-page detectors ──────────────────────────────────────
    for (url, seo) in seo_data_map {
        let fetch = fetch_results.get(url);

        // Canonical Detector
        detect_canonical_issues(url, seo, &mut issues);

        // Content Detector
        detect_content_issues(url, seo, &mut issues);

        // Hreflang Detector
        detect_hreflang_issues(url, seo, &mut issues);

        // AMP Detector — validates AMP page signals and amphtml references.
        detect_amp_issues(url, seo, &mut issues);

        // Image Detector
        detect_image_issues(url, seo, &mut issues);

        // Security Detector
        detect_security_issues(url, seo, fetch, &mut issues);

        // Social Detector
        detect_social_issues(url, seo, &mut issues);

        // Structured Data Detector
        detect_structured_data_issues(url, seo, &mut issues);

        // JS Rendering Detector
        detect_js_rendering_issues(url, seo, fetch, &mut issues);
    }

    // ── Cross-page detectors ───────────────────────────────────
    detect_duplicate_titles(seo_data_map, &mut issues);
    detect_duplicate_meta_descriptions(seo_data_map, &mut issues);
    detect_content_duplicates(seo_data_map, &mut issues);
    detect_canonical_clusters(seo_data_map, &mut issues);
    detect_redirect_chains(seo_data_map, &mut issues);
    detect_amp_cross_page_issues(seo_data_map, &mut issues);

    info!("Post-crawl analysis: {} issues found", issues.len());

    issues
}

/// Convenience overload that only passes SEO data (no fetch results).
/// JS rendering and security detectors will be skipped when fetch context
/// is unavailable.
pub fn run_post_crawl_analysis_basic(
    urls: &[UrlRecord],
    seo_data_map: &HashMap<String, SeoData>,
) -> Vec<SeoIssue> {
    run_post_crawl_analysis(urls, seo_data_map, &HashMap::new())
}

// ─────────────────────────────────────────────────────────────────
// Canonical Detector
// ─────────────────────────────────────────────────────────────────

/// Detects canonical-related issues: missing tag, external domain,
/// canonicalized URL (mismatch with current URL).
fn detect_canonical_issues(url: &str, seo: &SeoData, issues: &mut Vec<SeoIssue>) {
    // --- No canonical tag ---
    if seo.canonical_url.is_none() || seo.canonical_url.as_ref().map_or(true, |c| c.is_empty()) {
        issues.push(issue_with(
            IssueType::NoCanonicalTag,
            IssueSeverity::Warning,
            IssueCategory::Technical,
            "Page has no canonical link element.",
            serde_json::json!({
                "url": url,
                "recommendation": "Add a self-referencing canonical tag to every page to prevent duplicate content issues."
            }),
        ));
        return;
    }

    let canonical = seo.canonical_url.as_ref().expect("checked above");

    // Try to parse both URLs for hostname comparison
    let page_url = match Url::parse(url) {
        Ok(u) => u,
        Err(_) => return, // Invalid page URL — skip
    };
    let canon_url = match Url::parse(canonical) {
        Ok(u) => u,
        Err(_) => return, // Invalid canonical URL — skip
    };

    // --- External canonical ---
    if canon_url.host_str().map_or(true, |h| {
        h.to_lowercase()
            != page_url
                .host_str()
                .map_or(String::new(), |h| h.to_lowercase())
    }) {
        issues.push(issue_with(
            IssueType::ExternalCanonical,
            IssueSeverity::Critical,
            IssueCategory::Technical,
            format!(
                "Canonical points to external domain: {}.",
                canon_url.host_str().unwrap_or("unknown")
            ),
            serde_json::json!({
                "url": url,
                "canonical": canonical,
                "recommendation": "External canonicalization may cause ranking signals to flow away from your site. Verify this is intentional."
            }),
        ));
    }

    // --- Canonicalized URL (mismatch with current URL) ---
    let page_norm = page_url.to_string().trim_end_matches('/').to_lowercase();
    let canon_norm = canon_url.to_string().trim_end_matches('/').to_lowercase();
    if canon_norm != page_norm {
        issues.push(issue_with(
            IssueType::CanonicalizedUrl,
            IssueSeverity::Warning,
            IssueCategory::Technical,
            format!(
                "Canonical points to {}, which differs from the current URL.",
                canonical
            ),
            serde_json::json!({
                "url": url,
                "canonical": canonical,
                "recommendation": "Verify the canonical target is correct or self-reference if this page should rank independently."
            }),
        ));
    }
}

// ─────────────────────────────────────────────────────────────────
// Content Detector
// ─────────────────────────────────────────────────────────────────

/// Detects title, meta description, heading hierarchy, and noindex issues.
fn detect_content_issues(url: &str, seo: &SeoData, issues: &mut Vec<SeoIssue>) {
    // --- Title checks ---
    match &seo.title {
        Some(t) if !t.trim().is_empty() => {
            let len = t.chars().count();
            if len > 60 {
                issues.push(issue_with(
                    IssueType::TitleTooLong,
                    IssueSeverity::Info,
                    IssueCategory::Content,
                    format!(
                        "Title is {} characters long, which may be truncated in search results.",
                        len
                    ),
                    serde_json::json!({
                        "url": url,
                        "length": len,
                        "recommendation": "Shorten the title to approximately 50-60 characters."
                    }),
                ));
            }
            if len < 30 {
                issues.push(issue_with(
                    IssueType::TitleTooShort,
                    IssueSeverity::Info,
                    IssueCategory::Content,
                    format!(
                        "Title is only {} characters, providing insufficient context.",
                        len
                    ),
                    serde_json::json!({
                        "url": url,
                        "length": len,
                        "recommendation": "Expand the title to include more descriptive keywords (target 40-60 chars)."
                    }),
                ));
            }
        }
        _ => {
            // None or empty string
            issues.push(issue_with(
                IssueType::MissingTitle,
                IssueSeverity::Critical,
                IssueCategory::Content,
                "Page has no <title> tag or it is empty.",
                serde_json::json!({
                    "url": url,
                    "recommendation": "Add a descriptive, unique <title> tag to this page."
                }),
            ));
        }
    }

    // --- Meta description checks ---
    match &seo.meta_description {
        Some(d) if !d.trim().is_empty() => {
            let len = d.chars().count();
            if len > 160 {
                issues.push(issue_with(
                    IssueType::MetaDescriptionTooLong,
                    IssueSeverity::Info,
                    IssueCategory::Content,
                    format!("Meta description is {} characters and may be truncated.", len),
                    serde_json::json!({
                        "url": url,
                        "length": len,
                        "recommendation": "Shorten to 120-155 characters for optimal display in search results."
                    }),
                ));
            }
            if len < 70 {
                issues.push(issue_with(
                    IssueType::MetaDescriptionTooShort,
                    IssueSeverity::Info,
                    IssueCategory::Content,
                    format!("Meta description is only {} characters.", len),
                    serde_json::json!({
                        "url": url,
                        "length": len,
                        "recommendation": "Expand to 120-155 characters to provide better context for searchers."
                    }),
                ));
            }
        }
        _ => {
            // None or empty string
            issues.push(issue_with(
                IssueType::MissingMetaDescription,
                IssueSeverity::Warning,
                IssueCategory::Content,
                "Page has no meta description.",
                serde_json::json!({
                    "url": url,
                    "recommendation": "Add a concise meta description of 120-155 characters."
                }),
            ));
        }
    }

    // --- H1 checks ---
    if !seo.has_h1 || seo.h1_count == 0 {
        issues.push(issue_with(
            IssueType::MissingH1,
            IssueSeverity::Warning,
            IssueCategory::Structure,
            "Page has no H1 heading.",
            serde_json::json!({
                "url": url,
                "recommendation": "Add exactly one descriptive H1 that summarizes the page content."
            }),
        ));
    } else if seo.h1_count > 1 {
        issues.push(issue_with(
            IssueType::MultipleH1,
            IssueSeverity::Info,
            IssueCategory::Structure,
            format!("Page has {} H1 headings.", seo.h1_count),
            serde_json::json!({
                "url": url,
                "count": seo.h1_count,
                "recommendation": "Use a single H1 per page; convert additional ones to H2 or lower."
            }),
        ));
    }

    // --- Missing H2 (port of content-detector missing_h2) ---
    if seo.headings_h2.is_empty() && seo.word_count.map_or(false, |w| w > 0) {
        issues.push(issue_with(
            IssueType::MissingH2,
            IssueSeverity::Info,
            IssueCategory::Structure,
            "Page has no H2 headings.",
            serde_json::json!({
                "url": url,
                "recommendation": "Add descriptive H2 sections to structure your content and improve readability."
            }),
        ));
    }

    // --- Heading non-sequential detection ---
    detect_non_sequential_headings(url, seo, issues);

    // --- Noindex check ---
    let is_noindex = seo.robots_meta.as_ref().map_or(false, |r| {
        let lower = r.to_lowercase();
        lower.contains("noindex") || lower.contains("none")
    }) || seo.noindex;
    if is_noindex {
        issues.push(issue_with(
            IssueType::ImportantPageNoindex,
            IssueSeverity::Critical,
            IssueCategory::Technical,
            "Page is set to noindex and will be excluded from search engine results.",
            serde_json::json!({
                "url": url,
                "recommendation": "Remove noindex directive if this page should rank in search engines."
            }),
        ));
    }
}

/// Check for heading hierarchy that skips levels (e.g., H1 → H3 without H2).
fn detect_non_sequential_headings(url: &str, seo: &SeoData, issues: &mut Vec<SeoIssue>) {
    // Build list of (level, count) for headings present on the page
    let heading_counts: Vec<(i32, i32)> = [
        (1, seo.h1_count),
        (2, seo.headings_h2.len() as i32),
        (3, seo.headings_h3.len() as i32),
        (4, seo.headings_h4.len() as i32),
        (5, seo.headings_h5.len() as i32),
        (6, seo.headings_h6.len() as i32),
    ]
    .iter()
    .filter(|(_, count)| *count > 0)
    .cloned()
    .collect();

    let mut prev_level: i32 = -1;
    for (level, _) in &heading_counts {
        if *level > prev_level + 1 {
            let from_level = if prev_level < 0 { 0 } else { prev_level };
            issues.push(issue_with(
                IssueType::HeadingNonSequential,
                IssueSeverity::Warning,
                IssueCategory::Structure,
                format!("Heading hierarchy skips from H{} to H{}.", from_level, level),
                serde_json::json!({
                    "url": url,
                    "from_level": from_level,
                    "to_level": level,
                    "recommendation": "Headings should follow sequential order (H1 → H2 → H3). Fix the heading structure for better accessibility and SEO."
                }),
            ));
            break; // at most one issue per page
        }
        prev_level = *level;
    }
}

// ─────────────────────────────────────────────────────────────────
// Hreflang Detector
// ─────────────────────────────────────────────────────────────────

/// Detects duplicate language codes and invalid hreflang codes.
fn detect_hreflang_issues(url: &str, seo: &SeoData, issues: &mut Vec<SeoIssue>) {
    if seo.hreflang_alternates.is_empty() {
        return;
    }

    // hreflang_alternates is Vec<String> in crawler models — these are language codes.
    // But in the TS version, it's Vec<{hreflang, href}>.
    // When stored as Vec<String> we only have the lang codes, not hrefs.
    // We still check for duplicate lang codes.

    // Count occurrences of each language code
    let mut lang_counts: HashMap<String, i32> = HashMap::new();
    for lang in &seo.hreflang_alternates {
        *lang_counts.entry(lang.clone()).or_insert(0) += 1;
    }

    // Duplicate language codes on the same page
    for (lang, count) in &lang_counts {
        if *count > 1 {
            issues.push(issue_with(
                IssueType::HreflangDuplicateLang,
                IssueSeverity::Critical,
                IssueCategory::Internationalization,
                format!(
                    "Language code \"{}\" appears {} times in hreflang tags on this page.",
                    lang, count
                ),
                serde_json::json!({
                    "url": url,
                    "language_code": lang,
                    "count": count,
                    "recommendation": "Each hreflang value should be unique per page. Remove duplicate entries."
                }),
            ));
        }
    }

    // Validate language code format (basic BCP-47 check)
    let valid_lang_re =
        regex::Regex::new(r"(?i)^(\*|[a-z]{2}(?:-[A-Z]{2})?|x-default)$").expect("valid regex");
    for lang in &seo.hreflang_alternates {
        if !valid_lang_re.is_match(lang) && lang != "*" {
            issues.push(issue_with(
                IssueType::HreflangInvalidCode,
                IssueSeverity::Warning,
                IssueCategory::Internationalization,
                format!(
                    "Invalid hreflang code: \"{}\". Expected a valid BCP-47 language tag or \"x-default\".",
                    lang
                ),
                serde_json::json!({
                    "url": url,
                    "hreflang": lang,
                    "recommendation": "Use ISO 639-1 language codes (e.g., \"en\", \"de\") with optional region (e.g., \"en-US\")."
                }),
            ));
        }
    }
}

// ─────────────────────────────────────────────────────────────────
// AMP Detector
// ─────────────────────────────────────────────────────────────────

fn detect_amp_issues(url: &str, seo: &SeoData, issues: &mut Vec<SeoIssue>) {
    if seo.is_amp
        && seo
            .canonical_url
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_none()
    {
        issues.push(issue_with(
            IssueType::AmpMissingCanonical,
            IssueSeverity::Warning,
            IssueCategory::Technical,
            "AMP page is missing a canonical URL.",
            serde_json::json!({
                "url": url,
                "recommendation": "Add a canonical link from the AMP page to the equivalent canonical page."
            }),
        ));
    }

    if let Some(amp_url) = seo.amp_html_url.as_deref() {
        let parsed = Url::parse(amp_url);
        let invalid_scheme = parsed
            .as_ref()
            .map(|url| url.scheme() != "http" && url.scheme() != "https")
            .unwrap_or(true);

        if invalid_scheme || are_same_url(url, amp_url) {
            issues.push(issue_with(
                IssueType::AmpInvalidTarget,
                IssueSeverity::Warning,
                IssueCategory::Technical,
                "AMP HTML link points to an invalid target.",
                serde_json::json!({
                    "url": url,
                    "amp_url": amp_url,
                    "recommendation": "Point rel=\"amphtml\" to a crawlable HTTP(S) AMP URL that is distinct from the canonical page."
                }),
            ));
        }
    }
}

fn detect_amp_cross_page_issues(
    seo_data_map: &HashMap<String, SeoData>,
    issues: &mut Vec<SeoIssue>,
) {
    for (canonical_url, seo) in seo_data_map {
        let Some(amp_url) = seo.amp_html_url.as_deref() else {
            continue;
        };

        if are_same_url(canonical_url, amp_url) {
            continue;
        }

        let Some((resolved_amp_url, amp_seo)) = find_seo_by_url(seo_data_map, amp_url) else {
            continue;
        };

        if !amp_seo.is_amp {
            issues.push(issue_with(
                IssueType::AmpInvalidTarget,
                IssueSeverity::Warning,
                IssueCategory::Technical,
                "AMP HTML link points to a page that is not marked as AMP.",
                serde_json::json!({
                    "url": canonical_url,
                    "amp_url": resolved_amp_url,
                    "recommendation": "Ensure the rel=\"amphtml\" target is a valid AMP document with an <html amp> attribute."
                }),
            ));
            continue;
        }

        let Some(amp_canonical) = amp_seo.canonical_url.as_deref() else {
            continue;
        };

        if !are_same_url(amp_canonical, canonical_url) {
            issues.push(issue_with(
                IssueType::AmpCanonicalMismatch,
                IssueSeverity::Warning,
                IssueCategory::Technical,
                "AMP page canonical does not point back to the canonical page that references it.",
                serde_json::json!({
                    "url": canonical_url,
                    "amp_url": resolved_amp_url,
                    "amp_canonical_url": amp_canonical,
                    "recommendation": "Set the AMP page canonical URL to the non-AMP canonical page that links to it."
                }),
            ));
        }
    }
}

fn find_seo_by_url<'a>(
    seo_data_map: &'a HashMap<String, SeoData>,
    target_url: &str,
) -> Option<(&'a str, &'a SeoData)> {
    seo_data_map
        .iter()
        .find(|(url, _seo)| are_same_url(url, target_url))
        .map(|(url, seo)| (url.as_str(), seo))
}

// ─────────────────────────────────────────────────────────────────
// Image Detector
// ─────────────────────────────────────────────────────────────────

/// Detects image accessibility issues: missing alt attribute,
/// empty alt text, alt too long.
fn detect_image_issues(url: &str, seo: &SeoData, issues: &mut Vec<SeoIssue>) {
    // --- Images missing alt attribute entirely ---
    if seo.images_without_alt > 0 {
        issues.push(issue_with(
            IssueType::ImageMissingAltAttribute,
            IssueSeverity::Critical,
            IssueCategory::Content,
            format!("{} image(s) missing alt attribute.", seo.images_without_alt),
            serde_json::json!({
                "url": url,
                "count": seo.images_without_alt,
                "recommendation": "Add descriptive alt text to every meaningful image. Use alt=\"\" only for purely decorative images."
            }),
        ));
    }

    if seo.images_missing_dimensions > 0 {
        issues.push(issue_with(
            IssueType::ImageMissingDimensions,
            IssueSeverity::Info,
            IssueCategory::Performance,
            format!(
                "{} image(s) missing explicit width or height.",
                seo.images_missing_dimensions
            ),
            serde_json::json!({
                "url": url,
                "count": seo.images_missing_dimensions,
                "recommendation": "Add width and height attributes or CSS aspect-ratio to image elements to reduce layout shift."
            }),
        ));
    }

    if seo.images_missing_lazy_loading > 0 {
        issues.push(issue_with(
            IssueType::ImageMissingLazyLoading,
            IssueSeverity::Info,
            IssueCategory::Performance,
            format!(
                "{} likely below-the-fold image(s) are missing loading=\"lazy\".",
                seo.images_missing_lazy_loading
            ),
            serde_json::json!({
                "url": url,
                "count": seo.images_missing_lazy_loading,
                "recommendation": "Add loading=\"lazy\" to non-critical images that appear after the primary above-the-fold content."
            }),
        ));
    }

    if seo.total_image_size_kb > 1024.0 {
        issues.push(issue_with(
            IssueType::ImageOversized,
            IssueSeverity::Warning,
            IssueCategory::Performance,
            format!(
                "Total image weight is {:.0} KB, which may slow page rendering.",
                seo.total_image_size_kb
            ),
            serde_json::json!({
                "url": url,
                "total_image_size_kb": seo.total_image_size_kb,
                "recommendation": "Compress large images, serve responsive variants, and use modern formats such as WebP or AVIF."
            }),
        ));
    }
}

// ─────────────────────────────────────────────────────────────────
// JS Rendering Detector
// ─────────────────────────────────────────────────────────────────

/// Detects JS rendering discrepancies: title differs, noindex injected,
/// JS redirect, hidden text in rendered output.
fn detect_js_rendering_issues(
    url: &str,
    seo: &SeoData,
    fetch_result: Option<&FetchResult>,
    issues: &mut Vec<SeoIssue>,
) {
    let Some(fetch) = fetch_result else {
        return;
    };
    if !fetch.was_js_rendered {
        return;
    }

    // When we have JS-rendered content, compare raw title vs rendered title.
    // The `seo.title` is the parsed title from the final content (which may be
    // JS-rendered). If we have `js_rendered_html`, we know JS rendering happened.
    // For a full implementation we'd need separate raw/rendered title fields.
    // For now, flag when the page was JS-rendered (informational).
    if seo.js_rendered_html.is_some() {
        // Future: compare raw vs rendered title when both are available
        // For now, this detector is a stub that checks for JS-rendered pages.
        let _ = (url, seo, issues);
    }
}

// ─────────────────────────────────────────────────────────────────
// Security Detector
// ─────────────────────────────────────────────────────────────────

/// Detects security header issues: missing X-Content-Type-Options,
/// missing X-Frame-Options / CSP frame-ancestors, missing HSTS on HTTPS,
/// and mixed content (HTTP resources on HTTPS pages).
fn detect_security_issues(
    url: &str,
    _seo: &SeoData,
    fetch_result: Option<&FetchResult>,
    issues: &mut Vec<SeoIssue>,
) {
    let is_https = url.starts_with("https://");
    let Some(fetch) = fetch_result else {
        return;
    };

    if fetch.status_code < 200 || fetch.status_code >= 400 {
        return;
    }

    if !is_https {
        issues.push(issue_with(
            IssueType::InsecureHttp,
            IssueSeverity::Critical,
            IssueCategory::Security,
            "Page is served over HTTP instead of HTTPS.",
            serde_json::json!({
                "url": url,
                "recommendation": "Redirect this URL to HTTPS and serve all pages over TLS."
            }),
        ));
    }

    if !has_header(fetch, "x-content-type-options") {
        issues.push(issue_with(
            IssueType::MissingXContentTypeOptions,
            IssueSeverity::Warning,
            IssueCategory::Security,
            "Response is missing X-Content-Type-Options.",
            serde_json::json!({
                "url": url,
                "header": "x-content-type-options",
                "recommendation": "Add X-Content-Type-Options: nosniff to prevent MIME type sniffing."
            }),
        ));
    }

    if !has_header(fetch, "x-frame-options") && !csp_has_frame_ancestors(fetch) {
        issues.push(issue_with(
            IssueType::MissingXFrameOptions,
            IssueSeverity::Warning,
            IssueCategory::Security,
            "Response is missing clickjacking protection.",
            serde_json::json!({
                "url": url,
                "headers": ["x-frame-options", "content-security-policy"],
                "recommendation": "Add X-Frame-Options or a Content-Security-Policy frame-ancestors directive."
            }),
        ));
    }

    if !has_header(fetch, "content-security-policy") {
        issues.push(issue_with(
            IssueType::MissingCsp,
            IssueSeverity::Warning,
            IssueCategory::Security,
            "Response is missing Content-Security-Policy.",
            serde_json::json!({
                "url": url,
                "header": "content-security-policy",
                "recommendation": "Add a Content-Security-Policy that restricts scripts, styles, frames, images, and connections to trusted origins."
            }),
        ));
    }

    if !has_header(fetch, "referrer-policy") {
        issues.push(issue_with(
            IssueType::MissingReferrerPolicy,
            IssueSeverity::Info,
            IssueCategory::Security,
            "Response is missing Referrer-Policy.",
            serde_json::json!({
                "url": url,
                "header": "referrer-policy",
                "recommendation": "Add a Referrer-Policy such as strict-origin-when-cross-origin."
            }),
        ));
    }

    if is_https {
        if !has_header(fetch, "strict-transport-security") {
            issues.push(issue_with(
                IssueType::MissingHsts,
                IssueSeverity::Warning,
                IssueCategory::Security,
                "HTTPS response is missing Strict-Transport-Security.",
                serde_json::json!({
                    "url": url,
                    "header": "strict-transport-security",
                    "recommendation": "Add Strict-Transport-Security after verifying all subresources and subdomains are HTTPS-ready."
                }),
            ));
        }

        if let Some(html) = &fetch.html_content {
            if html_contains_mixed_content(html) {
                issues.push(issue_with(
                    IssueType::MixedContent,
                    IssueSeverity::Critical,
                    IssueCategory::Security,
                    "HTTPS page references insecure HTTP resources.",
                    serde_json::json!({
                        "url": url,
                        "recommendation": "Replace http:// resource URLs with HTTPS equivalents or remove the insecure resources."
                    }),
                ));
            }
        }
    }
}

fn has_header(fetch: &FetchResult, name: &str) -> bool {
    fetch.headers.contains_key(&name.to_ascii_lowercase())
}

fn header_value<'a>(fetch: &'a FetchResult, name: &str) -> Option<&'a str> {
    fetch
        .headers
        .get(&name.to_ascii_lowercase())
        .map(String::as_str)
}

fn csp_has_frame_ancestors(fetch: &FetchResult) -> bool {
    header_value(fetch, "content-security-policy")
        .map(|value| value.to_ascii_lowercase().contains("frame-ancestors"))
        .unwrap_or(false)
}

fn html_contains_mixed_content(html: &str) -> bool {
    let lower = html.to_ascii_lowercase();
    lower.contains("src=\"http://")
        || lower.contains("src='http://")
        || lower.contains("href=\"http://")
        || lower.contains("href='http://")
        || lower.contains("url(http://")
        || lower.contains("url('http://")
        || lower.contains("url(\"http://")
}

// ─────────────────────────────────────────────────────────────────
// Social Detector
// ─────────────────────────────────────────────────────────────────

/// Detects missing/incomplete Open Graph and Twitter Card meta tags.
fn detect_social_issues(url: &str, seo: &SeoData, issues: &mut Vec<SeoIssue>) {
    // Parse social meta from JSON Value fields
    let og_title = seo
        .social_meta_open_graph
        .get("ogTitle")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let og_desc = seo
        .social_meta_open_graph
        .get("ogDescription")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let og_image = seo
        .social_meta_open_graph
        .get("ogImageUrl")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let twitter_card = seo
        .social_meta_twitter_card
        .get("twitterCard")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let twitter_image = seo
        .social_meta_twitter_card
        .get("twitterImageUrl")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let has_any_og = !og_title.is_empty() || !og_desc.is_empty() || !og_image.is_empty();

    // --- Missing OG tags entirely ---
    if !has_any_og {
        issues.push(issue_with(
            IssueType::MissingOgTags,
            IssueSeverity::Warning,
            IssueCategory::Social,
            "Page is missing Open Graph meta tags.",
            serde_json::json!({
                "url": url,
                "recommendation": "Add og:title, og:description, and og:image for proper social media sharing previews."
            }),
        ));
    } else if (!og_title.is_empty() || !og_desc.is_empty()) && og_image.is_empty() {
        // OG tags present but no image
        issues.push(issue_with(
            IssueType::OgMissingImage,
            IssueSeverity::Info,
            IssueCategory::Social,
            "Open Graph tags are missing og:image.",
            serde_json::json!({
                "url": url,
                "recommendation": "Add og:image to ensure rich preview cards when shared on Facebook/LinkedIn."
            }),
        ));
    }

    // --- Missing Twitter Card ---
    if twitter_card.is_empty() {
        issues.push(issue_with(
            IssueType::MissingTwitterCard,
            IssueSeverity::Info,
            IssueCategory::Social,
            "Page is missing Twitter Card meta tags.",
            serde_json::json!({
                "url": url,
                "recommendation": "Add twitter:card meta tag for proper Twitter preview rendering."
            }),
        ));
    } else if twitter_image.is_empty() {
        // Twitter card present but no image
        issues.push(issue_with(
            IssueType::TwitterMissingImage,
            IssueSeverity::Info,
            IssueCategory::Social,
            "Twitter Card is missing image.",
            serde_json::json!({
                "url": url,
                "recommendation": "Add twitter:image for visual preview in Twitter feeds."
            }),
        ));
    }
}

// ─────────────────────────────────────────────────────────────────
// Structured Data Detector
// ─────────────────────────────────────────────────────────────────

/// Required fields by schema type for rich results eligibility.
fn get_required_fields(schema_type: &str) -> Vec<&'static str> {
    match schema_type {
        "Organization" => vec!["name"],
        "LocalBusiness" => vec!["name", "address"],
        "Article" => vec!["headline", "author", "datePublished"],
        "NewsArticle" => vec!["headline", "author", "datePublished", "image"],
        "BlogPosting" => vec!["headline", "author", "datePublished"],
        "Product" => vec!["name", "description", "offers"],
        "Recipe" => vec!["name", "image", "recipeInstructions"],
        "VideoObject" => vec!["name", "thumbnailUrl", "uploadDate"],
        "Event" => vec!["name", "startDate"],
        "FAQPage" => vec!["mainEntity"],
        "HowTo" => vec!["name", "step"],
        "BreadcrumbList" => vec!["itemListElement"],
        "JobPosting" => vec!["title", "datePosted", "hiringOrganization", "jobLocation"],
        _ => vec![],
    }
}

/// Check if a JSON-LD block has the required field.
fn json_ld_has_field(block: &serde_json::Value, field: &str) -> bool {
    // Direct check
    if block.get(field).map_or(false, |v| !v.is_null()) {
        return true;
    }
    // Common nesting via @graph
    if let Some(graph) = block.get("@graph").and_then(|v| v.as_array()) {
        for item in graph {
            if item.get(field).map_or(false, |v| !v.is_null()) {
                return true;
            }
        }
    }
    false
}

fn structured_data_issue_type(schema_type: &str, missing: &[&str]) -> IssueType {
    if schema_type == "Product" && missing.contains(&"offers") {
        IssueType::ProductMissingPrice
    } else if (schema_type == "Article" || schema_type == "NewsArticle")
        && missing.contains(&"author")
    {
        IssueType::ArticleMissingAuthor
    } else if schema_type == "BreadcrumbList" && missing.contains(&"itemListElement") {
        IssueType::BreadcrumbInvalid
    } else {
        IssueType::StructuredDataMissingFields
    }
}

/// Detects missing required fields in JSON-LD structured data.
fn detect_structured_data_issues(url: &str, seo: &SeoData, issues: &mut Vec<SeoIssue>) {
    if seo.structured_data_json.is_empty() {
        return;
    }

    for block in &seo.structured_data_json {
        let types: Vec<String> = match block.get("@type") {
            Some(serde_json::Value::String(s)) => vec![s.clone()],
            Some(serde_json::Value::Array(arr)) => arr
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect(),
            _ => vec![],
        };

        for schema_type in &types {
            let required = get_required_fields(schema_type);
            if required.is_empty() {
                continue;
            }

            let missing: Vec<&str> = required
                .iter()
                .filter(|field| !json_ld_has_field(block, field))
                .copied()
                .collect();

            if !missing.is_empty() {
                issues.push(issue_with(
                    structured_data_issue_type(schema_type, &missing),
                    IssueSeverity::Warning,
                    IssueCategory::Technical,
                    format!(
                        "Structured data ({}) is missing required fields: {}.",
                        schema_type,
                        missing.join(", ")
                    ),
                    serde_json::json!({
                        "url": url,
                        "schema_type": schema_type,
                        "missing_fields": missing,
                        "recommendation": format!("Add the following required fields to your JSON-LD {}: {}.", schema_type, missing.join(", "))
                    }),
                ));
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────
// Link Graph Detector
// ─────────────────────────────────────────────────────────────────

/// Data needed for link-graph detection. Constructed from DB queries
/// before calling the detector.
pub struct LinkGraphData {
    /// Orphaned pages: (url_id, url) pairs with inlink_count == 0
    pub orphaned_pages: Vec<(i64, String)>,
    /// Start URL of the crawl (excluded from orphans)
    pub start_url: Option<String>,
    /// Anchor text over-optimization: (target_url_id, source_url, top_anchor, percentage)
    pub anchor_over_optimized: Vec<(i64, String, String, i32)>,
    /// Links to 4xx: (source_url_id, source_url, count)
    pub links_to_4xx: Vec<(i64, String, i32)>,
}

/// Detects orphaned pages, anchor text over-optimization,
/// and internal links to 4xx pages.
pub fn detect_link_graph_issues(data: &LinkGraphData) -> Vec<SeoIssue> {
    let mut issues = Vec::new();

    // --- Orphaned pages ---
    for (url_id, url) in &data.orphaned_pages {
        // Exclude crawl start URL
        if let Some(ref start) = data.start_url {
            if url == start {
                continue;
            }
        }
        issues.push(issue_with(
            IssueType::OrphanedPage,
            IssueSeverity::Critical,
            IssueCategory::Links,
            "Page is orphaned — no internal links point to it.",
            serde_json::json!({
                "url_id": url_id,
                "url": url,
                "recommendation": "Add this page to your site navigation or create relevant internal links pointing to it."
            }),
        ));
    }

    // --- Anchor text over-optimization ---
    for (_target_id, source_url, anchor, pct) in &data.anchor_over_optimized {
        issues.push(issue_with(
            IssueType::AnchorTextOverOptimized,
            IssueSeverity::Info,
            IssueCategory::Links,
            format!(
                "\"{}\" makes up {}% of anchor texts pointing to this page.",
                anchor, pct
            ),
            serde_json::json!({
                "url": source_url,
                "anchor_text": anchor,
                "percentage": pct,
                "recommendation": "Diversify anchor texts linking to this page for a natural backlink profile."
            }),
        ));
    }

    // --- Internal links to 4xx ---
    for (url_id, source_url, count) in &data.links_to_4xx {
        issues.push(issue_with(
            IssueType::InternalLinkTo4xx,
            IssueSeverity::Warning,
            IssueCategory::Links,
            format!("{} internal link(s) point to broken URLs.", count),
            serde_json::json!({
                "url_id": url_id,
                "url": source_url,
                "count": count,
                "recommendation": "Update or remove links pointing to pages that return client errors."
            }),
        ));
    }

    issues
}

// ─────────────────────────────────────────────────────────────────
// Pagination Detector
// ─────────────────────────────────────────────────────────────────

/// Data needed for pagination detection. Constructed from DB queries.
pub struct PaginationData {
    /// Crawled normalized URLs (lowercase) for quick lookup
    pub crawled_urls: std::collections::HashSet<String>,
    /// Paginated pages: (url_id, url, pagination_next, pagination_prev)
    pub paginated_pages: Vec<(i64, String, Option<String>, Option<String>)>,
    /// Paginated pages without canonical: (url_id, url)
    pub paginated_without_canonical: Vec<(i64, String)>,
}

/// Detects broken pagination chains and missing canonical on paginated pages.
pub fn detect_pagination_issues(data: &PaginationData) -> Vec<SeoIssue> {
    let mut issues = Vec::new();

    // --- Broken pagination chains ---
    for (url_id, url, next, prev) in &data.paginated_pages {
        if let Some(next_url) = next {
            if !data.crawled_urls.contains(&next_url.to_lowercase()) {
                issues.push(issue_with(
                    IssueType::BrokenPaginationChain,
                    IssueSeverity::Warning,
                    IssueCategory::Links,
                    format!(
                        "Pagination \"next\" link points to uncrawled URL: {}",
                        next_url
                    ),
                    serde_json::json!({
                        "url_id": url_id,
                        "url": url,
                        "next_url": next_url,
                        "recommendation": "Verify the next page exists and is accessible to crawlers."
                    }),
                ));
            }
        }
        if let Some(prev_url) = prev {
            if !data.crawled_urls.contains(&prev_url.to_lowercase()) {
                issues.push(issue_with(
                    IssueType::BrokenPaginationChain,
                    IssueSeverity::Warning,
                    IssueCategory::Links,
                    format!(
                        "Pagination \"prev\" link points to uncrawled URL: {}",
                        prev_url
                    ),
                    serde_json::json!({
                        "url_id": url_id,
                        "url": url,
                        "prev_url": prev_url,
                        "recommendation": "Verify the previous page exists and is accessible to crawlers."
                    }),
                ));
            }
        }
    }

    // --- Missing pagination canonical ---
    for (url_id, url) in &data.paginated_without_canonical {
        issues.push(issue_with(
            IssueType::MissingPaginationCanonical,
            IssueSeverity::Info,
            IssueCategory::Technical,
            "Paginated page missing canonical tag.",
            serde_json::json!({
                "url_id": url_id,
                "url": url,
                "recommendation": "Set self-referencing canonical on paginated pages, or point all to the main listing page."
            }),
        ));
    }

    issues
}

// ─────────────────────────────────────────────────────────────────
// Sitemap Comparison Detector
// ─────────────────────────────────────────────────────────────────

/// Data needed for sitemap comparison detection. Constructed from DB queries.
pub struct SitemapComparisonData {
    /// URLs declared in sitemaps (lowercase)
    pub sitemap_urls: std::collections::HashSet<String>,
    /// Crawled normalized URLs (lowercase) - (id, url)
    pub crawled_urls: Vec<(i64, String)>,
    /// Indexable pages: (id, url)
    pub indexable_pages: Vec<(i64, String)>,
    /// Error-status pages found in sitemap: (id, url, status_code)
    pub sitemap_error_pages: Vec<(i64, String, i32)>,
}

/// Compares sitemap-declared URLs against crawled URLs; generates issues
/// for discrepancies.
pub fn detect_sitemap_comparison_issues(data: &SitemapComparisonData) -> Vec<SeoIssue> {
    let mut issues = Vec::new();

    // Build set of crawled normalized URLs
    let crawled_set: std::collections::HashSet<String> = data
        .crawled_urls
        .iter()
        .map(|(_, u)| u.to_lowercase())
        .collect();

    // --- Sitemap URLs not crawled ---
    let not_crawled: Vec<&String> = data
        .sitemap_urls
        .iter()
        .filter(|u| !crawled_set.contains(&u.to_lowercase()))
        .take(500)
        .collect();

    for url in &not_crawled {
        issues.push(issue_with(
            IssueType::SitemapUrlNotCrawled,
            IssueSeverity::Info,
            IssueCategory::Technical,
            format!("URL {} is in the sitemap but was not crawled.", url),
            serde_json::json!({
                "url": url,
                "recommendation": "Check why this URL wasn't crawled — it may be blocked by robots.txt or unreachable."
            }),
        ));
    }

    // --- Crawled URLs missing from sitemap ---
    let sitemap_lower: std::collections::HashSet<String> =
        data.sitemap_urls.iter().map(|u| u.to_lowercase()).collect();

    for (id, url) in &data.indexable_pages {
        if !sitemap_lower.contains(&url.to_lowercase()) {
            issues.push(issue_with(
                IssueType::CrawledUrlMissingFromSitemap,
                IssueSeverity::Warning,
                IssueCategory::Technical,
                format!(
                    "Page {} was crawled but is not in any submitted sitemap.",
                    url
                ),
                serde_json::json!({
                    "url_id": id,
                    "url": url,
                    "recommendation": "Add important pages to your XML sitemap for faster discovery by search engines."
                }),
            ));
        }
    }

    // --- Sitemap URLs returning error status ---
    for (id, url, status_code) in &data.sitemap_error_pages {
        issues.push(issue_with(
            IssueType::SitemapUrlErrorStatus,
            IssueSeverity::Critical,
            IssueCategory::Technical,
            format!("Sitemap URL {} returned HTTP {}.", url, status_code),
            serde_json::json!({
                "url_id": id,
                "url": url,
                "status_code": status_code,
                "recommendation": "Fix the broken URL or remove it from your sitemap if no longer valid."
            }),
        ));
    }

    issues
}

// ─────────────────────────────────────────────────────────────────
// Cross-page detectors (existing, retained)
// ─────────────────────────────────────────────────────────────────

/// Detect duplicate titles across crawled pages.
fn detect_duplicate_titles(seo_data_map: &HashMap<String, SeoData>, issues: &mut Vec<SeoIssue>) {
    let mut title_map: HashMap<String, Vec<String>> = HashMap::new();

    for (url, seo) in seo_data_map {
        if let Some(title) = &seo.title {
            let normalized = title.trim().to_lowercase();
            if normalized.len() > 5 {
                title_map.entry(normalized).or_default().push(url.clone());
            }
        }
    }

    for (title, urls) in title_map {
        if urls.len() > 1 {
            issues.push(issue_with(
                IssueType::DuplicateTitle,
                IssueSeverity::Warning,
                IssueCategory::Content,
                format!("{} pages share the same title: \"{}\"", urls.len(), title),
                serde_json::json!({
                    "title": title,
                    "urls": urls,
                }),
            ));
        }
    }
}

/// Detect duplicate meta descriptions.
fn detect_duplicate_meta_descriptions(
    seo_data_map: &HashMap<String, SeoData>,
    issues: &mut Vec<SeoIssue>,
) {
    let mut desc_map: HashMap<String, Vec<String>> = HashMap::new();

    for (url, seo) in seo_data_map {
        if let Some(desc) = &seo.meta_description {
            let normalized = desc.trim().to_lowercase();
            if normalized.len() > 20 {
                desc_map.entry(normalized).or_default().push(url.clone());
            }
        }
    }

    for (desc, urls) in desc_map {
        if urls.len() > 1 {
            issues.push(issue_with(
                IssueType::DuplicateMetaDescription,
                IssueSeverity::Warning,
                IssueCategory::Content,
                format!("{} pages share the same meta description", urls.len()),
                serde_json::json!({
                    "description": desc.chars().take(100).collect::<String>(),
                    "urls": urls,
                }),
            ));
        }
    }
}

/// Detect pages with identical content (by hash).
fn detect_content_duplicates(seo_data_map: &HashMap<String, SeoData>, issues: &mut Vec<SeoIssue>) {
    let mut hash_map: HashMap<String, Vec<String>> = HashMap::new();

    for (url, seo) in seo_data_map {
        if let Some(hash) = &seo.content_hash {
            hash_map.entry(hash.clone()).or_default().push(url.clone());
        }
    }

    for (hash, urls) in hash_map {
        if urls.len() > 1 {
            let hash_preview = if hash.len() >= 8 { &hash[..8] } else { &hash };
            issues.push(issue_with(
                IssueType::DuplicateContent,
                IssueSeverity::Critical,
                IssueCategory::Content,
                format!(
                    "{} pages have identical content (hash: {})",
                    urls.len(),
                    hash_preview
                ),
                serde_json::json!({
                    "content_hash": hash,
                    "urls": urls,
                }),
            ));
        }
    }
}

/// Detect redirect chains.
fn detect_redirect_chains(seo_data_map: &HashMap<String, SeoData>, issues: &mut Vec<SeoIssue>) {
    for (url, seo) in seo_data_map {
        if let Some(final_url) = &seo.final_url {
            if !final_url.is_empty() && final_url != url {
                issues.push(issue_with(
                    IssueType::RedirectChain,
                    IssueSeverity::Warning,
                    IssueCategory::Links,
                    format!("URL redirects to {}", final_url),
                    serde_json::json!({
                        "original_url": url,
                        "final_url": final_url,
                    }),
                ));
            }
        }
    }
}

/// Detect canonical URL clusters (multiple URLs pointing to same canonical).
fn detect_canonical_clusters(seo_data_map: &HashMap<String, SeoData>, issues: &mut Vec<SeoIssue>) {
    let mut canonical_map: HashMap<String, Vec<String>> = HashMap::new();

    for (url, seo) in seo_data_map {
        if let Some(canonical) = &seo.canonical_url {
            if !canonical.is_empty() {
                canonical_map
                    .entry(canonical.clone())
                    .or_default()
                    .push(url.clone());
            }
        }
    }

    for (canonical, urls) in canonical_map {
        if urls.len() > 2 {
            issues.push(issue_with(
                IssueType::CanonicalCluster,
                IssueSeverity::Warning,
                IssueCategory::Technical,
                format!("{} URLs point to the same canonical URL", urls.len()),
                serde_json::json!({
                    "canonical": canonical,
                    "urls": urls,
                }),
            ));
        }
    }
}

// ─────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_seo_data() -> SeoData {
        SeoData {
            title: Some("Test Page".to_string()),
            meta_description: Some("A test page description.".to_string()),
            canonical_url: None,
            robots_meta: None,
            noindex: false,
            nofollow: false,
            http_status: Some(200),
            response_time_ms: Some(150.0),
            word_count: Some(500),
            has_h1: true,
            h1_count: 1,
            h1_text: Some("Test Heading".to_string()),
            headings_h2: vec!["Sub heading".to_string()],
            headings_h3: vec![],
            headings_h4: vec![],
            headings_h5: vec![],
            headings_h6: vec![],
            image_count: 3,
            images_without_alt: 0,
            images_with_alt: 3,
            images_missing_dimensions: 0,
            images_missing_lazy_loading: 0,
            total_image_size_kb: 150.0,
            social_meta_open_graph: serde_json::Value::Null,
            social_meta_twitter_card: serde_json::Value::Null,
            structured_data_json: vec![],
            has_schema_org: false,
            hreflang_alternates: vec![],
            amp_html_url: None,
            is_amp: false,
            self_referencing_canonical: false,
            redirect_chain: vec![],
            final_url: None,
            js_rendered_html: None,
            carbon_footprint_grams: None,
            anchor_text_distribution: serde_json::Value::Null,
            internal_link_count: 10,
            external_link_count: 2,
            broken_links: 0,
            pagination_next: None,
            pagination_prev: None,
            is_paged: false,
            content_hash: None,
            extractable_text: None,
            extraction_results: vec![],
            keyword_density: serde_json::Value::Null,
        }
    }

    fn make_fetch_result(headers: &[(&str, &str)], html: Option<&str>) -> FetchResult {
        FetchResult {
            status_code: 200,
            final_url: "https://example.com/".to_string(),
            requested_url: "https://example.com/".to_string(),
            headers: headers
                .iter()
                .map(|(name, value)| (name.to_ascii_lowercase(), value.to_string()))
                .collect(),
            content_type: Some("text/html".to_string()),
            content_length: html.map(str::len),
            response_time_ms: 150.0,
            is_redirect: false,
            redirect_count: 0,
            was_js_rendered: false,
            html_content: html.map(str::to_string),
            error_message: None,
        }
    }

    #[test]
    fn test_canonical_issues_missing() {
        let seo = make_seo_data();
        let mut issues = Vec::new();
        detect_canonical_issues("https://example.com/page", &seo, &mut issues);
        assert!(issues.iter().any(|i| i.issue_type == "no_canonical_tag"));
    }

    #[test]
    fn test_canonical_issues_external() {
        let mut seo = make_seo_data();
        seo.canonical_url = Some("https://other-site.com/page".to_string());
        let mut issues = Vec::new();
        detect_canonical_issues("https://example.com/page", &seo, &mut issues);
        assert!(issues.iter().any(|i| i.issue_type == "external_canonical"));
    }

    #[test]
    fn test_canonical_issues_mismatch() {
        let mut seo = make_seo_data();
        seo.canonical_url = Some("https://example.com/other-page".to_string());
        let mut issues = Vec::new();
        detect_canonical_issues("https://example.com/page", &seo, &mut issues);
        assert!(issues.iter().any(|i| i.issue_type == "canonicalized_url"));
    }

    #[test]
    fn test_content_issues_missing_title() {
        let mut seo = make_seo_data();
        seo.title = None;
        let mut issues = Vec::new();
        detect_content_issues("https://example.com", &seo, &mut issues);
        assert!(issues.iter().any(|i| i.issue_type == "missing_title"));
    }

    #[test]
    fn test_content_issues_title_too_long() {
        let mut seo = make_seo_data();
        seo.title = Some("A".repeat(70));
        let mut issues = Vec::new();
        detect_content_issues("https://example.com", &seo, &mut issues);
        assert!(issues.iter().any(|i| i.issue_type == "title_too_long"));
    }

    #[test]
    fn test_content_issues_noindex() {
        let mut seo = make_seo_data();
        seo.noindex = true;
        let mut issues = Vec::new();
        detect_content_issues("https://example.com", &seo, &mut issues);
        assert!(issues
            .iter()
            .any(|i| i.issue_type == "important_page_noindex"));
    }

    #[test]
    fn test_hreflang_issues_duplicate_lang() {
        let mut seo = make_seo_data();
        seo.hreflang_alternates = vec!["en".to_string(), "en".to_string()];
        let mut issues = Vec::new();
        detect_hreflang_issues("https://example.com", &seo, &mut issues);
        assert!(issues
            .iter()
            .any(|i| i.issue_type == "hreflang_duplicate_lang"));
    }

    #[test]
    fn test_amp_issues_missing_canonical_and_invalid_target() {
        let mut seo = make_seo_data();
        seo.is_amp = true;
        seo.amp_html_url = Some("https://example.com/amp".to_string());
        let mut issues = Vec::new();

        detect_amp_issues("https://example.com/amp", &seo, &mut issues);

        assert!(issues
            .iter()
            .any(|i| i.issue_type == "amp_missing_canonical"));
        assert!(issues.iter().any(|i| i.issue_type == "amp_invalid_target"));
    }

    #[test]
    fn test_amp_cross_page_detects_non_amp_target() {
        let mut canonical = make_seo_data();
        canonical.amp_html_url = Some("https://example.com/page.amp.html".to_string());
        let amp_target = make_seo_data();
        let mut map = HashMap::new();
        map.insert("https://example.com/page".to_string(), canonical);
        map.insert("https://example.com/page.amp.html".to_string(), amp_target);
        let mut issues = Vec::new();

        detect_amp_cross_page_issues(&map, &mut issues);

        assert!(issues.iter().any(|i| i.issue_type == "amp_invalid_target"));
    }

    #[test]
    fn test_amp_cross_page_detects_canonical_mismatch() {
        let mut canonical = make_seo_data();
        canonical.amp_html_url = Some("https://example.com/page.amp.html".to_string());
        let mut amp_target = make_seo_data();
        amp_target.is_amp = true;
        amp_target.canonical_url = Some("https://example.com/other".to_string());
        let mut map = HashMap::new();
        map.insert("https://example.com/page".to_string(), canonical);
        map.insert("https://example.com/page.amp.html".to_string(), amp_target);
        let mut issues = Vec::new();

        detect_amp_cross_page_issues(&map, &mut issues);

        assert!(issues
            .iter()
            .any(|i| i.issue_type == "amp_canonical_mismatch"));
    }

    #[test]
    fn test_image_issues_missing_alt() {
        let mut seo = make_seo_data();
        seo.images_without_alt = 5;
        let mut issues = Vec::new();
        detect_image_issues("https://example.com", &seo, &mut issues);
        assert!(issues
            .iter()
            .any(|i| i.issue_type == "image_missing_alt_attribute"));
    }

    #[test]
    fn test_image_issues_missing_dimensions_and_oversized() {
        let mut seo = make_seo_data();
        seo.images_missing_dimensions = 2;
        seo.total_image_size_kb = 2048.0;
        let mut issues = Vec::new();

        detect_image_issues("https://example.com", &seo, &mut issues);

        assert!(issues
            .iter()
            .any(|i| i.issue_type == "image_missing_dimensions"));
        assert!(issues.iter().any(|i| i.issue_type == "image_oversized"));
    }

    #[test]
    fn test_image_issues_missing_lazy_loading() {
        let mut seo = make_seo_data();
        seo.images_missing_lazy_loading = 3;
        let mut issues = Vec::new();

        detect_image_issues("https://example.com", &seo, &mut issues);

        assert!(issues
            .iter()
            .any(|i| i.issue_type == "image_missing_lazy_loading"));
    }

    #[test]
    fn test_security_issues_missing_headers() {
        let seo = make_seo_data();
        let fetch = make_fetch_result(&[], Some("<html></html>"));
        let mut issues = Vec::new();

        detect_security_issues("https://example.com", &seo, Some(&fetch), &mut issues);

        assert!(issues
            .iter()
            .any(|i| i.issue_type == "missing_x_content_type_options"));
        assert!(issues
            .iter()
            .any(|i| i.issue_type == "missing_x_frame_options"));
        assert!(issues.iter().any(|i| i.issue_type == "missing_csp"));
        assert!(issues.iter().any(|i| i.issue_type == "missing_hsts"));
        assert!(issues
            .iter()
            .any(|i| i.issue_type == "missing_referrer_policy"));
    }

    #[test]
    fn test_security_issues_accepts_csp_frame_ancestors() {
        let seo = make_seo_data();
        let fetch = make_fetch_result(
            &[
                ("x-content-type-options", "nosniff"),
                (
                    "content-security-policy",
                    "default-src 'self'; frame-ancestors 'none'",
                ),
                ("strict-transport-security", "max-age=31536000"),
                ("referrer-policy", "strict-origin-when-cross-origin"),
            ],
            Some("<html></html>"),
        );
        let mut issues = Vec::new();

        detect_security_issues("https://example.com", &seo, Some(&fetch), &mut issues);

        assert!(issues.is_empty());
    }

    #[test]
    fn test_security_issues_detects_mixed_content() {
        let seo = make_seo_data();
        let fetch = make_fetch_result(
            &[
                ("x-content-type-options", "nosniff"),
                ("x-frame-options", "DENY"),
                ("content-security-policy", "default-src 'self'"),
                ("strict-transport-security", "max-age=31536000"),
                ("referrer-policy", "strict-origin-when-cross-origin"),
            ],
            Some("<html><img src=\"http://cdn.example.com/image.jpg\"></html>"),
        );
        let mut issues = Vec::new();

        detect_security_issues("https://example.com", &seo, Some(&fetch), &mut issues);

        assert!(issues.iter().any(|i| i.issue_type == "mixed_content"));
    }

    #[test]
    fn test_security_issues_detects_insecure_http() {
        let seo = make_seo_data();
        let fetch = make_fetch_result(
            &[
                ("x-content-type-options", "nosniff"),
                ("x-frame-options", "DENY"),
                ("content-security-policy", "default-src 'self'"),
                ("referrer-policy", "strict-origin-when-cross-origin"),
            ],
            Some("<html></html>"),
        );
        let mut issues = Vec::new();

        detect_security_issues("http://example.com", &seo, Some(&fetch), &mut issues);

        assert!(issues.iter().any(|i| i.issue_type == "insecure_http"));
    }

    #[test]
    fn test_social_issues_missing_og() {
        let seo = make_seo_data();
        let mut issues = Vec::new();
        detect_social_issues("https://example.com", &seo, &mut issues);
        assert!(issues.iter().any(|i| i.issue_type == "missing_og_tags"));
    }

    #[test]
    fn test_structured_data_issues() {
        let mut seo = make_seo_data();
        seo.structured_data_json =
            vec![serde_json::json!({"@type": "Article", "headline": "Test"})];
        let mut issues = Vec::new();
        detect_structured_data_issues("https://example.com", &seo, &mut issues);
        assert!(issues
            .iter()
            .any(|i| i.issue_type == "article_missing_author"));
    }

    #[test]
    fn test_heading_non_sequential() {
        let mut seo = make_seo_data();
        seo.h1_count = 1;
        seo.headings_h2 = vec![]; // no h2
        seo.headings_h3 = vec!["Sub-sub heading".to_string()]; // h3 without h2
        let mut issues = Vec::new();
        detect_non_sequential_headings("https://example.com", &seo, &mut issues);
        assert!(issues
            .iter()
            .any(|i| i.issue_type == "heading_non_sequential"));
    }

    #[test]
    fn test_duplicate_detection() {
        let mut map: HashMap<String, SeoData> = HashMap::new();
        let mut seo1 = make_seo_data();
        seo1.title = Some("Same Title".to_string());
        seo1.content_hash = Some("abc123".to_string());
        let mut seo2 = make_seo_data();
        seo2.title = Some("Same Title".to_string());
        seo2.content_hash = Some("abc123".to_string());

        map.insert("https://example.com/a".to_string(), seo1);
        map.insert("https://example.com/b".to_string(), seo2);

        let mut issues = Vec::new();
        detect_duplicate_titles(&map, &mut issues);
        assert!(issues.iter().any(|i| i.issue_type == "duplicate_title"));

        let mut issues2 = Vec::new();
        detect_content_duplicates(&map, &mut issues2);
        assert!(issues2.iter().any(|i| i.issue_type == "duplicate_content"));
    }

    #[test]
    fn test_pagination_issues() {
        let mut crawled = std::collections::HashSet::new();
        crawled.insert("https://example.com/page/1".to_string());
        crawled.insert("https://example.com/page/2".to_string());

        let data = PaginationData {
            crawled_urls: crawled,
            paginated_pages: vec![(
                1,
                "https://example.com/page/2".to_string(),
                Some("https://example.com/page/3".to_string()),
                Some("https://example.com/page/1".to_string()),
            )],
            paginated_without_canonical: vec![(2, "https://example.com/page/2".to_string())],
        };

        let issues = detect_pagination_issues(&data);
        assert!(issues
            .iter()
            .any(|i| i.issue_type == "broken_pagination_chain"));
        assert!(issues
            .iter()
            .any(|i| i.issue_type == "missing_pagination_canonical"));
    }

    #[test]
    fn test_link_graph_issues_orphan() {
        let data = LinkGraphData {
            orphaned_pages: vec![(42, "https://example.com/orphan".to_string())],
            start_url: Some("https://example.com/".to_string()),
            anchor_over_optimized: vec![],
            links_to_4xx: vec![],
        };

        let issues = detect_link_graph_issues(&data);
        assert!(issues.iter().any(|i| i.issue_type == "orphaned_page"));
    }

    #[test]
    fn test_sitemap_comparison_issues() {
        let mut sitemap_urls = std::collections::HashSet::new();
        sitemap_urls.insert("https://example.com/exists".to_string());
        sitemap_urls.insert("https://example.com/missing".to_string());

        let data = SitemapComparisonData {
            sitemap_urls,
            crawled_urls: vec![(1, "https://example.com/exists".to_string())],
            indexable_pages: vec![(1, "https://example.com/exists".to_string())],
            sitemap_error_pages: vec![(2, "https://example.com/missing".to_string(), 404)],
        };

        let issues = detect_sitemap_comparison_issues(&data);
        assert!(issues
            .iter()
            .any(|i| i.issue_type == "sitemap_url_not_crawled"));
    }
}
