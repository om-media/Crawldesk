"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class ExportService {
    db;
    appDataDir;
    constructor(db, appDataDir) {
        this.db = db;
        this.appDataDir = appDataDir;
    }
    async exportUrls(input) {
        const whereClauses = ['crawl_id = ?'];
        const params = [input.crawlId];
        if (input.filtered && input.filters) {
            this.applyUrlFilters(whereClauses, params, input.filters, input.crawlId);
        }
        const items = this.db.prepare(`SELECT url, status_code, indexability, title, title_length, meta_description, meta_description_length, h1, canonical, depth, response_time_ms, content_type FROM urls WHERE ${whereClauses.join(' AND ')} ORDER BY url ASC`).all(...params);
        const dir = path_1.default.join(this.appDataDir, 'exports');
        fs_1.default.mkdirSync(dir, { recursive: true });
        const filePath = path_1.default.join(dir, `urls-${Date.now()}.csv`);
        const rowCount = items.length;
        const csvContent = this.toCsv(items);
        fs_1.default.writeFileSync(filePath, csvContent, 'utf8');
        return { filePath, rowCount };
    }
    exportIssues(input) {
        const items = this.db.prepare(`
      SELECT url, issue_type, severity, message, recommendation FROM issues WHERE crawl_id = ? ORDER BY severity DESC, url ASC
    `).all(input.crawlId);
        const dir = path_1.default.join(this.appDataDir, 'exports');
        fs_1.default.mkdirSync(dir, { recursive: true });
        const filePath = path_1.default.join(dir, `issues-${Date.now()}.csv`);
        const rowCount = items.length;
        const csvContent = this.toCsv(items);
        fs_1.default.writeFileSync(filePath, csvContent, 'utf8');
        return { filePath, rowCount };
    }
    exportLinks(input) {
        const items = this.db.prepare(`
      SELECT source_url, target_url, anchor_text, link_type, is_internal, is_followed, rel FROM links WHERE crawl_id = ? ORDER BY source_url ASC
    `).all(input.crawlId);
        const dir = path_1.default.join(this.appDataDir, 'exports');
        fs_1.default.mkdirSync(dir, { recursive: true });
        const filePath = path_1.default.join(dir, `links-${Date.now()}.csv`);
        const rowCount = items.length;
        const csvContent = this.toCsv(items);
        fs_1.default.writeFileSync(filePath, csvContent, 'utf8');
        return { filePath, rowCount };
    }
    toCsv(rows) {
        if (!rows || rows.length === 0)
            return '';
        const headers = Object.keys(rows[0]);
        const lines = [headers.join(',')];
        for (const row of rows) {
            const line = headers.map(h => this.escapeCsv(String(row[h] ?? ''))).join(',');
            lines.push(line);
        }
        return lines.join('\n');
    }
    escapeCsv(value) {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return '"' + value.replace(/"/g, '""') + '"';
        }
        return value;
    }
    applyUrlFilters(clauses, params, filters, crawlId) {
        if (!filters)
            return;
        if (filters.search) {
            clauses.push('(url LIKE ? OR title LIKE ? OR meta_description LIKE ? OR h1 LIKE ?)');
            const t = `%${filters.search}%`;
            params.push(t, t, t, t);
        }
        if (filters.statusCategory) {
            clauses.push('status_category = ?');
            params.push(filters.statusCategory);
        }
        if (filters.indexability) {
            clauses.push('indexability = ?');
            params.push(filters.indexability);
        }
        if (filters.issueType) {
            clauses.push(`id IN (SELECT url_id FROM issues WHERE crawl_id = ? AND issue_type = ?)`);
            params.push(crawlId, filters.issueType);
        }
        if (filters.contentType) {
            clauses.push('content_type LIKE ?');
            params.push(`%${filters.contentType}%`);
        }
        if (filters.minDepth !== undefined) {
            clauses.push('depth >= ?');
            params.push(filters.minDepth);
        }
        if (filters.maxDepth !== undefined) {
            clauses.push('depth <= ?');
            params.push(filters.maxDepth);
        }
    }
}
exports.ExportService = ExportService;
//# sourceMappingURL=export-service.js.map