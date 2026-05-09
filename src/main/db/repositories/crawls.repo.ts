import Database from 'better-sqlite3'
import type { Crawl, CrawlStatus, CrawlSettingsInput } from '../../../shared/types/crawl'

export class CrawlsRepo {
  constructor(private db: Database.Database) {}

  private makeUpdate(key: string, value: any): string {
    return `${key} = ${value === null ? 'NULL' : JSON.stringify(value)}`
  }

  create(input: { projectId: string; startUrl: string }, settings: CrawlSettingsInput): Crawl {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO crawls (id, project_id, start_url, status, created_at, updated_at)
        VALUES (?, ?, ?, 'created', ?, ?)
      `).run(id, input.projectId, input.startUrl, now, now)

      this.db.prepare(`
        INSERT INTO crawl_settings (crawl_id, max_urls, max_depth, concurrency, request_timeout_ms,
          respect_robots_txt, crawl_subdomains, check_external_links, crawl_external_links, user_agent,
          include_patterns_json, exclude_patterns_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        settings.maxUrls, settings.maxDepth, settings.concurrency, settings.requestTimeoutMs,
        settings.respectRobotsTxt ? 1 : 0,
        settings.crawlSubdomains ? 1 : 0,
        settings.checkExternalLinks ? 1 : 0,
        settings.crawlExternalLinks ? 1 : 0,
        settings.userAgent,
        JSON.stringify(settings.includePatterns),
        JSON.stringify(settings.excludePatterns)
      )
    })()
    return this.getById(id)!
  }

  updateStatus(crawlId: string, status: CrawlStatus, patch?: Partial<Pick<Crawl, 'error_code' | 'error_message'>>): void {
    const now = new Date().toISOString()
    const updates = [`status = '${status}'`, "updated_at = '" + now + "'"]
    if (status === 'running') updates.push("started_at = COALESCE(started_at, '" + now + "')")
    if (status === 'completed' || status === 'stopped' || status === 'failed') updates.push(`finished_at = '${now}'`)
    if (patch?.error_code !== undefined) updates.push(this.makeUpdate('error_code', patch.error_code))
    if (patch?.error_message !== undefined) updates.push(this.makeUpdate('error_message', patch.error_message))

    this.db.prepare(
      `UPDATE crawls SET ${updates.join(', ')} WHERE id = ?`
    ).run(crawlId)
  }

  get(crawlId: string): Crawl | null {
    return this.getById(crawlId)
  }

  listByProject(projectId: string): Crawl[] {
    return this.db.prepare(
      'SELECT * FROM crawls WHERE project_id = ? ORDER BY created_at DESC'
    ).all(projectId) as Crawl[]
  }

  updateCounters(crawlId: string, counters: Partial<Pick<Crawl, 'total_discovered' | 'total_queued' | 'total_completed' | 'total_failed' | 'total_blocked'>>): void {
    const now = new Date().toISOString()
    const sets: string[] = ["updated_at = '" + now + "'"]
    const params: any[] = []
    for (const [key, value] of Object.entries(counters)) {
      if (value !== undefined) {
        sets.push(`${key} = ?`)
        params.push(value)
      }
    }
    params.push(crawlId)
    if (sets.length > 1) {
      this.db.prepare(`UPDATE crawls SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    }
  }

  getSettings(crawlId: string): CrawlSettingsInput | null {
    const row = this.db.prepare(`
      SELECT * FROM crawl_settings WHERE crawl_id = ?
    `).get(crawlId) as any
    if (!row) return null
    return {
      maxUrls: row.max_urls,
      maxDepth: row.max_depth,
      concurrency: row.concurrency,
      requestTimeoutMs: row.request_timeout_ms,
      respectRobotsTxt: !!row.respect_robots_txt,
      crawlSubdomains: !!row.crawl_subdomains,
      checkExternalLinks: !!row.check_external_links,
      crawlExternalLinks: !!row.crawl_external_links,
      userAgent: row.user_agent,
      includePatterns: JSON.parse(row.include_patterns_json ?? '[]'),
      excludePatterns: JSON.parse(row.exclude_patterns_json ?? '[]')
    }
  }

  private getById(id: string): Crawl | null {
    const row = this.db.prepare(
      'SELECT * FROM crawls WHERE id = ?'
    ).get(id) as Crawl | undefined
    return row || null
  }
}
