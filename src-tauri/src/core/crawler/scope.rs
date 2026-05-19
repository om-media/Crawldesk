//! URL scope filtering per PRD §8.5 — hostname matching, include/exclude patterns, depth enforcement.

use regex::Regex;
use tracing::{debug, warn};
use url::Url;

#[derive(Clone)]
struct ScopePattern {
    regexes: Vec<Regex>,
}

impl ScopePattern {
    fn new(pattern: &str) -> Option<Self> {
        let trimmed = pattern.trim();
        if trimmed.is_empty() {
            return None;
        }

        let mut regexes = Vec::new();
        if let Ok(re) = Regex::new(trimmed) {
            regexes.push(re);
        }
        if let Ok(re) = Regex::new(&wildcard_to_regex(trimmed)) {
            let duplicate = regexes.iter().any(|existing| existing.as_str() == re.as_str());
            if !duplicate {
                regexes.push(re);
            }
        }

        if regexes.is_empty() {
            None
        } else {
            Some(Self { regexes })
        }
    }

    fn is_match(&self, values: &[&str]) -> bool {
        self.regexes
            .iter()
            .any(|re| values.iter().any(|value| re.is_match(value)))
    }
}

fn wildcard_to_regex(pattern: &str) -> String {
    let mut regex = String::from("^");
    let chars: Vec<char> = pattern.chars().collect();
    for (index, ch) in chars.iter().enumerate() {
        if *ch == '$' && index + 1 == chars.len() {
            continue;
        }
        match *ch {
            '*' => regex.push_str(".*"),
            '?' => regex.push('.'),
            _ => regex.push_str(&regex::escape(&ch.to_string())),
        }
    }
    regex.push('$');
    regex
}

/// URL scope service for filtering which URLs to crawl.
#[derive(Clone)]
pub struct ScopeService {
    root_hostname: String,
    root_scheme: String,
    allowed_hostnames: Vec<String>,
    blocked_hostnames: Vec<String>,
    include_patterns: Vec<ScopePattern>,
    exclude_patterns: Vec<ScopePattern>,
}

impl ScopeService {
    pub fn new(root_url: &str) -> Self {
        let parsed = Url::parse(root_url).expect("Invalid root URL");
        let hostname = parsed.host_str().unwrap_or("").to_lowercase();
        let mut allowed_hostnames = vec![hostname.clone()];
        if let Some(apex) = hostname.strip_prefix("www.") {
            allowed_hostnames.push(apex.to_string());
        } else {
            allowed_hostnames.push(format!("www.{}", hostname));
        }

        Self {
            root_hostname: hostname.clone(),
            root_scheme: parsed.scheme().to_string(),
            allowed_hostnames,
            blocked_hostnames: Vec::new(),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        }
    }

    /// Add allowed hostnames (subdomains).
    pub fn add_allowed_hostname(&mut self, hostname: &str) {
        let normalized = hostname.trim().to_lowercase();
        if !normalized.is_empty() && !self.allowed_hostnames.contains(&normalized) {
            self.allowed_hostnames.push(normalized);
        }
    }

    /// Add blocked hostnames.
    pub fn add_blocked_hostname(&mut self, hostname: &str) {
        let normalized = hostname.trim().to_lowercase();
        if !normalized.is_empty() && !self.blocked_hostnames.contains(&normalized) {
            self.blocked_hostnames.push(normalized);
        }
    }

    /// Add include pattern. Accepts regex and simple `*`/`?` wildcards.
    pub fn add_include_pattern(&mut self, pattern: &str) {
        if let Some(pattern) = ScopePattern::new(pattern) {
            self.include_patterns.push(pattern);
        } else {
            warn!("Invalid include pattern: {}", pattern);
        }
    }

    /// Add exclude pattern. Accepts regex and simple `*`/`?` wildcards.
    pub fn add_exclude_pattern(&mut self, pattern: &str) {
        if let Some(pattern) = ScopePattern::new(pattern) {
            self.exclude_patterns.push(pattern);
        } else {
            warn!("Invalid exclude pattern: {}", pattern);
        }
    }

    /// Check if a URL is within scope for crawling.
    pub fn is_in_scope(&self, url: &str) -> bool {
        let parsed = match Url::parse(url) {
            Ok(u) => u,
            Err(_) => {
                debug!("Invalid URL (not in scope): {}", url);
                return false;
            }
        };

        let hostname = parsed.host_str().unwrap_or("").to_lowercase();

        // Check blocked hostnames first
        if self
            .blocked_hostnames
            .iter()
            .any(|b| hostname == *b || hostname.ends_with(&format!(".{}", b)))
        {
            debug!("Blocked hostname: {}", url);
            return false;
        }

        if !self
            .allowed_hostnames
            .iter()
            .any(|a| hostname == *a || hostname.ends_with(&format!(".{}", a)))
        {
            debug!(
                "Hostname not in allowed list: {} (allowed: {:?})",
                hostname, self.allowed_hostnames
            );
            return false;
        }

        let full_path = format!(
            "{}{}",
            parsed.path(),
            parsed
                .query()
                .map(|q| format!("?{}", q))
                .unwrap_or_default()
        );
        let path = parsed.path();

        // Check include patterns (if any are specified, URL must match at least one)
        if !self.include_patterns.is_empty() {
            let values = [path, full_path.as_str(), url];
            if !self
                .include_patterns
                .iter()
                .any(|pattern| pattern.is_match(&values))
            {
                debug!("URL doesn't match any include pattern: {}", url);
                return false;
            }
        }

        // Check exclude patterns (if any match, URL is out of scope)
        let values = [path, full_path.as_str(), url];
        if self
            .exclude_patterns
            .iter()
            .any(|pattern| pattern.is_match(&values))
        {
            debug!("URL matches exclude pattern: {}", url);
            return false;
        }

        true
    }

    /// Check if a URL is on the same domain as the root.
    pub fn is_same_domain(&self, url: &str) -> bool {
        let hostname = Url::parse(url)
            .ok()
            .and_then(|u| u.host_str().map(|h| h.to_lowercase()))
            .unwrap_or_default();

        hostname == self.root_hostname || hostname.ends_with(&format!(".{}", self.root_hostname))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_scope() {
        let scope = ScopeService::new("https://example.com/");
        assert!(scope.is_in_scope("https://example.com/page"));
        assert!(!scope.is_in_scope("https://other.com/page"));
    }

    #[test]
    fn test_subdomain_scope() {
        let mut scope = ScopeService::new("https://www.example.com/");
        scope.add_allowed_hostname("blog.example.com");
        assert!(scope.is_in_scope("https://www.example.com/"));
        assert!(scope.is_in_scope("https://blog.example.com/post"));
        assert!(scope.is_in_scope("https://example.com/page"));
    }

    #[test]
    fn test_www_root_allows_apex_redirect_target() {
        let scope = ScopeService::new("https://www.example.com/");
        assert!(scope.is_in_scope("https://www.example.com/page"));
        assert!(scope.is_in_scope("https://example.com/page"));
    }

    #[test]
    fn test_exclude_pattern() {
        let mut scope = ScopeService::new("https://example.com/");
        scope.add_exclude_pattern(r"/admin/.*");
        scope.add_exclude_pattern(r"\.pdf$");
        assert!(scope.is_in_scope("https://example.com/page"));
        assert!(!scope.is_in_scope("https://example.com/admin/dashboard"));
        assert!(!scope.is_in_scope("https://example.com/file.pdf"));
    }

    #[test]
    fn test_include_pattern() {
        let mut scope = ScopeService::new("https://example.com/");
        scope.add_include_pattern(r"^/(blog|products)/.*");
        assert!(scope.is_in_scope("https://example.com/blog/post"));
        assert!(scope.is_in_scope("https://example.com/products/item"));
        assert!(!scope.is_in_scope("https://example.com/about"));
    }

    #[test]
    fn test_wildcard_include_pattern_matches_expected_path() {
        let mut scope = ScopeService::new("https://example.com/");
        scope.add_include_pattern("/blog/*");
        assert!(scope.is_in_scope("https://example.com/blog/post"));
        assert!(scope.is_in_scope("https://example.com/blog/category/news"));
        assert!(!scope.is_in_scope("https://example.com/products/item"));
    }

    #[test]
    fn test_wildcard_exclude_pattern_matches_query_and_extension() {
        let mut scope = ScopeService::new("https://example.com/");
        scope.add_exclude_pattern("*/tag/*");
        scope.add_exclude_pattern("*.pdf$");
        scope.add_exclude_pattern("*utm_source=*");
        assert!(scope.is_in_scope("https://example.com/blog/post"));
        assert!(!scope.is_in_scope("https://example.com/blog/tag/news"));
        assert!(!scope.is_in_scope("https://example.com/file.pdf"));
        assert!(!scope.is_in_scope("https://example.com/blog/post?utm_source=newsletter"));
    }

    #[test]
    fn test_blocked_hostname_overrides_allowed_hostname() {
        let mut scope = ScopeService::new("https://example.com/");
        scope.add_allowed_hostname("cdn.example.com");
        scope.add_blocked_hostname("cdn.example.com");
        assert!(!scope.is_in_scope("https://cdn.example.com/asset"));
    }
}
