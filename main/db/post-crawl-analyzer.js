"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostCrawlAnalyzer = void 0;
/**
 * Post-crawl analysis that runs against the DB after a crawl completes.
 * Detects issues requiring full-dataset awareness (duplicates, canonical chains).
 */
class PostCrawlAnalyzer {
    db;
    constructor(db) {
        this.db = db;
    }
    /**
     * Run all post-crawl analysis passes for a given crawl.
     * Returns an array of issue records to insert.
     */
    async analyze(crawlId) {
        this.detectDuplicateContent(crawlId);
        this.detectCanonicalChains(crawlId);
    }
    // ----------------------------------------------------------------
    // Feature 1.6 — Duplicate Content Detection
    // ----------------------------------------------------------------
    detectDuplicateContent(crawlId) {
        const now = new Date().toISOString();
        // Exact duplicates: group by content_hash where > 1 page shares it
        const exactGroups = this.db.prepare(`
      SELECT content_hash, GROUP_CONCAT(id) as url_ids, COUNT(*) as cnt
      FROM urls
      WHERE crawl_id = ? AND content_hash IS NOT NULL AND content_hash != '' AND indexability = 'indexable'
      GROUP BY content_hash HAVING cnt > 1
    `).all(crawlId);
        if (exactGroups.length > 0) {
            const insertIssue = this.db.prepare(`
        INSERT INTO issues (id, crawl_id, url_id, url, issue_type, severity, message, recommendation, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
            for (const group of exactGroups) {
                const ids = group.url_ids.split(',');
                const firstUrlRow = this.db.prepare('SELECT url FROM urls WHERE id = ?').get(ids[0]);
                for (const urlId of ids) {
                    const urlRow = this.db.prepare('SELECT url FROM urls WHERE id = ?').get(urlId);
                    insertIssue.run(crypto.randomUUID(), crawlId, urlId, urlRow?.url ?? '', 'duplicate_content_exact', 'high', `${group.cnt} page(s) share identical content.`, 'Consolidate duplicate pages using canonical tags or merge content onto a single authoritative URL.', now);
                }
            }
        }
        // Near-duplicates: compare first 8 chars of hash prefix among indexable pages
        const nearDupRows = this.db.prepare(`
      SELECT SUBSTR(content_hash, 1, 8) as prefix, GROUP_CONCAT(id) as url_ids, COUNT(*) as cnt
      FROM urls
      WHERE crawl_id = ? AND content_hash IS NOT NULL AND content_hash != '' AND indexability = 'indexable'
      GROUP BY prefix HAVING cnt > 1
    `).all(crawlId);
        // Filter out groups that are already exact duplicates (same full hash) — only flag truly "near" dups
        const exactHashes = new Set(exactGroups.map(g => g.content_hash));
        const insertIssue = this.db.prepare(`
      INSERT INTO issues (id, crawl_id, url_id, url, issue_type, severity, message, recommendation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        for (const row of nearDupRows) {
            // Check if all URLs in this group share the same FULL hash — if so, they're exact dups already handled above
            const ids = row.url_ids.split(',');
            const hashes = ids.map(id => {
                const r = this.db.prepare('SELECT content_hash FROM urls WHERE id = ?').get(id);
                return r?.content_hash;
            });
            const uniqueFullHashes = new Set(hashes.filter(Boolean)).size;
            if (uniqueFullHashes <= 1)
                continue; // All same full hash → already reported as exact duplicate
            for (const urlId of ids) {
                const urlRow = this.db.prepare('SELECT url FROM urls WHERE id = ?').get(urlId);
                insertIssue.run(crypto.randomUUID(), crawlId, urlId, urlRow?.url ?? '', 'duplicate_content_near', 'medium', `Page has near-duplicate content with ${row.cnt - 1} other page(s).`, 'Review these pages for substantial differences. If too similar, consider merging or differentiating content.', now);
            }
        }
    }
    // ----------------------------------------------------------------
    // Feature 1.4 — Canonical Chain Detection (post-crawl BFS/DFS)
    // ----------------------------------------------------------------
    detectCanonicalChains(crawlId) {
        const now = new Date().toISOString();
        // Build a map: normalized_url → canonical URL (only for URLs that have a self-referencing mismatch)
        const rows = this.db.prepare(`
      SELECT normalized_url, canonical, url
      FROM urls
      WHERE crawl_id = ? AND canonical IS NOT NULL AND canonical != ''
    `).all(crawlId);
        if (rows.length < 2)
            return;
        const canonMap = new Map(); // normUrl → canonical
        const normToOriginalUrl = new Map(); // normUrl → original crawled URL
        for (const row of rows) {
            try {
                const canonNorm = new URL(row.canonical).href.toLowerCase().replace(/\/+$/, '');
                const pageNorm = row.normalized_url.replace(/\/+$/, '').toLowerCase();
                canonMap.set(pageNorm, canonNorm);
                normToOriginalUrl.set(pageNorm, row.url);
            }
            catch { /* skip invalid URLs */ }
        }
        const insertIssue = this.db.prepare(`
      INSERT INTO issues (id, crawl_id, url_id, url, issue_type, severity, message, recommendation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const visited = new Set();
        for (const startNorm of canonMap.keys()) {
            if (!visited.has(startNorm)) {
                const chain = [startNorm];
                let current = startNorm;
                while (true) {
                    const next = canonMap.get(current);
                    if (!next || next === current)
                        break; // Self-referencing or no canonical — end of chain
                    chain.push(next);
                    current = next;
                    if (chain.length > 10)
                        break; // Safety limit
                    // Check if we've seen this URL before in ANY chain — stop to avoid infinite loops
                    if (visited.has(current)) {
                        // We may have a cycle; but we don't currently flag cycles as a specific issue type
                        break;
                    }
                }
                // A chain of ≥ 3 means A→B→C which is problematic
                if (chain.length >= 3) {
                    for (let i = 0; i < chain.length; i++) {
                        visited.add(chain[i]);
                    }
                    // Find original URLs for display
                    const chainUrls = chain.map(n => normToOriginalUrl.get(n) ?? n).join(' → ');
                    // Report on the starting URL of the chain
                    const startUrlId = this.db.prepare('SELECT id FROM urls WHERE crawl_id = ? AND normalized_url = ? LIMIT 1').get(crawlId, startNorm);
                    if (startUrlId?.id) {
                        insertIssue.run(crypto.randomUUID(), crawlId, startUrlId.id, normToOriginalUrl.get(startNorm) ?? '', 'canonical_chain', 'medium', `Canonical chain detected: ${chainUrls} (${chain.length - 1} hops).`, 'Update direct links to point to the final canonical URL and use self-referencing canonicals on intermediate pages.', now);
                    }
                }
                else {
                    for (const c of chain)
                        visited.add(c);
                }
            }
        }
    }
}
exports.PostCrawlAnalyzer = PostCrawlAnalyzer;
//# sourceMappingURL=post-crawl-analyzer.js.map