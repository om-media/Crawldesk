"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinksRepo = void 0;
class LinksRepo {
    db;
    constructor(db) {
        this.db = db;
    }
    list(input) {
        const whereClauses = ['l.crawl_id = ?'];
        const params = [input.crawlId];
        if (input.filters?.isInternal !== undefined) {
            whereClauses.push('l.is_internal = ?');
            params.push(input.filters.isInternal ? 1 : 0);
        }
        if (input.filters?.linkType) {
            whereClauses.push('l.link_type = ?');
            params.push(input.filters.linkType);
        }
        if (input.filters?.isFollowed !== undefined) {
            whereClauses.push('l.is_followed = ?');
            params.push(input.filters.isFollowed ? 1 : 0);
        }
        if (input.filters?.brokenTarget) {
            whereClauses.push(`u.status_code IS NOT NULL AND u.status_code >= 400`);
        }
        // Count
        const totalRow = this.db.prepare(`SELECT COUNT(*) as total FROM links l LEFT JOIN urls u ON u.id = l.target_url_id WHERE ${whereClauses.join(' AND ')}`).get(...params);
        params.push(input.pageSize, input.page * input.pageSize);
        const items = this.db.prepare(`
      SELECT * FROM links l LEFT JOIN urls u ON u.id = l.target_url_id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY l.discovered_at DESC LIMIT ? OFFSET ?
    `).all(...params);
        return {
            items,
            total: totalRow.total,
            page: input.page,
            pageSize: input.pageSize,
            totalPages: Math.ceil(totalRow.total / input.pageSize)
        };
    }
    summarize(crawlId) {
        const internalCount = this.db.prepare("SELECT COUNT(*) as c FROM links WHERE crawl_id = ? AND is_internal = 1").get(crawlId);
        const externalCount = this.db.prepare("SELECT COUNT(*) as c FROM links WHERE crawl_id = ? AND is_internal = 0").get(crawlId);
        const followCount = this.db.prepare("SELECT COUNT(*) as c FROM links WHERE crawl_id = ? AND is_followed = 1").get(crawlId);
        const nofollowCount = this.db.prepare("SELECT COUNT(*) as c FROM links WHERE crawl_id = ? AND is_followed = 0").get(crawlId);
        const brokenCount = this.db.prepare(`
      SELECT COUNT(DISTINCT l.id) as c
      FROM links l JOIN urls u ON u.id = l.target_url_id
      WHERE l.crawl_id = ? AND u.status_code IS NOT NULL AND u.status_code >= 400
    `).get(crawlId);
        return {
            totalInternal: internalCount.c,
            totalExternal: externalCount.c,
            totalFollow: followCount.c,
            totalNofollow: nofollowCount.c,
            brokenCount: brokenCount.c
        };
    }
}
exports.LinksRepo = LinksRepo;
//# sourceMappingURL=links.repo.js.map