//! URL frontier — SQLite-backed FIFO queue with deduplication per PRD §8.4.

use crate::core::crawler::models::FrontierEntry;
use crate::core::crawler::normalizer::{are_same_url, normalize_url};
use std::collections::{HashMap, HashSet, VecDeque};
use tracing::{debug, trace};

/// URL frontier for managing the crawl queue.
pub struct UrlFrontier {
    /// FIFO queue of URLs to crawl
    queue: VecDeque<FrontierEntry>,
    /// Track visited URLs (deduplication)
    visited: HashSet<String>,
    /// Track max depth seen per URL pattern (for scope enforcement)
    max_depth_seen: HashMap<String, i32>,
    /// Limits
    max_urls: usize,
    max_depth: i32,
}

impl UrlFrontier {
    pub fn new(max_urls: usize, max_depth: i32) -> Self {
        Self {
            queue: VecDeque::new(),
            visited: HashSet::new(),
            max_depth_seen: HashMap::new(),
            max_urls,
            max_depth,
        }
    }

    /// Add a URL to the frontier if it hasn't been seen.
    pub fn enqueue(&mut self, url: String, depth: i32) -> bool {
        let normalized = normalize_url(&url);
        let url = match normalized {
            Some(u) => u,
            None => return false, // Invalid URL
        };

        // Check if already visited or queued
        if self.visited.contains(&url) || self.is_queued(&url) {
            return false;
        }

        // Check depth limit
        if depth > self.max_depth {
            debug!("Skipping URL at depth {} (max: {})", depth, self.max_depth);
            return false;
        }

        // Check total URL limit
        if self.visited.len() + self.queue.len() >= self.max_urls {
            debug!(
                "Frontier full ({}/{} URLs)",
                self.visited.len() + self.queue.len(),
                self.max_urls
            );
            return false;
        }

        self.queue.push_back(FrontierEntry {
            url: url.clone(),
            depth,
            state: crate::core::crawler::models::FrontierState::Queued,
            discovered_at: std::time::Instant::now(),
        });

        debug!("Enqueued: {} (depth {})", url, depth);
        true
    }

    /// Check if a URL is already in the queue.
    fn is_queued(&self, url: &str) -> bool {
        self.queue.iter().any(|entry| are_same_url(&entry.url, url))
    }

    /// Get the next URL to crawl (FIFO).
    pub fn dequeue(&mut self) -> Option<FrontierEntry> {
        while let Some(entry) = self.queue.pop_front() {
            if !self.visited.contains(&entry.url) {
                return Some(entry);
            }
        }
        None
    }

    /// Mark a URL as visited.
    pub fn mark_visited(&mut self, url: &str) {
        let normalized = normalize_url(url).unwrap_or_else(|| url.to_string());
        self.visited.insert(normalized.clone());
        trace!("Marked visited: {}", normalized);
    }

    /// Get the number of URLs in the queue.
    pub fn queued_count(&self) -> usize {
        self.queue.len()
    }

    /// Get the total number of visited URLs.
    pub fn visited_count(&self) -> usize {
        self.visited.len()
    }

    /// Check if the frontier is empty.
    pub fn is_empty(&self) -> bool {
        self.queue.is_empty()
    }

    /// Get remaining capacity.
    pub fn remaining_capacity(&self) -> usize {
        self.max_urls
            .saturating_sub(self.visited.len() + self.queue.len())
    }

    /// Add multiple URLs at once (for sitemap discovery).
    pub fn enqueue_batch(&mut self, urls: Vec<String>, default_depth: i32) -> usize {
        let mut added = 0;
        for url in urls {
            if self.enqueue(url, default_depth) {
                added += 1;
            }
        }
        debug!("Batch enqueued {} URLs (depth {})", added, default_depth);
        added
    }

    /// Get frontier stats.
    pub fn stats(&self) -> FrontierStats {
        FrontierStats {
            queued: self.queue.len(),
            visited: self.visited.len(),
            total: self.visited.len() + self.queue.len(),
            max_urls: self.max_urls,
            remaining: self.remaining_capacity(),
        }
    }
}

#[derive(Debug)]
pub struct FrontierStats {
    pub queued: usize,
    pub visited: usize,
    pub total: usize,
    pub max_urls: usize,
    pub remaining: usize,
}
