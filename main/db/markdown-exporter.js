"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarkdownExporter = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Feature: Phase 6 — Markdown Export for RAG/LLM Workflows.
 * Exports crawl results (URLs + issues) as structured markdown.
 * Supports single-file summary and per-page exports with YAML front matter (Feature 6.3).
 */
class MarkdownExporter {
    db;
    constructor(db) {
        this.db = db;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    exportCrawl(crawlId, outputPathOrDir, options) {
        const opts = {
            format: 'single_file',
            yamlFrontMatter: false,
            excludeSelectors: [],
            ...(options || {}),
        };
        if (opts.format === 'per_page') {
            return this.exportPerPage(crawlId, outputPathOrDir ?? undefined, opts.yamlFrontMatter ?? false);
        }
        return this.exportSingleFile(crawlId, outputPathOrDir, opts.yamlFrontMatter);
    }
    exportSingleFile(crawlId, outputPath, yamlFrontMatter = false) {
        const urls = this.db.prepare(`
      SELECT url, status_code, title, meta_description, word_count, h1, canonical, robots_meta
      FROM urls WHERE crawl_id = ? ORDER BY CASE WHEN status_code >= 500 THEN 0 WHEN status_code >= 400 THEN 1 ELSE 2 END, status_code, url
    `).all(crawlId);
        const issues = this.db.prepare(`
      SELECT url, issue_type, severity, message FROM issues WHERE crawl_id = ? ORDER BY
        CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, url
    `).all(crawlId);
        let md = '';
        // YAML front matter (Feature 6.3)
        if (yamlFrontMatter) {
            md += '---\n';
            md += `title: CrawlDesk SEO Audit Report\n`;
            md += `generated_at: ${new Date().toISOString()}\n`;
            md += `crawl_id: ${crawlId}\n`;
            md += `total_urls: ${urls.length}\n`;
            md += `total_issues: ${issues.length}\n`;
            md += 'format: single_file\n';
            md += '---\n\n';
        }
        md += '# CrawlDesk SEO Audit Report\n\n';
        md += `Generated: ${new Date().toISOString()}\n`;
        md += `Crawl ID: ${crawlId}\n`;
        md += `Total URLs: ${urls.length}\n`;
        md += `Total Issues: ${issues.length}\n\n`;
        // Summary stats
        const errors5xx = urls.filter(u => u.status_code && u.status_code >= 500).length;
        const errors4xx = urls.filter(u => u.status_code && u.status_code >= 400 && u.status_code < 500).length;
        const redirects = urls.filter(u => u.status_code && u.status_code >= 300 && u.status_code < 400).length;
        const ok = urls.filter(u => u.status_code === 200).length;
        md += '## Summary\n\n';
        md += '| Status | Count |\n|---|---|\n';
        md += `| OK (2xx) | ${ok} |\n`;
        md += `| Redirects (3xx) | ${redirects} |\n`;
        md += `| Client Errors (4xx) | ${errors4xx} |\n`;
        md += `| Server Errors (5xx) | ${errors5xx} |\n\n`;
        // Critical issues overview
        const criticalIssues = issues.filter(i => i.severity === 'critical');
        if (criticalIssues.length > 0) {
            md += '## Critical Issues\n\n';
            for (const iss of criticalIssues.slice(0, 50)) {
                md += `- **[${iss.issue_type}]** \`${iss.url}\`: ${iss.message}\n`;
            }
            md += '\n';
        }
        // High issues overview
        const highIssues = issues.filter(i => i.severity === 'high');
        if (highIssues.length > 0) {
            md += '## High Priority Issues\n\n';
            for (const iss of highIssues.slice(0, 100)) {
                md += `- **[${iss.issue_type}]** \`${iss.url}\`: ${iss.message}\n`;
            }
            md += '\n';
        }
        // URLs detail table
        md += '## URL Details\n\n';
        md += '| URL | Status | Title | Words |\n|---|---|---|\n';
        for (const u of urls.slice(0, 1000)) {
            const status = u.status_code ?? '-';
            const title = u.title ? u.title.substring(0, 60).replace(/\|/g, '\\|') : '';
            const words = u.word_count ?? '-';
            md += `\`${u.url.replace(/\|/g, '\\|')}\` | ${status} | ${title} | ${words}\n`;
        }
        if (urls.length > 1000) {
            md += `\n> Showing first 1000 of ${urls.length} URLs. Export CSV for complete data.\n\n`;
        }
        // Issue details by type
        const issueByType = new Map();
        for (const iss of issues) {
            if (!issueByType.has(iss.issue_type))
                issueByType.set(iss.issue_type, []);
            issueByType.get(iss.issue_type).push({ url: iss.url, message: iss.message });
        }
        md += '## Issues by Type\n\n';
        for (const [type, items] of [...issueByType.entries()].sort((a, b) => b[1].length - a[1].length)) {
            md += `### ${type} (${items.length})\n\n`;
            for (const item of items.slice(0, 20)) {
                md += `- \`${item.url.replace(/\`/g, '')}\`: ${item.message}\n`;
            }
            if (items.length > 20)
                md += `\n> Showing 20 of ${items.length}. See full export for all.\n`;
            md += '\n';
        }
        const outFile = outputPath || path.join('crawldesk-report.md');
        fs.writeFileSync(outFile, md, 'utf-8');
        return outFile;
    }
    exportPerPage(crawlId, outputDir, yamlFrontMatter = false) {
        const urls = this.db.prepare(`
      SELECT id, url, status_code, title, meta_description, word_count, h1, canonical, robots_meta
      FROM urls WHERE crawl_id = ? ORDER BY CASE WHEN status_code >= 500 THEN 0 WHEN status_code >= 400 THEN 1 ELSE 2 END, status_code, url
    `).all(crawlId);
        const issuesByURL = new Map();
        const allIssues = this.db.prepare(`
      SELECT url, issue_type, severity, message FROM issues WHERE crawl_id = ?
    `).all(crawlId);
        for (const iss of allIssues) {
            if (!issuesByURL.has(iss.url))
                issuesByURL.set(iss.url, []);
            issuesByURL.get(iss.url).push({ issue_type: iss.issue_type, severity: iss.severity, message: iss.message });
        }
        const dir = outputDir || path.join('crawldesk-report-pages');
        fs.mkdirSync(dir, { recursive: true });
        const files = [];
        for (const u of urls) {
            let md = '';
            // YAML front matter (Feature 6.3)
            if (yamlFrontMatter) {
                md += '---\n';
                md += `title: "${u.title?.replace(/"/g, '\\"') || 'Untitled'}"\n`;
                md += `url: ${u.url}\n`;
                md += `status_code: ${u.status_code ?? 'null'}\n`;
                md += `canonical: ${u.canonical ? `"${u.canonical}"` : 'null'}\n`;
                md += `word_count: ${u.word_count ?? 'null'}\n`;
                md += `h1: "${u.h1?.replace(/"/g, '\\"') || ''}"\n`;
                md += `robots_meta: "${u.robots_meta?.replace(/"/g, '\\"') || ''}"\n`;
                md += `crawl_id: ${crawlId}\n`;
                md += `exported_at: ${new Date().toISOString()}\n`;
                md += '---\n\n';
            }
            md += `# ${u.title || u.url}\n\n`;
            md += `**URL:** ${u.url}\n`;
            md += `**Status:** ${u.status_code ?? 'N/A'}\n`;
            if (u.canonical)
                md += `**Canonical:** ${u.canonical}\n`;
            md += `\n`;
            if (u.meta_description) {
                md += `> ${u.meta_description}\n\n`;
            }
            if (u.h1) {
                md += `## H1: ${u.h1}\n\n`;
            }
            // Page issues
            const pageIssues = issuesByURL.get(u.url) || [];
            if (pageIssues.length > 0) {
                md += '## Issues\n\n';
                for (const iss of pageIssues.sort((a, b) => {
                    const order = { critical: 0, high: 1, medium: 2, low: 3 };
                    return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
                })) {
                    md += `- **[${iss.severity}] ${iss.issue_type}**: ${iss.message}\n`;
                }
                md += '\n';
            }
            // Generate a safe filename from URL
            const safeName = u.url.replace(/^https?:\/\//, '').replace(/[/:*?"<>|]/g, '_').substring(0, 150);
            const fileName = path.join(dir, `${safeName}.md`);
            fs.writeFileSync(fileName, md, 'utf-8');
            files.push(fileName);
        }
        return files;
    }
}
exports.MarkdownExporter = MarkdownExporter;
//# sourceMappingURL=markdown-exporter.js.map