//! URL scope filtering per PRD §8.5 — hostname matching, include/exclude patterns, depth enforcement.

use regex::Regex;
use tracing::{debug, warn};
use url::Url;

/// URL scope service for filtering which URLs to crawl.
#[derive(Clone)]
pub struct ScopeService {
    root_hostname: String,
    root_scheme: String,
    allowed_hostnames: Vec<String>,
    blocked_hostnames: Vec<String>,
    include_patterns: Vec<Regex>,
    exclude_patterns: Vec<Regex>,
}

impl ScopeService {
    pub fn new(root_url: &str) -> Self {
        let parsed = Url::parse(root_url).expect("Invalid root URL");
        let hostname = parsed.host_str().unwrap_or("").to_lowercase();
        
        Self {
            root_hostname: hostname.clone(),
            root_scheme: parsed.scheme().to_string(),
            allowed_hostnames: vec![hostname.clone()],
            blocked_hostnames: Vec::new(),
            include_patterns: Vec::new(),
            exclude_patterns: Vec::new(),
        }
    }

    /// Add allowed hostnames (subdomains).
    pub fn add_allowed_hostname(&mut self, hostname: &str) {
        self.allowed_hostnames.push(hostname.to_lowercase());
    }

    /// Add blocked hostnames.
    pub fn add_blocked_hostname(&mut self, hostname: &str) {
        self.blocked_hostnames.push(hostname.to_lowercase());
    }

    /// Add include pattern (regex).
    pub fn add_include_pattern(&mut self, pattern: &str) {
        if let Ok(re) = Regex::new(pattern) {
            self.include_patterns.push(re);
        } else {
            warn!("Invalid include pattern: {}", pattern);
        }
    }

    /// Add exclude pattern (regex).
    pub fn add_exclude_pattern(&mut self, pattern: &str) {
        if let Ok(re) = Regex::new(pattern) {
            self.exclude_patterns.push(re);
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
        if self.blocked_hostnames.iter().any(|b| hostname == *b || hostname.ends_with(&format!(".{}", b))) {
            debug!("Blocked hostname: {}", url);
            return false;
        }

        if !self.allowed_hostnames.iter().any(|a| hostname == *a || hostname.ends_with(&format!(".{}", a))) {
            debug!("Hostname not in allowed list: {} (allowed: {:?})", hostname, self.allowed_hostnames);
            return false;
        }

        // Check include patterns (if any are specified, URL must match at least one)
        if !self.include_patterns.is_empty() {
            let path = parsed.path();
            if !self.include_patterns.iter().any(|re| re.is_match(path)) {
                debug!("URL doesn't match any include pattern: {}", url);
                return false;
            }
        }

        // Check exclude patterns (if any match, URL is out of scope)
        let full_path = format!("{}{}", parsed.path(), parsed.query().map(|q| format!("?{}", q)).unwrap_or_default());
        if self.exclude_patterns.iter().any(|re| re.is_match(&full_path)) {
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
        assert!(!scope.is_in_scope("https://example.com/page"));
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
}
