//! Robots.txt parsing and compliance checking per PRD §8.5.

use std::collections::HashMap;
use tracing::{debug, warn};

/// Represents a parsed robots.txt entry.
#[derive(Debug, Clone)]
pub struct RobotsRule {
    pub user_agent: String,
    pub allow: bool,
    pub path_pattern: String,
}

/// Service for parsing and checking robots.txt compliance.
pub struct RobotsService {
    /// hostname -> list of rules
    rules: HashMap<String, Vec<RobotsRule>>,
}

impl RobotsService {
    pub fn new() -> Self {
        Self {
            rules: HashMap::new(),
        }
    }

    /// Parse robots.txt content and store rules for the given hostname.
    pub fn parse(&mut self, hostname: &str, content: &str) {
        debug!("Parsing robots.txt for {}", hostname);

        let rules = Self::parse_rules(content);
        self.rules.insert(hostname.to_lowercase(), rules);
    }

    /// Check if a URL is allowed by robots.txt.
    pub fn is_allowed(&self, hostname: &str, path: &str) -> bool {
        let hostname = hostname.to_lowercase();

        // Try exact hostname match first
        if let Some(rules) = self.rules.get(&hostname) {
            return Self::check_rules(rules, path);
        }

        // Try wildcard * rules (universal rules)
        if let Some(rules) = self.rules.get("*") {
            return Self::check_rules(rules, path);
        }

        // No rules found — allow by default
        true
    }

    /// Parse robots.txt content into rules.
    fn parse_rules(content: &str) -> Vec<RobotsRule> {
        let mut rules = Vec::new();

        for line in content.lines() {
            let line = line.trim();

            // Skip empty lines and comments
            if line.is_empty() || line.starts_with('#') {
                continue;
            }

            // Parse Allow/Disallow directives
            if let Some((directive, pattern)) = Self::parse_directive(line) {
                rules.push(RobotsRule {
                    user_agent: "*".to_string(), // Simplified — single agent support
                    allow: directive,
                    path_pattern: pattern.to_lowercase(),
                });
            }
        }

        // Sort by length descending (most specific first)
        rules.sort_by(|a, b| b.path_pattern.len().cmp(&a.path_pattern.len()));

        rules
    }

    /// Parse a single directive line.
    fn parse_directive(line: &str) -> Option<(bool, &str)> {
        if let Some(pattern) = line.strip_prefix("Allow:") {
            Some((true, pattern.trim()))
        } else if let Some(pattern) = line.strip_prefix("Disallow:") {
            Some((false, pattern.trim()))
        } else if let Some(user_agent) = line.strip_prefix("User-agent:") {
            // Skip User-agent lines (simplified — single agent)
            None
        } else {
            None
        }
    }

    /// Check a URL path against a list of rules.
    fn check_rules(rules: &[RobotsRule], path: &str) -> bool {
        let path = path.to_lowercase();

        for rule in rules {
            if rule.path_pattern == "/" || path.starts_with(&rule.path_pattern) {
                return rule.allow;
            }
        }

        // No matching rule — allow by default (per RFC 9309)
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_robots() {
        let content = "User-agent: *\nDisallow: /admin/\nAllow: /\n";
        let mut service = RobotsService::new();
        service.parse("example.com", content);

        assert!(service.is_allowed("example.com", "/"));
        assert!(!service.is_allowed("example.com", "/admin/dashboard"));
    }

    #[test]
    fn test_parse_disallow_all() {
        let content = "User-agent: *\nDisallow: /\n";
        let mut service = RobotsService::new();
        service.parse("example.com", content);

        assert!(!service.is_allowed("example.com", "/any-page"));
    }

    #[test]
    fn test_parse_allow_specific() {
        let content = "User-agent: *\nDisallow: /private/\nAllow: /public/\n";
        let mut service = RobotsService::new();
        service.parse("example.com", content);

        assert!(service.is_allowed("example.com", "/public/page"));
        assert!(!service.is_allowed("example.com", "/private/data"));
    }

    #[test]
    fn test_no_rules_allows() {
        let service = RobotsService::new();
        assert!(service.is_allowed("unknown.com", "/page"));
    }

    #[test]
    fn test_most_specific_rule_wins() {
        let content = "User-agent: *\nDisallow: /admin/\nAllow: /admin/public/\n";
        let mut service = RobotsService::new();
        service.parse("example.com", content);

        // Allow is more specific (longer path)
        assert!(service.is_allowed("example.com", "/admin/public/area"));
    }
}
