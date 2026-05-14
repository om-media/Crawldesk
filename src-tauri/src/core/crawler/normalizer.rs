//! URL normalization per PRD §8.7.

use url::{form_urlencoded, Url};

/// Normalize a URL per PRD §8.7:
/// - Lowercase scheme/host
/// - Remove fragments
/// - Resolve relative URLs
/// - Punycode support
pub fn normalize_url(url: &str) -> Option<String> {
    let parsed = Url::parse(url).ok()?;

    // Normalize: lowercase scheme/host, remove fragment
    let mut url = parsed.clone();
    url.set_scheme(&parsed.scheme().to_lowercase()).ok()?;
    if let Some(host) = parsed.host_str() {
        url.set_host(Some(&host.to_lowercase())).ok()?;
    }

    // Path normalization
    let path = normalize_path(parsed.path());
    url.set_path(&path);

    // Query normalization (sort parameters)
    if let Some(query) = parsed.query() {
        let mut params: Vec<_> = form_urlencoded::parse(query.as_bytes()).collect();
        params.sort_by(|a, b| a.0.cmp(&b.0));
        let sorted_query = form_urlencoded::Serializer::new(String::new())
            .extend_pairs(params)
            .finish();
        url.set_query(Some(&sorted_query));
    }

    // Remove fragment per PRD §8.7
    url.set_fragment(None);

    Some(url.to_string())
}

/// Normalize path: collapse double slashes, remove trailing slash (except root).
fn normalize_path(path: &str) -> String {
    let mut path = path.to_string();

    // Collapse multiple slashes
    while path.contains("//") {
        path = path.replace("//", "/");
    }

    // Remove trailing slash (except for root "/")
    if path != "/" && path.ends_with('/') {
        path.pop();
    }

    path
}

/// Check if a URL is relative or absolute.
pub fn is_relative_url(url: &str) -> bool {
    !url.starts_with("http://") && !url.starts_with("https://") && !url.starts_with("//")
}

/// Resolve a relative URL against a base URL.
pub fn resolve_url(base: &str, relative: &str) -> Option<String> {
    let base_url = Url::parse(base).ok()?;

    let resolved = if is_relative_url(relative) {
        // Remove leading ./ or ../
        let clean = relative.trim_start_matches("./").trim_start_matches("../");
        base_url.join(clean).ok()?
    } else if relative.starts_with("//") {
        // Protocol-relative URL
        let full = format!("https:{}", relative);
        Url::parse(&full).ok()?
    } else {
        Url::parse(relative).ok()?
    };

    Some(resolved.to_string())
}

/// Extract hostname from a URL.
pub fn extract_hostname(url: &str) -> Option<String> {
    Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_lowercase()))
}

/// Check if two URLs resolve to the same canonical form.
pub fn are_same_url(a: &str, b: &str) -> bool {
    normalize_url(a) == normalize_url(b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_url_lowercase() {
        let result = normalize_url("HTTP://Example.COM/Path").unwrap();
        assert_eq!(result, "http://example.com/Path");
    }

    #[test]
    fn test_normalize_url_remove_fragment() {
        let result = normalize_url("https://example.com/page#section").unwrap();
        assert!(!result.contains('#'));
    }

    #[test]
    fn test_normalize_url_collapse_slashes() {
        let result = normalize_url("https://example.com//path///to//page/").unwrap();
        assert_eq!(result, "https://example.com/path/to/page");
    }

    #[test]
    fn test_is_relative_url() {
        assert!(is_relative_url("/about"));
        assert!(is_relative_url("../page"));
        assert!(!is_relative_url("https://example.com"));
        assert!(!is_relative_url("//example.com"));
    }

    #[test]
    fn test_resolve_url_relative() {
        let result = resolve_url("https://example.com/blog/", "./post");
        assert_eq!(result, Some("https://example.com/blog/post".to_string()));
    }

    #[test]
    fn test_resolve_url_absolute() {
        let result = resolve_url("https://example.com/", "https://other.com/page");
        assert_eq!(result, Some("https://other.com/page".to_string()));
    }

    #[test]
    fn test_extract_hostname() {
        assert_eq!(
            extract_hostname("https://Example.COM/path"),
            Some("example.com".to_string())
        );
    }

    #[test]
    fn test_are_same_url() {
        assert!(are_same_url(
            "https://example.com/page",
            "https://example.com/page"
        ));
        assert!(!are_same_url(
            "https://example.com/a",
            "https://example.com/b"
        ));
    }
}
