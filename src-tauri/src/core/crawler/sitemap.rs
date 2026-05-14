//! Sitemap parsing per PRD §8.6.

use tracing::{debug, warn};
use xml::reader::{EventReader, XmlEvent};

/// Parsed sitemap URL entry.
#[derive(Debug, Clone)]
pub struct SitemapUrl {
    pub loc: String,
    pub last_modified: Option<String>,
    pub priority: Option<f32>,
    pub changefreq: Option<String>,
}

/// Parse XML sitemap content and extract URLs.
pub fn parse_sitemap(content: &str) -> Result<Vec<SitemapUrl>, String> {
    debug!("Parsing sitemap");

    let parser = EventReader::new(content.as_bytes());
    let mut urls = Vec::new();
    let mut current_url = None;
    let mut in_loc = false;
    let mut in_lastmod = false;
    let mut in_priority = false;
    let mut in_changefreq = false;
    let mut text_buffer = String::new();

    for event in parser {
        match event {
            Ok(XmlEvent::StartElement { name, .. }) => match name.local_name.as_ref() {
                "url" => {
                    current_url = Some(SitemapUrl {
                        loc: String::new(),
                        last_modified: None,
                        priority: None,
                        changefreq: None,
                    })
                }
                "loc" => in_loc = true,
                "lastmod" => in_lastmod = true,
                "priority" => in_priority = true,
                "changefreq" => in_changefreq = true,
                _ => {}
            },
            Ok(XmlEvent::Characters(text)) => {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    text_buffer.push_str(trimmed);
                }
            }
            Ok(XmlEvent::EndElement { name }) => match name.local_name.as_ref() {
                "url" => {
                    if let Some(url) = current_url.take() {
                        urls.push(url);
                    }
                }
                "loc" => {
                    if in_loc {
                        if let Some(url) = &mut current_url {
                            url.loc = text_buffer.clone();
                        }
                    }
                    in_loc = false;
                    text_buffer.clear();
                }
                "lastmod" => {
                    if in_lastmod {
                        if let Some(url) = &mut current_url {
                            url.last_modified = Some(text_buffer.clone());
                        }
                    }
                    in_lastmod = false;
                    text_buffer.clear();
                }
                "priority" => {
                    if in_priority {
                        if let Some(url) = &mut current_url {
                            url.priority = text_buffer.parse().ok();
                        }
                    }
                    in_priority = false;
                    text_buffer.clear();
                }
                "changefreq" => {
                    if in_changefreq {
                        if let Some(url) = &mut current_url {
                            url.changefreq = Some(text_buffer.clone());
                        }
                    }
                    in_changefreq = false;
                    text_buffer.clear();
                }
                _ => {}
            },
            Err(e) => {
                warn!("XML parse error: {}", e);
            }
            _ => {}
        }
    }

    debug!("Parsed {} URLs from sitemap", urls.len());
    Ok(urls)
}

/// Parse a sitemap index and extract child sitemap URLs.
pub fn parse_sitemap_index(content: &str) -> Result<Vec<String>, String> {
    debug!("Parsing sitemap index");

    let parser = EventReader::new(content.as_bytes());
    let mut urls = Vec::new();
    let mut in_sitemap = false;
    let mut in_loc = false;
    let mut text_buffer = String::new();

    for event in parser {
        match event {
            Ok(XmlEvent::StartElement { name, .. }) => match name.local_name.as_ref() {
                "sitemap" => in_sitemap = true,
                "loc" if in_sitemap => in_loc = true,
                _ => {}
            },
            Ok(XmlEvent::Characters(text)) => {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    text_buffer.push_str(trimmed);
                }
            }
            Ok(XmlEvent::EndElement { name }) => match name.local_name.as_ref() {
                "loc" => {
                    if in_loc && !text_buffer.is_empty() {
                        urls.push(text_buffer.clone());
                    }
                    in_loc = false;
                    text_buffer.clear();
                }
                "sitemap" => in_sitemap = false,
                _ => {}
            },
            Err(e) => {
                warn!("XML parse error: {}", e);
            }
            _ => {}
        }
    }

    debug!(
        "Parsed {} child sitemap URLs from sitemap index",
        urls.len()
    );
    Ok(urls)
}

/// Parse HTML sitemap links.
pub fn parse_html_sitemap(html: &str) -> Vec<String> {
    use scraper::{Html, Selector};

    let document = Html::parse_document(html);
    let selector = Selector::parse("a[href]").unwrap();

    document
        .select(&selector)
        .filter_map(|el| el.value().attr("href").map(String::from))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_sitemap_index_extracts_child_sitemaps() {
        let urls = parse_sitemap_index(
            r#"
            <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
              <sitemap><loc>https://example.com/sitemap-posts.xml</loc></sitemap>
            </sitemapindex>
            "#,
        )
        .unwrap();

        assert_eq!(
            urls,
            vec![
                "https://example.com/sitemap-pages.xml".to_string(),
                "https://example.com/sitemap-posts.xml".to_string()
            ]
        );
    }
}
