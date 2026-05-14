// Feature 7.3 — PDF Report Generation via Puppeteer
// Renders a branded HTML template into a PDF report with executive summary, metrics charts, issues overview.

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

export interface GeneratedReportResult {
  filePath: string
  pageCount: number
}

export class PdfReporter {
  constructor(private db: Database.Database) {}

  async generate(crawlId: string): Promise<GeneratedReportResult> {
    // Gather data
    const crawl = this.db.prepare('SELECT * FROM crawls WHERE id = ?').get(crawlId) as any
    if (!crawl) throw new Error('Crawl not found')

    const urlSummary = this.db.prepare(`
      SELECT 
        COUNT(*) as total_urls,
        SUM(CASE WHEN status_code BETWEEN 200 AND 299 THEN 1 ELSE 0 END) as s2xx,
        SUM(CASE WHEN status_code BETWEEN 400 AND 499 THEN 1 ELSE 0 END) as s4xx,
        SUM(CASE WHEN status_code BETWEEN 500 AND 599 THEN 1 ELSE 0 END) as s5xx,
        AVG(response_time_ms) as avg_response,
        AVG(word_count) as avg_words
      FROM urls WHERE crawl_id = ?
    `).get(crawlId) as any

    const issuesBySeverity = this.db.prepare(
      "SELECT severity, COUNT(*) as cnt FROM issues WHERE crawl_id = ? GROUP BY severity"
    ).all(crawlId) as Array<{ severity: string; cnt: number }>

    const topIssues = this.db.prepare(
      'SELECT issue_type, COUNT(*) as cnt FROM issues WHERE crawl_id = ? GROUP BY issue_type ORDER BY cnt DESC LIMIT 10'
    ).all(crawlId) as Array<{ issue_type: string; cnt: number }>

    // Build HTML report template with embedded SVG bar charts
    const html = this.buildReportHtml({
      crawlName: crawl.start_url,
      totalUrls: urlSummary.total_urls || 0,
      s2xx: urlSummary.s2xx || 0,
      s4xx: urlSummary.s4xx || 0,
      s5xx: urlSummary.s5xx || 0,
      avgResponse: Math.round(urlSummary.avg_response ?? 0),
      avgWords: Math.round(urlSummary.avg_words ?? 0),
      issuesBySeverity,
      topIssues,
      generatedAt: new Date().toISOString()
    })

    // Use Puppeteer to render PDF (same instance from Phase 5 js-renderer)
    let puppeteer: any
    try {
      puppeteer = require('puppeteer-core')
    } catch {
      throw new Error('Puppeteer not available. Install puppeteer-core for PDF reports.')
    }

    let browser: any
    try {
      // Try Electron's bundled Chrome first
      const electronPath = require.resolve('electron')
      const { execSync } = require('child_process')
      let chromePath = ''
      try {
        chromePath = String(execSync(`${electronPath} --get-process-start-args`, { encoding: 'utf8' }))?.trim() || ''
      } catch { /* fallback */ }

      if (!chromePath && process.env.CHROME_PATH) {
        chromePath = process.env.CHROME_PATH
      }

      if (chromePath) {
        browser = await puppeteer.launch({ executablePath: chromePath, headless: true })
      } else {
        browser = await puppeteer.launch({ headless: true })
      }

      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle0' })
      await page.setViewport({ width: 1200, height: 800 })

      const outputDir = path.join(this.getDataDir(), 'reports')
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
      const filePath = path.join(outputDir, `report-${crawlId}.pdf`)

      await page.pdf({ path: filePath, format: 'A4', printBackground: true, margin: { top: '2cm', bottom: '2cm', left: '2cm', right: '2cm' } })
      return { filePath, pageCount: 1 } // Page count would need post-generation; approximate for now.
    } finally {
      if (browser) await browser.close().catch(() => {})
    }
  }

  private buildReportHtml(data: any): string {
    const issuesBars = data.issuesBySeverity.map((i: any) => {
      const color = i.severity === 'critical' ? '#ef4444' : i.severity === 'high' ? '#f97316' : i.severity === 'medium' ? '#eab308' : '#3b82f6'
      return `<rect x="10" y="${15 + data.issuesBySeverity.indexOf(i) * 35}" width="${Math.max(10, i.cnt * 3)}" height="25" fill="${color}"/>
        <text x="${Math.max(50, i.cnt * 3 + 15)}" y="${15 + data.issuesBySeverity.indexOf(i) * 35 + 17}" fill="#fff" font-size="12" font-family="system-ui">${i.severity}: ${i.cnt}</text>`
    }).join('\n')

    const topIssuesRows = data.topIssues.map((t: any) =>
      `<tr><td style="padding:6px;border-bottom:1px solid #eee;text-align:left;font-family:monospace">${this.escapeHtml(t.issue_type)}</td><td style="padding:6px;border-bottom:1px solid #eee;text-align:center">${t.cnt}</td></tr>`
    ).join('')

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body{font-family:system-ui,sans-serif;margin:0;padding:40px;color:#1a1a1a;background:#fff}
h1{margin:0 0 8px;font-size:28px;color:#0f172a}
h2{margin-top:32px;font-size:18px;color:#334155;border-bottom:2px solid #e2e8f0;padding-bottom:8px}
p.lead{color:#64748b;font-size:14px;margin:0 0 24px}
.grid{display:flex;gap:16px;margin:24px 0}
.card{flex:1;background:#f8fafc;border-radius:8px;padding:16px;border:1px solid #e2e8f0}
.card h3{margin:0 0 8px;font-size:12px;text-transform:uppercase;color:#94a3b8;letter-spacing:0.05em}
.card .val{font-size:28px;font-weight:700;color:#0f172a}
table{width:100%;border-collapse:collapse;margin-top:8px}
thead th{text-align:left;padding:8px 6px;border-bottom:2px solid #cbd5e1;font-size:12px;text-transform:uppercase;color:#64748b}
@media print{body{padding:0}}
</style></head><body>
<h1>CrawlDesk — SEO Audit Report</h1>
<p class="lead">Generated ${new Date(data.generatedAt).toLocaleString()} for ${this.escapeHtml(data.crawlName)}</p>

<div class="grid">
  <div class="card"><h3>Total URLs</h3><div class="val">${data.totalUrls}</div></div>
  <div class="card"><h3>OK (2xx)</h3><div class="val" style="color:#10b981">${data.s2xx}</div></div>
  <div class="card"><h3>Errors (4xx/5xx)</h3><div class="val" style="color:#ef4444">${(data.s4xx || 0) + (data.s5xx || 0)}</div></div>
  <div class="card"><h3>Avg Response</h3><div class="val">${data.avgResponse}ms</div></div>
</div>

<h2>Issues by Severity</h2>
<svg width="400" height="${Math.max(60, data.issuesBySeverity.length * 35 + 10)}" viewBox="0 0 400 ${Math.max(60, data.issuesBySeverity.length * 35 + 10)}" xmlns="http://www.w3.org/2000/svg">
${issuesBars}
</svg>

<h2>Top Issues</h2>
<table>
<thead><tr><th>Issue Type</th><th style="text-align:center">Count</th></tr></thead>
<tbody>${topIssuesRows}</tbody>
</table>
</body></html>`
  }

  private getDataDir(): string {
    try {
      const { app } = require('electron')
      return app.getPath('userData')
    } catch {
      return process.cwd()
    }
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
}
