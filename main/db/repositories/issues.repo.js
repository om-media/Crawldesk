"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IssuesRepo = void 0;
class IssuesRepo {
    db;
    constructor(db) {
        this.db = db;
    }
    insertIssues(issues) {
        if (issues.length === 0)
            return;
        const now = new Date().toISOString();
        const insert = this.db.prepare(`
      INSERT INTO issues (id, crawl_id, url_id, url, issue_type, severity, message, recommendation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const tx = this.db.transaction((items) => {
            for (const i of items) {
                insert.run(crypto.randomUUID(), i.crawlId, i.urlId ?? null, i.url, i.issue_type, i.severity, i.message, i.recommendation, now);
            }
        });
        tx(issues);
    }
    deleteIssuesForUrl(crawlId, urlId) {
        if (urlId) {
            this.db.prepare('DELETE FROM issues WHERE crawl_id = ? AND url_id = ?').run(crawlId, urlId);
        }
        else {
            this.db.prepare('DELETE FROM issues WHERE crawl_id = ?').run(crawlId);
        }
    }
    summarize(crawlId) {
        return this.db.prepare(`
      SELECT issue_type, severity, COUNT(*) as count
      FROM issues
      WHERE crawl_id = ?
      GROUP BY issue_type, severity
      ORDER BY
        CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        count DESC
    `).all(crawlId);
    }
    list(input) {
        const whereClauses = ['crawl_id = ?'];
        const params = [input.crawlId];
        if (input.issueType) {
            whereClauses.push('issue_type = ?');
            params.push(input.issueType);
        }
        if (input.severity) {
            whereClauses.push('severity = ?');
            params.push(input.severity);
        }
        if (input.urlId) {
            whereClauses.push('url_id = ?');
            params.push(input.urlId);
        }
        const limitClause = input.limit !== undefined ? 'LIMIT ?' : '';
        if (limitClause)
            params.push(input.limit);
        return this.db.prepare(`SELECT * FROM issues WHERE ${whereClauses.join(' AND ')} ORDER BY created_at DESC ${limitClause}`).all(...params);
    }
}
exports.IssuesRepo = IssuesRepo;
//# sourceMappingURL=issues.repo.js.map