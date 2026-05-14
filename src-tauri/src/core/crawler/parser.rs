//! HTML parser and SEO data extractor — extracts links, meta tags, structured data from HTML.

use super::models::{ExtractedLink, LinkType, SeoData};
use super::normalizer::{are_same_url, extract_hostname, resolve_url};
use crate::core::crawler::sitemap;
use scraper::{Html, Selector};
use sha2::{Digest, Sha256};
use tracing::debug;

/// Parse HTML and extract SEO data.
pub fn parse_html(base_url: &str, html: &str) -> SeoData {
    let document = Html::parse_document(html);
    let mut seo_data = SeoData::default();

    // Extract title
    if let Some(title_el) = document
        .select(&Selector::parse("head > title").unwrap())
        .next()
    {
        if let Some(text) = title_el.text().collect::<String>().strip_suffix("\n") {
            seo_data.title = Some(text.trim().to_string());
        }
    }

    // Extract meta description
    if let Some(meta_el) = document
        .select(&Selector::parse("meta[name='description']").unwrap())
        .next()
    {
        seo_data.meta_description = meta_el.value().attr("content").map(String::from);
    }

    // Extract canonical URL
    if let Some(canonical_el) = document
        .select(&Selector::parse("link[rel='canonical']").unwrap())
        .next()
    {
        if let Some(href) = canonical_el.value().attr("href") {
            seo_data.canonical_url = resolve_url(base_url, href);
            // Check self-referencing
            let canonical_resolved = seo_data.canonical_url.clone();
            seo_data.self_referencing_canonical = canonical_resolved
                .map(|c| are_same_url(&c, base_url))
                .unwrap_or(false);
        }
    }

    // Extract robots meta
    if let Some(robots_el) = document
        .select(&Selector::parse("meta[name='robots']").unwrap())
        .next()
    {
        if let Some(content) = robots_el.value().attr("content") {
            seo_data.robots_meta = Some(content.to_string());
            seo_data.noindex = content.to_lowercase().contains("noindex");
            seo_data.nofollow = content.to_lowercase().contains("nofollow");
        }
    }

    // Extract headings (H1-H6)
    for (level, _) in [('h', 1), ('h', 2), ('h', 3), ('h', 4), ('h', 5), ('h', 6)] {
        let selector_str = format!("h{}", level);
        let selector = Selector::parse(&selector_str).unwrap();
        let headings: Vec<String> = document
            .select(&selector)
            .filter_map(|el| {
                let text = el.text().collect::<String>().trim().to_string();
                if text.is_empty() {
                    None
                } else {
                    Some(text)
                }
            })
            .collect();

        match level {
            '1' => {
                seo_data.h1_count = headings.len() as i32;
                seo_data.has_h1 = !headings.is_empty();
                if let Some(first) = headings.first() {
                    seo_data.h1_text = Some(first.clone());
                }
            }
            '2' => seo_data.headings_h2 = headings,
            '3' => seo_data.headings_h3 = headings,
            '4' => seo_data.headings_h4 = headings,
            '5' => seo_data.headings_h5 = headings,
            '6' => seo_data.headings_h6 = headings,
            _ => {}
        }
    }

    let image_selector = Selector::parse("img").unwrap();
    let script_selector = Selector::parse("script[src]").unwrap();
    let link_css_selector = Selector::parse("link[rel='stylesheet'][href]").unwrap();
    let iframe_selector = Selector::parse("iframe[src]").unwrap();

    let html_links = extract_html_links(base_url, html);
    let internal_link_count = html_links.iter().filter(|link| link.is_internal).count();
    let mut external_link_count = html_links.len().saturating_sub(internal_link_count);

    // Collect images
    let mut image_count = 0i32;
    let mut images_without_alt = 0i32;
    let mut images_with_alt = 0i32;
    let mut images_missing_dimensions = 0i32;

    for el in document.select(&image_selector) {
        image_count += 1;
        let value = el.value();
        let has_alt = el
            .value()
            .attr("alt")
            .map(|a| !a.is_empty())
            .unwrap_or(false);
        if has_alt {
            images_with_alt += 1;
        } else {
            images_without_alt += 1;
        }
        if value.attr("width").is_none() || value.attr("height").is_none() {
            images_missing_dimensions += 1;
        }
    }

    seo_data.image_count = image_count;
    seo_data.images_without_alt = images_without_alt;
    seo_data.images_with_alt = images_with_alt;
    seo_data.images_missing_dimensions = images_missing_dimensions;

    // Count scripts and CSS (not tracked as links for SEO, but for size estimation)
    let script_count = document.select(&script_selector).count() as i32;
    let css_count = document.select(&link_css_selector).count() as i32;

    // Collect iframe URLs
    for el in document.select(&iframe_selector) {
        if let Some(src) = el.value().attr("src") {
            let resolved = resolve_url(base_url, src);
            if resolved.is_some() {
                external_link_count += 1;
            }
        }
    }

    // Update counts
    seo_data.internal_link_count = internal_link_count as i32 + script_count;
    seo_data.external_link_count = external_link_count as i32 + css_count;

    // Extract social meta (Open Graph)
    for el in document.select(&Selector::parse("meta[property^='og:']").unwrap()) {
        if let Some(property) = el.value().attr("property") {
            if let Some(content) = el.value().attr("content") {
                let og_key = property.strip_prefix("og:").unwrap_or(property);
                if let Some(obj) = seo_data.social_meta_open_graph.as_object_mut() {
                    obj.insert(
                        og_key.to_string(),
                        serde_json::Value::String(content.to_string()),
                    );
                } else {
                    let mut obj = serde_json::Map::new();
                    obj.insert(
                        og_key.to_string(),
                        serde_json::Value::String(content.to_string()),
                    );
                    seo_data.social_meta_open_graph = serde_json::Value::Object(obj);
                }
            }
        }
    }

    // Extract Twitter card meta
    for el in document.select(&Selector::parse("meta[name^='twitter:']").unwrap()) {
        if let Some(property) = el.value().attr("name") {
            if let Some(content) = el.value().attr("content") {
                let tw_key = property.strip_prefix("twitter:").unwrap_or(property);
                if let Some(obj) = seo_data.social_meta_twitter_card.as_object_mut() {
                    obj.insert(
                        tw_key.to_string(),
                        serde_json::Value::String(content.to_string()),
                    );
                } else {
                    let mut obj = serde_json::Map::new();
                    obj.insert(
                        tw_key.to_string(),
                        serde_json::Value::String(content.to_string()),
                    );
                    seo_data.social_meta_twitter_card = serde_json::Value::Object(obj);
                }
            }
        }
    }

    // Extract structured data (JSON-LD)
    for el in document.select(&Selector::parse("script[type='application/ld+json']").unwrap()) {
        let json_str = el.text().collect::<String>().trim().to_string();
        if !json_str.is_empty() {
            if let Ok(value) = serde_json::from_str(&json_str) {
                seo_data.structured_data_json.push(value);
                seo_data.has_schema_org = true;
            }
        }
    }

    // Extract hreflang links
    for el in document.select(&Selector::parse("link[rel='alternate'][hreflang]").unwrap()) {
        if let Some(hreflang) = el.value().attr("hreflang") {
            seo_data.hreflang_alternates.push(hreflang.to_string());
        }
    }

    // Extract AMP relationship signals.
    seo_data.is_amp = document
        .select(&Selector::parse("html[amp]").unwrap())
        .next()
        .is_some();
    for el in document.select(&Selector::parse("link[rel~='amphtml'][href]").unwrap()) {
        if let Some(href) = el.value().attr("href") {
            seo_data.amp_html_url = resolve_url(base_url, href);
            break;
        }
    }

    // Extract pagination (next/prev)
    for el in document.select(&Selector::parse("link[rel='next']").unwrap()) {
        if let Some(href) = el.value().attr("href") {
            seo_data.pagination_next = resolve_url(base_url, href);
        }
    }
    for el in document.select(&Selector::parse("link[rel='prev']").unwrap()) {
        if let Some(href) = el.value().attr("href") {
            seo_data.pagination_prev = resolve_url(base_url, href);
        }
    }

    // Word count (extract all text from body)
    if let Some(body_el) = document.select(&Selector::parse("body").unwrap()).next() {
        let text: String = body_el.text().collect();
        seo_data.word_count = Some(text.split_whitespace().count() as i32);
        seo_data.extractable_text = Some(text.clone());

        // Content hash (SHA-256 of normalized text)
        let mut hasher = Sha256::new();
        hasher.update(text.as_bytes());
        seo_data.content_hash = Some(format!("{:x}", hasher.finalize()));
    }

    debug!(
        "Parsed SEO data: title={}, h1={}, links={}, images={}, word_count={}",
        seo_data.title.as_deref().unwrap_or("(none)"),
        seo_data.h1_count,
        internal_link_count + external_link_count,
        image_count,
        seo_data.word_count.unwrap_or(0),
    );

    seo_data
}

/// Extract crawlable HTML links from <a href> tags.
pub fn extract_html_links(base_url: &str, html: &str) -> Vec<ExtractedLink> {
    let document = Html::parse_document(html);
    let html_a_selector = Selector::parse("a[href]").unwrap();
    let source_host = extract_hostname(base_url);

    document
        .select(&html_a_selector)
        .filter_map(|el| {
            let href = el.value().attr("href")?;
            let target_url = resolve_url(base_url, href)?;
            let target_host = extract_hostname(&target_url);
            let anchor_text = el.text().collect::<String>().trim().to_string();
            let rel = el.value().attr("rel").map(String::from);
            let is_no_follow = rel
                .as_deref()
                .map(|r| {
                    r.split_whitespace()
                        .any(|p| p.eq_ignore_ascii_case("nofollow"))
                })
                .unwrap_or(false);

            Some(ExtractedLink {
                href: target_url,
                anchor_text: if anchor_text.is_empty() {
                    None
                } else if anchor_text.len() > 100 {
                    Some(anchor_text[..100].to_string())
                } else {
                    Some(anchor_text)
                },
                rel,
                is_internal: source_host.as_deref() == target_host.as_deref(),
                is_no_follow,
                link_type: LinkType::HtmlA,
            })
        })
        .collect()
}

/// Extract sitemap URLs from HTML (e.g., <a> tags pointing to sitemaps).
pub fn extract_sitemap_urls(html: &str) -> Vec<String> {
    let document = Html::parse_document(html);
    let selector = Selector::parse("a[href]").unwrap();

    document
        .select(&selector)
        .filter_map(|el| el.value().attr("href").map(String::from))
        .filter(|url| url.to_lowercase().contains("sitemap"))
        .collect()
}

/// Extract inline sitemap URLs from a sitemap index XML.
pub fn parse_sitemap_index(content: &str) -> Result<Vec<String>, String> {
    let urls = sitemap::parse_sitemap(content)?;
    Ok(urls.into_iter().map(|u| u.loc).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_html_counts_images_missing_dimensions() {
        let seo = parse_html(
            "https://example.com/",
            r#"
            <html>
              <body>
                <img src="/a.jpg" alt="A" width="100" height="100">
                <img src="/b.jpg" alt="B" width="100">
                <img src="/c.jpg">
              </body>
            </html>
            "#,
        );

        assert_eq!(seo.image_count, 3);
        assert_eq!(seo.images_missing_dimensions, 2);
        assert_eq!(seo.images_without_alt, 1);
    }

    #[test]
    fn parse_html_extracts_amp_relationships() {
        let canonical = parse_html(
            "https://example.com/page",
            r#"
            <html>
              <head>
                <link rel="amphtml" href="/page.amp.html">
              </head>
            </html>
            "#,
        );
        assert!(!canonical.is_amp);
        assert_eq!(
            canonical.amp_html_url.as_deref(),
            Some("https://example.com/page.amp.html")
        );

        let amp = parse_html(
            "https://example.com/page.amp.html",
            r#"
            <html amp>
              <head>
                <link rel="canonical" href="/page">
              </head>
            </html>
            "#,
        );
        assert!(amp.is_amp);
        assert_eq!(
            amp.canonical_url.as_deref(),
            Some("https://example.com/page")
        );
    }
}
