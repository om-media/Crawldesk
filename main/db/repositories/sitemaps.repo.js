"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SitemapsRepo = void 0;
class SitemapsRepo {
    db;
    insertStmt;
    constructor(db) {
        this.db = db;
        this.insertStmt = this.db.prepare(`
      INSERT INTO sitemaps (id, crawl_id, sitemap_url, status_code, discovered_from, url_count,
        is_index, parent_sitemap_url, entries_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    }
    /** Insert a parsed sitemap record */
    upsert(data) {
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        const isIndex = !!(data.indexEntries && data.indexEntries.length > 0);
        let urlCount = 0;
        let entriesJson = null;
        if (isIndex) {
            urlCount = data.indexEntries.length;
            entriesJson = JSON.stringify(data.indexEntries);
        }
        else if (data.urls && data.urls.length > 0) {
            urlCount = data.urls.length;
            entriesJson = JSON.stringify(data.urls);
        }
        this.insertStmt.run(id, data.crawlId, data.sitemapUrl, data.statusCode ?? null, data.discoveredFrom ?? null, urlCount, isIndex ? 1 : 0, data.parentSitemapUrl ?? null, entriesJson, now);
        return id;
    }
    /** Get all sitemap-declared URLs (normalized lowercase) for a crawl */
    getSitemapUrls(crawlId) {
        const rows = this.db.prepare(`
      SELECT entries_json FROM sitemaps
      WHERE crawl_id = ? AND is_index = 0
        AND entries_json IS NOT NULL AND entries_json != ''
    `).all(crawlId);
        const urls = new Set();
        for (const row of rows) {
            try {
                const parsed = JSON.parse(row.entries_json);
                for (const u of parsed) {
                    urls.add(u.loc.toLowerCase().replace(/\/+$/, ''));
                }
            }
            catch { /* skip invalid JSON */ }
        }
        return urls;
    }
    /** List sitemap records for a crawl */
    list(crawlId) {
        return this.db.prepare('SELECT * FROM sitemaps WHERE crawl_id = ? ORDER BY created_at')
            .all(crawlId);
    }
    /** Count of sitemaps discovered for a crawl */
    count(crawlId) {
        const result = this.db.prepare('SELECT COUNT(*) as total FROM sitemaps WHERE crawl_id = ?').get(crawlId);
        return result.total;
    }
}
exports.SitemapsRepo = SitemapsRepo;
//# sourceMappingURL=sitemaps.repo.js.map