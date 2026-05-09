"use strict";
// Feature 2.4 — Pagination Detector (modular inline version)
// Detects broken pagination chains and missing canonical on paginated pages.
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaginationDetector = void 0;
class PaginationDetector {
    db;
    constructor(db) {
        this.db = db;
    }
    detect(crawlId) {
        const issues = [];
        issues.push(...this.detectBrokenPaginationChains(crawlId));
        issues.push(...this.detectMissingPaginationCanonical(crawlId));
        return issues;
    }
    detectBrokenPaginationChains(crawlId) {
        // Build set of all crawled normalized URLs for quick lookup
        const crawledUrls = new Set(this.db.prepare('SELECT normalized_url FROM urls WHERE crawl_id = ?').all(crawlId)
            .map((r) => r.normalized_url).filter(Boolean));
        // Find paginated pages whose next/prev point to non-crawled URLs
        const pages = this.db.prepare(`
      SELECT u.id, u.url, u.pagination_next, u.pagination_prev
      FROM urls u WHERE u.crawl_id = ? AND (u.pagination_next IS NOT NULL OR u.pagination_prev IS NOT NULL)
    `).all(crawlId);
        const issues = [];
        for (const p of pages) {
            if (p.pagination_next && !crawledUrls.has(p.pagination_next.toLowerCase())) {
                issues.push({
                    crawlId,
                    urlId: p.id,
                    url: p.url,
                    issue_type: 'broken_pagination_chain',
                    severity: 'medium',
                    message: `Pagination "next" link points to uncrawled URL: ${p.pagination_next}`,
                    recommendation: 'Verify the next page exists and is accessible to crawlers.'
                });
            }
            if (p.pagination_prev && !crawledUrls.has(p.pagination_prev.toLowerCase())) {
                issues.push({
                    crawlId,
                    urlId: p.id,
                    url: p.url,
                    issue_type: 'broken_pagination_chain',
                    severity: 'medium',
                    message: `Pagination "prev" link points to uncrawled URL: ${p.pagination_prev}`,
                    recommendation: 'Verify the previous page exists and is accessible to crawlers.'
                });
            }
        }
        return issues;
    }
    detectMissingPaginationCanonical(crawlId) {
        // Paginated pages without canonical tag
        const pages = this.db.prepare(`
      SELECT u.id, u.url FROM urls u WHERE u.crawl_id = ? AND u.is_paginated = 1 AND (u.canonical IS NULL OR u.canonical = '')
    `).all(crawlId);
        return pages.map(p => ({
            crawlId,
            urlId: p.id,
            url: p.url,
            issue_type: 'missing_pagination_canonical',
            severity: 'low',
            message: 'Paginated page missing canonical tag.',
            recommendation: 'Set self-referencing canonical on paginated pages, or point all to the main listing page.'
        }));
    }
}
exports.PaginationDetector = PaginationDetector;
//# sourceMappingURL=pagination-detector.js.map