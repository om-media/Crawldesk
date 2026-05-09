import { ipcMain } from 'electron'
import type { Repositories } from '../db/repositories'
import type Database from 'better-sqlite3'
import { MarkdownExporter } from '../db/markdown-exporter'
import { PdfReporter } from '../db/pdf-reporter'
import { CrawlDiffAnalyzer } from '../db/crawl-diff-analyzer'
// Phase 7.4 — Cron service
import { initScheduler, stopAllSchedules } from '../scheduler/cron-service'

export function registerKeywordsIpc(repos: Repositories, db: Database.Database): void {
  const mdExporter = new MarkdownExporter(db)
  const pdfReporter = new PdfReporter(db)
  const diffAnalyzer = new CrawlDiffAnalyzer(db)

  ipcMain.handle('keywords:analyze', (_e, crawlId: string, gramType: 'unigrams' | 'bigrams' | 'trigrams') => {
    return repos.urls.analyzeKeywords(crawlId, gramType)
  })

  // Phase 6 — Carbon estimation per page
  ipcMain.handle('carbon:estimate', (_e, crawlId: string) => {
    return repos.urls.estimatePageCarbon(crawlId)
  })

  // Phase 6 — Markdown export for RAG/LLM workflows
  ipcMain.handle('exports:markdown', async (_e, crawlId: string, outputPath?: string) => {
    const file = mdExporter.exportCrawl(crawlId, outputPath)
    return { path: file }
  })

  // Phase 7.1 — Content clustering via TF-IDF cosine similarity
  ipcMain.handle('clusters:find', (_e, crawlId: string) => {
    return repos.urls.findContentClusters(crawlId)
  })

  // Phase 7.3 — PDF report generation
  ipcMain.handle('exports:pdf', async (_e, crawlId: string) => {
    return pdfReporter.generate(crawlId)
  })

  // Phase 7.4 — Crawl diff comparison
  ipcMain.handle('diff:get', (_e, crawlId: string) => {
    return diffAnalyzer.getDiff(crawlId) || null
  })

  ipcMain.handle('diff:listByProject', (_e, projectId: string) => {
    return diffAnalyzer.getDiffsForProject(projectId)
  })

  // Phase 7.4 — Extraction rules CRUD
  ipcMain.handle('extractions:list', (_e, crawlId: string) => {
    return db.prepare("SELECT * FROM extraction_rules WHERE crawl_id = ? ORDER BY name").all(crawlId)
  })

  ipcMain.handle('extractions:create', (_e, rule: any) => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    db.prepare(
      "INSERT INTO extraction_rules (id, crawl_id, name, selector, rule_type, attribute, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(id, rule.crawlId, rule.name, rule.selector, rule.ruleType, rule.attribute ?? null, rule.active ? 1 : 0, now)
    return { id }
  })

  ipcMain.handle('extractions:update', (_e, id: string, patch: any) => {
    const cols: string[] = []
    const vals: any[] = []
    if (patch.name !== undefined) { cols.push('name = ?'); vals.push(patch.name) }
    if (patch.selector !== undefined) { cols.push('selector = ?'); vals.push(patch.selector) }
    if (patch.ruleType !== undefined) { cols.push('rule_type = ?'); vals.push(patch.ruleType) }
    if (patch.attribute !== undefined) { cols.push('attribute = ?'); vals.push(patch.attribute) }
    if (patch.active !== undefined) { cols.push('active = ?'); vals.push(patch.active ? 1 : 0) }
    if (cols.length === 0) return
    vals.push(id)
    db.prepare(`UPDATE extraction_rules SET ${cols.join(', ')} WHERE id = ?`).run(...vals)
  })

  ipcMain.handle('extractions:delete', (_e, id: string) => {
    db.prepare("DELETE FROM extraction_rules WHERE id = ?").run(id)
  })

  // Phase 7.4 — Crawl schedule CRUD
  ipcMain.handle('schedules:list', (_e, projectId?: string) => {
    if (projectId) {
      return db.prepare("SELECT * FROM crawl_schedules WHERE project_id = ? ORDER BY created_at DESC").all(projectId)
    }
    return db.prepare("SELECT * FROM crawl_schedules ORDER BY created_at DESC").all()
  })

  ipcMain.handle('schedules:create', (_e, input: any) => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    db.prepare(
      "INSERT INTO crawl_schedules (id, project_id, start_url, crawl_settings_json, cron_expression, enabled, last_run_at, next_run_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, NULL, NULL, ?, ?)"
    ).run(id, input.projectId, input.startUrl, input.crawlSettingsJson, input.cronExpression, now, now)
    return { id }
  })

  ipcMain.handle('schedules:update', (_e, id: string, patch: any) => {
    const cols: string[] = []
    const vals: any[] = []
    const now = new Date().toISOString()
    if (patch.enabled !== undefined) { cols.push('enabled = ?'); vals.push(patch.enabled ? 1 : 0) }
    if (patch.cronExpression !== undefined) { cols.push('cron_expression = ?'); vals.push(patch.cronExpression) }
    if (patch.startUrl !== undefined) { cols.push('start_url = ?'); vals.push(patch.startUrl) }
    if (cols.length === 0) return
    cols.push("updated_at = ?")
    vals.push(now, id)
    db.prepare(`UPDATE crawl_schedules SET ${cols.join(', ')} WHERE id = ?`).run(...vals)
  })

  ipcMain.handle('schedules:delete', (_e, id: string) => {
    db.prepare("DELETE FROM crawl_schedules WHERE id = ?").run(id)
  })

  // Initialize scheduler on startup
  initScheduler(db)
}
