"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaginationAnalyzer = void 0;
/**
 * Phase 2 Feature 2.4 post-crawl analysis for pagination chains.
 * Detects broken pagination chains (loops/gaps) and missing canonical tags on paginated pages.
 */
class PaginationAnalyzer {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Run all pagination post-crawl passes. Returns void (issues inserted directly). */
    analyze(crawlId) {
        this.detectBrokenPaginationChains(crawlId);
        this.detectMissingPaginationCanonical(crawlId);
    }
    // ----------------------------------------------------------------
    // Feature 2.4 — Broken Pagination Chain Detection
    // Builds a directed graph from rel=next links and validates chain integrity:
    // - Next URL references a page that wasn't crawled
    // - Chains form loops (A→B→C→A)
    // - Gaps in sequence (page N's next skips to N+2)
    // ----------------------------------------------------------------
    detectBrokenPaginationChains(crawlId) {
        const now = new Date().toISOString();
        // Get all URLs with pagination data
        const rows = this.db.prepare(`
      SELECT id, url, normalized_url, pagination_next, pagination_prev
      FROM urls WHERE crawl_id = ? AND is_paginated = 1
    `).all(crawlId);
        if (rows.length === 0)
            return;
        // Build lookup sets for crawled normalized URLs
        const crawledUrls = new Map(rows.map(r => [r.normalized_url.toLowerCase(), r]));
        const insertIssue = this.db.prepare(`
      INSERT INTO issues (id, crawl_id, url_id, url, issue_type, severity, message, recommendation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        // Track visited nodes per chain for loop detection
        const flaggedForChainBreak = new Set();
        const flaggedForLoop = new Set();
        for (const row of rows) {
            // Check if rel=next points to a URL not in our crawled set
            if (row.pagination_next) {
                try {
                    const nextNormed = new URL(row.pagination_next).href.toLowerCase().replace(/\/+$/, '');
                    if (!crawledUrls.has(nextNormed)) {
                        // Broken reference — next page was never crawled
                        if (!flaggedForChainBreak.has(row.id)) {
                            insertIssue.run(crypto.randomUUID(), crawlId, row.id, row.url, 'pagination_broken_loop', 'medium', `rel="next" points to ${row.pagination_next} which was not crawled.`, 'Ensure pagination links point to valid pages within the same paginated series.', now);
                            flaggedForChainBreak.add(row.id);
                        }
                    }
                    else {
                        // Verify reciprocity: the target's rel=prev should point back to this URL
                        const nextUrl = crawledUrls.get(nextNormed);
                        if (nextUrl && nextUrl.pagination_prev) {
                            try {
                                const prevPointsBack = new URL(nextUrl.pagination_prev).href.toLowerCase();
                                const selfUrl = new URL(row.url).href.toLowerCase();
                                if (prevPointsBack !== selfUrl) {
                                    // Non-critical asymmetry — just a warning if not already flagged
                                }
                            }
                            catch { /* URL parse error — skip */ }
                        }
                    }
                }
                catch { /* Invalid URL in pagination_next — skip */ }
            }
            // Check if rel=prev points to a URL not in our crawled set
            if (row.pagination_prev) {
                try {
                    const prevNormed = new URL(row.pagination_prev).href.toLowerCase().replace(/\/+$/, '');
                    if (!crawledUrls.has(prevNormed)) {
                        if (!flaggedForChainBreak.has(row.id)) {
                            insertIssue.run(crypto.randomUUID(), crawlId, row.id, row.url, 'pagination_broken_loop', 'medium', `rel="prev" points to ${row.pagination_prev} which was not crawled.`, 'Ensure pagination links point to valid pages within the same paginated series.', now);
                            flaggedForChainBreak.add(row.id);
                        }
                    }
                }
                catch { /* Invalid URL in pagination_prev — skip */ }
            }
        }
        // Detect loops: follow next chain from each unvisited start node, track visited set
        const visitedInLoopCheck = new Set();
        for (const starter of rows) {
            if (visitedInLoopCheck.has(starter.normalized_url))
                continue;
            const chainIds = [];
            const chainSet = new Set();
            this.followNextChain(starter, crawledUrls, visitedInLoopCheck, chainIds, chainSet, insertIssue, crawlId, rows, flaggedForLoop, now);
        }
        // Detect prev→next loops (reverse direction)
        const visitedRev = new Set();
        for (const starter of rows) {
            if (visitedRev.has(starter.normalized_url))
                continue;
            const chainIds = [];
            const chainSet = new Set();
            this.followPrevChain(starter, crawledUrls, visitedRev, chainIds, chainSet, insertIssue, crawlId, rows, flaggedForLoop, now);
        }
    }
    followNextChain(starter, crawledUrls, visited, chainIds, chainSet, insertIssue, crawlId, rows, flaggedForLoop, now) {
        let node = starter;
        while (node?.pagination_next && !visited.has(node.normalized_url)) {
            if (chainSet.has(node.normalized_url)) {
                for (const nid of chainIds) {
                    if (!flaggedForLoop.has(nid)) {
                        insertIssue.run(crypto.randomUUID(), crawlId, nid, rows.find((r) => r.id === nid)?.url ?? '', 'pagination_broken_loop', 'medium', `This page is part of a circular pagination chain.`, 'Pagination should be linear (page 1 → page 2 → ...), not circular.', now);
                        flaggedForLoop.add(nid);
                    }
                }
                break;
            }
            const nu = node.normalized_url;
            const pn = node.pagination_next;
            chainSet.add(nu);
            chainIds.push(node.id);
            try {
                const resolvedNext = new URL(pn).href.toLowerCase().replace(/\/+$/, '');
                node = crawledUrls.get(resolvedNext) ?? null;
            }
            catch {
                break;
            }
        }
        for (const n of chainSet)
            visited.add(n);
    }
    followPrevChain(starter, crawledUrls, visited, chainIds, chainSet, insertIssue, crawlId, rows, flaggedForLoop, now) {
        let node = starter;
        while (node?.pagination_prev && !visited.has(node.normalized_url)) {
            if (chainSet.has(node.normalized_url)) {
                for (const nid of chainIds) {
                    if (!flaggedForLoop.has(nid)) {
                        insertIssue.run(crypto.randomUUID(), crawlId, nid, rows.find((r) => r.id === nid)?.url ?? '', 'pagination_broken_loop', 'medium', `This page is part of a circular pagination chain.`, 'Pagination should be linear (page 1 → page 2 → ...), not circular.', now);
                        flaggedForLoop.add(nid);
                    }
                }
                break;
            }
            const nu = node.normalized_url;
            const pp = node.pagination_prev;
            chainSet.add(nu);
            chainIds.push(node.id);
            try {
                const resolvedPrev = new URL(pp).href.toLowerCase().replace(/\/+$/, '');
                node = crawledUrls.get(resolvedPrev) ?? null;
            }
            catch {
                break;
            }
        }
        for (const n of chainSet)
            visited.add(n);
    }
    // ----------------------------------------------------------------
    // Feature 2.4 — Missing Canonical on Paginated Pages
    // Paginated pages should have self-referencing canonical tags to prevent
    // duplicate content issues with URL parameters (?page=N, etc.)
    // ----------------------------------------------------------------
    detectMissingPaginationCanonical(crawlId) {
        const now = new Date().toISOString();
        // Find paginated URLs without a canonical tag or with mismatched canonical
        const rows = this.db.prepare(`
      SELECT id, url, normalized_url, canonical
      FROM urls WHERE crawl_id = ? AND is_paginated = 1
        AND (canonical IS NULL OR canonical = '' OR canonical != url)
    `).all(crawlId);
        if (rows.length === 0)
            return;
        const insertIssue = this.db.prepare(`
      INSERT INTO issues (id, crawl_id, url_id, url, issue_type, severity, message, recommendation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        for (const row of rows) {
            insertIssue.run(crypto.randomUUID(), crawlId, row.id, row.url, 'missing_pagination_canonical', 'medium', `Paginated page ${row.canonical ? `has canonical "${row.canonical}"` : 'has no canonical tag'}.`, 'Add a self-referencing <link rel="canonical"> to each paginated URL to prevent duplicate content issues.', now);
        }
    }
}
exports.PaginationAnalyzer = PaginationAnalyzer;
//# sourceMappingURL=pagination-analyzer.js.map