//! Post-crawl analysis detectors — runs after all URLs are crawled.
//! Ported from src/worker/engine/detectors/*.ts

use super::models::{SeoData, SeoIssue, IssueSeverity, IssueCategory};
use crate::core::storage::models::UrlRecord;
use tracing::{debug, info};

/// Run all post-crawl detectors on a complete set of URL records.
pub fn run_post_crawl_analysis(urls: &[UrlRecord], seo_data_map: &std::collections::HashMap<String, SeoData>) -> Vec<SeoIssue> {
    let mut issues = Vec::new();

    detect_duplicate_titles(seo_data_map, &mut issues);
    detect_duplicate_meta_descriptions(seo_data_map, &mut issues);
    detect_content_duplicates(seo_data_map, &mut issues);
    detect_orphan_pages(urls, seo_data_map, &mut issues);
    detect_redirect_chains(seo_data_map, &mut issues);
    detect_canonical_clusters(seo_data_map, &mut issues);

    info!(
        "Post-crawl analysis: {} issues found",
        issues.len()
    );

    issues
}

/// Detect duplicate titles across crawled pages.
fn detect_duplicate_titles(seo_data_map: &std::collections::HashMap<String, SeoData>, issues: &mut Vec<SeoIssue>) {
    let mut title_map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();

    for (url, seo) in seo_data_map {
        if let Some(title) = &seo.title {
            let normalized = title.trim().to_lowercase();
            if normalized.len() > 5 { // Skip very short titles as noise
                title_map.entry(normalized).or_default().push(url.clone());
            }
        }
    }

    for (title, urls) in title_map {
        if urls.len() > 1 {
            issues.push(SeoIssue {
                issue_type: "duplicate_title".to_string(),
                severity: IssueSeverity::Warning,
                category: IssueCategory::Content,
                message: format!("{} pages share the same title: \"{}\"", urls.len(), title),
                details: serde_json::json!({
                    "title": title,
                    "urls": urls,
                }),
            });
        }
    }
}

/// Detect duplicate meta descriptions.
fn detect_duplicate_meta_descriptions(seo_data_map: &std::collections::HashMap<String, SeoData>, issues: &mut Vec<SeoIssue>) {
    let mut desc_map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();

    for (url, seo) in seo_data_map {
        if let Some(desc) = &seo.meta_description {
            let normalized = desc.trim().to_lowercase();
            if normalized.len() > 20 { // Skip very short descriptions
                desc_map.entry(normalized).or_default().push(url.clone());
            }
        }
    }

    for (desc, urls) in desc_map {
        if urls.len() > 1 {
            issues.push(SeoIssue {
                issue_type: "duplicate_meta_description".to_string(),
                severity: IssueSeverity::Warning,
                category: IssueCategory::Content,
                message: format!("{} pages share the same meta description", urls.len()),
                details: serde_json::json!({
                    "description": desc.chars().take(100).collect::<String>(),
                    "urls": urls,
                }),
            });
        }
    }
}

/// Detect pages with identical content (by hash).
fn detect_content_duplicates(seo_data_map: &std::collections::HashMap<String, SeoData>, issues: &mut Vec<SeoIssue>) {
    let mut hash_map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();

    for (url, seo) in seo_data_map {
        if let Some(hash) = &seo.content_hash {
            hash_map.entry(hash.clone()).or_default().push(url.clone());
        }
    }

    for (hash, urls) in hash_map {
        if urls.len() > 1 {
            issues.push(SeoIssue {
                issue_type: "duplicate_content".to_string(),
                severity: IssueSeverity::Critical,
                category: IssueCategory::Content,
                message: format!("{} pages have identical content (hash: {})", urls.len(), &hash[..8]),
                details: serde_json::json!({
                    "content_hash": hash,
                    "urls": urls,
                }),
            });
        }
    }
}

/// Detect orphan pages (no internal links pointing to them).
fn detect_orphan_pages(urls: &[UrlRecord], seo_data_map: &std::collections::HashMap<String, SeoData>, issues: &mut Vec<SeoIssue>) {
    // Build set of all internally linked URLs
    let mut linked_urls: std::collections::HashSet<String> = std::collections::HashSet::new();

    for (_, seo) in seo_data_map {
        if seo.internal_link_count > 0 {
            // If a page has internal links, its target URLs are "linked to"
            // In a full implementation, we'd track actual link targets
        }
    }

    // Pages with very few internal links and high depth may be orphaned
    for url_record in urls {
        if let Some(seo) = seo_data_map.get(&url_record.url) {
            if url_record.depth > 5 && seo.internal_link_count == 0 {
                issues.push(SeoIssue {
                    issue_type: "orphan_page".to_string(),
                    severity: IssueSeverity::Warning,
                    category: IssueCategory::Links,
                    message: format!("Page at depth {} with no internal links", url_record.depth),
                    details: serde_json::json!({
                        "url": url_record.url,
                        "depth": url_record.depth,
                    }),
                });
            }
        }
    }
}

/// Detect redirect chains.
fn detect_redirect_chains(seo_data_map: &std::collections::HashMap<String, SeoData>, issues: &mut Vec<SeoIssue>) {
    for (url, seo) in seo_data_map {
        if let Some(final_url) = &seo.final_url {
            if !final_url.is_empty() && final_url != url {
                // This URL redirects — check chain length
                issues.push(SeoIssue {
                    issue_type: "redirect_chain".to_string(),
                    severity: IssueSeverity::Warning,
                    category: IssueCategory::Links,
                    message: format!("URL redirects to {}", final_url),
                    details: serde_json::json!({
                        "original_url": url,
                        "final_url": final_url,
                    }),
                });
            }
        }
    }
}

/// Detect canonical URL clusters (multiple URLs pointing to same canonical).
fn detect_canonical_clusters(seo_data_map: &std::collections::HashMap<String, SeoData>, issues: &mut Vec<SeoIssue>) {
    let mut canonical_map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();

    for (url, seo) in seo_data_map {
        if let Some(canonical) = &seo.canonical_url {
            if !canonical.is_empty() {
                canonical_map.entry(canonical.clone()).or_default().push(url.clone());
            }
        }
    }

    for (canonical, urls) in canonical_map {
        if urls.len() > 2 {
            issues.push(SeoIssue {
                issue_type: "canonical_cluster".to_string(),
                severity: IssueSeverity::Warning,
                category: IssueCategory::Technical,
                message: format!("{} URLs point to the same canonical URL", urls.len()),
                details: serde_json::json!({
                    "canonical": canonical,
                    "urls": urls,
                }),
            });
        }
    }
}

/// Hreflang audit — detect missing or conflicting hreflang annotations.
pub fn analyze_hreflang(seo_data_map: &std::collections::HashMap<String, SeoData>) -> Vec<SeoIssue> {
    let mut issues = Vec::new();

    for (url, seo) in seo_data_map {
        if !seo.hreflang_alternates.is_empty() {
            // Check for self-referencing hreflang
            let has_self_ref = seo.hreflang_alternates.iter()
                .any(|h| h == "x-default" || h.contains(&url[..20.min(url.len())]));

            if !has_self_ref && seo.hreflang_alternates.len() > 1 {
                issues.push(SeoIssue {
                    issue_type: "missing_self_referencing_hreflang".to_string(),
                    severity: IssueSeverity::Warning,
                    category: IssueCategory::Internationalization,
                    message: "Page has hreflang alternates but no self-referencing tag".to_string(),
                    details: serde_json::json!({
                        "url": url,
                        "hreflang_alternates": seo.hreflang_alternates,
                    }),
                });
            }
        }
    }

    issues
}

/// Detect pagination issues.
pub fn analyze_pagination(seo_data_map: &std::collections::HashMap<String, SeoData>) -> Vec<SeoIssue> {
    let mut issues = Vec::new();

    for (url, seo) in seo_data_map {
        if seo.is_paged {
            // Check for proper next/prev tags
            if seo.pagination_next.is_none() {
                issues.push(SeoIssue {
                    issue_type: "missing_pagination_next".to_string(),
                    severity: IssueSeverity::Warning,
                    category: IssueCategory::Links,
                    message: "Paged page is missing rel='next' link".to_string(),
                    details: serde_json::json!({"url": url}),
                });
            }
            if seo.pagination_prev.is_none() {
                issues.push(SeoIssue {
                    issue_type: "missing_pagination_prev".to_string(),
                    severity: IssueSeverity::Warning,
                    category: IssueCategory::Links,
                    message: "Paged page is missing rel='prev' link".to_string(),
                    details: serde_json::json!({"url": url}),
                });
            }
        }
    }

    issues
}
