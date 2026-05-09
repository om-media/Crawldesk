"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerKeywordsIpc = registerKeywordsIpc;
const electron_1 = require("electron");
const markdown_exporter_1 = require("../db/markdown-exporter");
const pdf_reporter_1 = require("../db/pdf-reporter");
const crawl_diff_analyzer_1 = require("../db/crawl-diff-analyzer");
// Phase 7.4 — Cron service
const cron_service_1 = require("../scheduler/cron-service");
function registerKeywordsIpc(repos, db) {
    const mdExporter = new markdown_exporter_1.MarkdownExporter(db);
    const pdfReporter = new pdf_reporter_1.PdfReporter(db);
    const diffAnalyzer = new crawl_diff_analyzer_1.CrawlDiffAnalyzer(db);
    electron_1.ipcMain.handle('keywords:analyze', (_e, crawlId, gramType) => {
        return repos.urls.analyzeKeywords(crawlId, gramType);
    });
    // Phase 6 — Carbon estimation per page
    electron_1.ipcMain.handle('carbon:estimate', (_e, crawlId) => {
        return repos.urls.estimatePageCarbon(crawlId);
    });
    // Phase 6 — Markdown export for RAG/LLM workflows
    electron_1.ipcMain.handle('exports:markdown', async (_e, crawlId, outputPath) => {
        const file = mdExporter.exportCrawl(crawlId, outputPath);
        return { path: file };
    });
    // Phase 7.1 — Content clustering via TF-IDF cosine similarity
    electron_1.ipcMain.handle('clusters:find', (_e, crawlId) => {
        return repos.urls.findContentClusters(crawlId);
    });
    // Phase 7.3 — PDF report generation
    electron_1.ipcMain.handle('exports:pdf', async (_e, crawlId) => {
        return pdfReporter.generate(crawlId);
    });
    // Phase 7.4 — Crawl diff comparison
    electron_1.ipcMain.handle('diff:get', (_e, crawlId) => {
        return diffAnalyzer.getDiff(crawlId) || null;
    });
    electron_1.ipcMain.handle('diff:listByProject', (_e, projectId) => {
        return diffAnalyzer.getDiffsForProject(projectId);
    });
    // Phase 7.4 — Extraction rules CRUD
    electron_1.ipcMain.handle('extractions:list', (_e, crawlId) => {
        return db.prepare("SELECT * FROM extraction_rules WHERE crawl_id = ? ORDER BY name").all(crawlId);
    });
    electron_1.ipcMain.handle('extractions:create', (_e, rule) => {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        db.prepare("INSERT INTO extraction_rules (id, crawl_id, name, selector, rule_type, attribute, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, rule.crawlId, rule.name, rule.selector, rule.ruleType, rule.attribute ?? null, rule.active ? 1 : 0, now);
        return { id };
    });
    electron_1.ipcMain.handle('extractions:update', (_e, id, patch) => {
        const cols = [];
        const vals = [];
        if (patch.name !== undefined) {
            cols.push('name = ?');
            vals.push(patch.name);
        }
        if (patch.selector !== undefined) {
            cols.push('selector = ?');
            vals.push(patch.selector);
        }
        if (patch.ruleType !== undefined) {
            cols.push('rule_type = ?');
            vals.push(patch.ruleType);
        }
        if (patch.attribute !== undefined) {
            cols.push('attribute = ?');
            vals.push(patch.attribute);
        }
        if (patch.active !== undefined) {
            cols.push('active = ?');
            vals.push(patch.active ? 1 : 0);
        }
        if (cols.length === 0)
            return;
        vals.push(id);
        db.prepare(`UPDATE extraction_rules SET ${cols.join(', ')} WHERE id = ?`).run(...vals);
    });
    electron_1.ipcMain.handle('extractions:delete', (_e, id) => {
        db.prepare("DELETE FROM extraction_rules WHERE id = ?").run(id);
    });
    // Phase 7.4 — Crawl schedule CRUD
    electron_1.ipcMain.handle('schedules:list', (_e, projectId) => {
        if (projectId) {
            return db.prepare("SELECT * FROM crawl_schedules WHERE project_id = ? ORDER BY created_at DESC").all(projectId);
        }
        return db.prepare("SELECT * FROM crawl_schedules ORDER BY created_at DESC").all();
    });
    electron_1.ipcMain.handle('schedules:create', (_e, input) => {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        db.prepare("INSERT INTO crawl_schedules (id, project_id, start_url, crawl_settings_json, cron_expression, enabled, last_run_at, next_run_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, NULL, NULL, ?, ?)").run(id, input.projectId, input.startUrl, input.crawlSettingsJson, input.cronExpression, now, now);
        return { id };
    });
    electron_1.ipcMain.handle('schedules:update', (_e, id, patch) => {
        const cols = [];
        const vals = [];
        const now = new Date().toISOString();
        if (patch.enabled !== undefined) {
            cols.push('enabled = ?');
            vals.push(patch.enabled ? 1 : 0);
        }
        if (patch.cronExpression !== undefined) {
            cols.push('cron_expression = ?');
            vals.push(patch.cronExpression);
        }
        if (patch.startUrl !== undefined) {
            cols.push('start_url = ?');
            vals.push(patch.startUrl);
        }
        if (cols.length === 0)
            return;
        cols.push("updated_at = ?");
        vals.push(now, id);
        db.prepare(`UPDATE crawl_schedules SET ${cols.join(', ')} WHERE id = ?`).run(...vals);
    });
    electron_1.ipcMain.handle('schedules:delete', (_e, id) => {
        db.prepare("DELETE FROM crawl_schedules WHERE id = ?").run(id);
    });
    // Initialize scheduler on startup
    (0, cron_service_1.initScheduler)(db);
}
//# sourceMappingURL=keywords.ipc.js.map