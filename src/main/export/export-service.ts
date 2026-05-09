import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import type { ExportUrlsInput, ExportIssuesInput, ExportLinksInput, ExportResult, ListUrlsFilters } from '../../shared/types/ipc'

export class ExportService {
  constructor(private db: Database.Database, private appDataDir: string) {}

  async exportUrls(input: ExportUrlsInput): Promise<ExportResult> {
    const whereClauses: string[] = ['crawl_id = ?']
    const params: any[] = [input.crawlId]

    if (input.filtered && input.filters) {
      this.applyUrlFilters(whereClauses, params, input.filters, input.crawlId)
    }

    const items = this.db.prepare(
      `SELECT url, status_code, indexability, title, title_length, meta_description, meta_description_length, h1, canonical, depth, response_time_ms, content_type FROM urls WHERE ${whereClauses.join(' AND ')} ORDER BY url ASC`
    ).all(...params) as Record<string, unknown>[]

    const dir = path.join(this.appDataDir, 'exports')
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, `urls-${Date.now()}.csv`)

    const rowCount = items.length
    const csvContent = this.toCsv(items)
    fs.writeFileSync(filePath, csvContent, 'utf8')
    return { filePath, rowCount }
  }

  exportIssues(input: ExportIssuesInput): ExportResult {
    const items = this.db.prepare(`
      SELECT url, issue_type, severity, message, recommendation FROM issues WHERE crawl_id = ? ORDER BY severity DESC, url ASC
    `).all(input.crawlId) as Record<string, unknown>[]

    const dir = path.join(this.appDataDir, 'exports')
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, `issues-${Date.now()}.csv`)

    const rowCount = items.length
    const csvContent = this.toCsv(items)
    fs.writeFileSync(filePath, csvContent, 'utf8')
    return { filePath, rowCount }
  }

  exportLinks(input: ExportLinksInput): ExportResult {
    const items = this.db.prepare(`
      SELECT source_url, target_url, anchor_text, link_type, is_internal, is_followed, rel FROM links WHERE crawl_id = ? ORDER BY source_url ASC
    `).all(input.crawlId) as Record<string, unknown>[]

    const dir = path.join(this.appDataDir, 'exports')
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, `links-${Date.now()}.csv`)

    const rowCount = items.length
    const csvContent = this.toCsv(items)
    fs.writeFileSync(filePath, csvContent, 'utf8')
    return { filePath, rowCount }
  }

  private toCsv(rows: Record<string, unknown>[]): string {
    if (!rows || rows.length === 0) return ''
    const headers = Object.keys(rows[0])
    const lines = [headers.join(',')]
    for (const row of rows) {
      const line = headers.map(h => this.escapeCsv(String(row[h] ?? ''))).join(',')
      lines.push(line)
    }
    return lines.join('\n')
  }

  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return '"' + value.replace(/"/g, '""') + '"'
    }
    return value
  }

  private applyUrlFilters(clauses: string[], params: any[], filters: ListUrlsFilters | undefined, crawlId: string): void {
    if (!filters) return
    if (filters.search) {
      clauses.push('(url LIKE ? OR title LIKE ? OR meta_description LIKE ? OR h1 LIKE ?)')
      const t = `%${filters.search}%`
      params.push(t, t, t, t)
    }
    if (filters.statusCategory) {
      clauses.push('status_category = ?')
      params.push(filters.statusCategory)
    }
    if (filters.indexability) {
      clauses.push('indexability = ?')
      params.push(filters.indexability)
    }
    if (filters.issueType) {
      clauses.push(`id IN (SELECT url_id FROM issues WHERE crawl_id = ? AND issue_type = ?)`)
      params.push(crawlId, filters.issueType)
    }
    if (filters.contentType) {
      clauses.push('content_type LIKE ?')
      params.push(`%${filters.contentType}%`)
    }
    if (filters.minDepth !== undefined) {
      clauses.push('depth >= ?')
      params.push(filters.minDepth)
    }
    if (filters.maxDepth !== undefined) {
      clauses.push('depth <= ?')
      params.push(filters.maxDepth)
    }
  }
}
