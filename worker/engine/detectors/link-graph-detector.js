"use strict";
// Feature 2.2/2.3/2.6 — Link Graph Detector
// Detects orphaned pages, anchor text over-optimization, internal links to 4xx.
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkGraphDetector = void 0;
class LinkGraphDetector {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Run after link counts are computed; returns array of issue records */
    detect(crawlId) {
        const issues = [];
        issues.push(...this.detectOrphanedPages(crawlId));
        issues.push(...this.detectAnchorTextOverOptimized(crawlId));
        issues.push(...this.detectInternalLinksTo4xx(crawlId));
        return issues;
    }
    detectOrphanedPages(crawlId) {
        // Orphaned = no internal inlinks AND not the start URL AND discovered via sitemap only
        const urls = this.db.prepare(`
      SELECT u.id, u.url FROM urls u
      WHERE u.crawl_id = ?
        AND u.inlink_count = 0
        AND (u.discovered_from_url IS NULL OR u.discovered_from_url LIKE '%sitemap%')
    `).all(crawlId);
        // Exclude crawl start URL
        const startUrl = this.db.prepare('SELECT start_url FROM crawls WHERE id = ?').get(crawlId);
        return urls
            .filter(u => !startUrl || (u.url !== startUrl.start_url))
            .map(u => ({
            crawlId,
            urlId: u.id,
            url: u.url,
            issue_type: 'orphaned_page',
            severity: 'high',
            message: 'Page is orphaned — no internal links point to it.',
            recommendation: 'Add this page to your site navigation or create relevant internal links pointing to it.'
        }));
    }
    detectAnchorTextOverOptimized(crawlId) {
        // For each target URL with >3 unique inlinks, check if single anchor text dominates (>70%)
        const targets = this.db.prepare(`
      SELECT source_url_id AS target_id, source_url, COUNT(DISTINCT source_url_id) as unique_sources
      FROM links WHERE crawl_id = ? AND is_internal = 1 AND anchor_text != '' GROUP BY normalized_target_url
      HAVING unique_sources >= 3
    `).all(crawlId);
        const issues = [];
        for (const t of targets) {
            // Get total link count to this target
            const totalLinks = this.db.prepare("SELECT COUNT(*) as c FROM links WHERE crawl_id = ? AND normalized_target_url IN (SELECT normalized_url FROM urls WHERE id = ?)").get(crawlId, t.target_id);
            if (!totalLinks?.c || totalLinks.c < 4)
                continue;
            // Check top anchor text concentration
            const topAnchor = this.db.prepare(`
        SELECT l.anchor_text, COUNT(*) as cnt FROM links l
        JOIN urls u ON u.normalized_url = l.normalized_target_url
        WHERE l.crawl_id = ? AND u.id = ? AND l.is_internal = 1 AND l.anchor_text != ''
        GROUP BY l.anchor_text ORDER BY cnt DESC LIMIT 1
      `).get(crawlId, t.target_id);
            if (topAnchor && totalLinks.c > 0) {
                const pct = Math.round((topAnchor.cnt / totalLinks.c) * 100);
                if (pct > 70) {
                    issues.push({
                        crawlId,
                        urlId: t.target_id,
                        url: t.source_url,
                        issue_type: 'anchor_text_over_optimized',
                        severity: 'low',
                        message: `"${topAnchor.anchor_text}" makes up ${pct}% of anchor texts pointing to this page.`,
                        recommendation: 'Diversify anchor texts linking to this page for a natural backlink profile.'
                    });
                }
            }
        }
        return issues;
    }
    detectInternalLinksTo4xx(crawlId) {
        // Find source URLs that link to targets returning 4xx
        const linksToBroken = this.db.prepare(`
      SELECT DISTINCT l.source_url_id, l.source_url FROM links l
      JOIN urls target ON target.normalized_url = l.normalized_target_url
      WHERE l.crawl_id = ? AND l.is_internal = 1 AND target.status_code >= 400 AND target.status_code < 500
    `).all(crawlId);
        // Group by source and count broken internal links
        const counts = new Map();
        for (const l of linksToBroken) {
            const existing = counts.get(l.source_url_id) || { url: l.source_url, n: 0 };
            existing.n++;
            counts.set(l.source_url_id, existing);
        }
        return [...counts.entries()].map(([id, info]) => ({
            crawlId,
            urlId: id,
            url: info.url,
            issue_type: 'internal_link_to_4xx',
            severity: 'medium',
            message: `${info.n} internal link(s) point to broken URLs.`,
            recommendation: 'Update or remove links pointing to pages that return client errors.'
        }));
    }
}
exports.LinkGraphDetector = LinkGraphDetector;
//# sourceMappingURL=link-graph-detector.js.map