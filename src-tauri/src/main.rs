#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// CrawlDesk — local-first desktop SEO crawler

fn main() {
    crawldesk_lib::run();
}
