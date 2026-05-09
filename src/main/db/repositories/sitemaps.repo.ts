import Database from 'better-sqlite3'
import type { SitemapUrl, SitemapIndexEntry } from '../../../worker/engine/sitemap'

interface SitemapRecord {
  id: string
  crawl_id: string
  sitemap_url: string
  status_code?: number | null
  discovered_from?: string | null
  url_count: number
  is_index: boolean
  parent_sitemap_url?: string | null
  entries_json?: string | null
  created_at: string
}

export class SitemapsRepo {
  private insertStmt!: Database.Statement

  constructor(private db: Database.Database) {
    this.insertStmt = this.db.prepare(`
      INSERT INTO sitemaps (id, crawl_id, sitemap_url, status_code, discovered_from, url_count,
        is_index, parent_sitemap_url, entries_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
  }

  /** Insert a parsed sitemap record */
  upsert(data: {
    crawlId: string
    sitemapUrl: string
    statusCode?: number
    discoveredFrom?: string
    // For urlset sitemaps
    urls?: SitemapUrl[]
    // For sitemapindex
    indexEntries?: SitemapIndexEntry[]
    parentSitemapUrl?: string
  }): string {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const isIndex = !!(data.indexEntries && data.indexEntries.length > 0)
    let urlCount = 0
    let entriesJson: string | null = null

    if (isIndex) {
      urlCount = data.indexEntries!.length
      entriesJson = JSON.stringify(data.indexEntries)
    } else if (data.urls && data.urls.length > 0) {
      urlCount = data.urls.length
      entriesJson = JSON.stringify(data.urls)
    }

    this.insertStmt.run(
      id,
      data.crawlId,
      data.sitemapUrl,
      data.statusCode ?? null,
      data.discoveredFrom ?? null,
      urlCount,
      isIndex ? 1 : 0,
      data.parentSitemapUrl ?? null,
      entriesJson,
      now
    )
    return id
  }

  /** Get all sitemap-declared URLs (normalized lowercase) for a crawl */
  getSitemapUrls(crawlId: string): Set<string> {
    const rows = this.db.prepare(`
      SELECT entries_json FROM sitemaps
      WHERE crawl_id = ? AND is_index = 0
        AND entries_json IS NOT NULL AND entries_json != ''
    `).all(crawlId) as Array<{ entries_json: string }>

    const urls = new Set<string>()
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.entries_json) as SitemapUrl[]
        for (const u of parsed) {
          urls.add(u.loc.toLowerCase().replace(/\/+$/, ''))
        }
      } catch { /* skip invalid JSON */ }
    }
    return urls
  }

  /** List sitemap records for a crawl */
  list(crawlId: string): SitemapRecord[] {
    return this.db.prepare('SELECT * FROM sitemaps WHERE crawl_id = ? ORDER BY created_at')
      .all(crawlId) as SitemapRecord[]
  }

  /** Count of sitemaps discovered for a crawl */
  count(crawlId: string): number {
    const result = this.db.prepare(
      'SELECT COUNT(*) as total FROM sitemaps WHERE crawl_id = ?'
    ).get(crawlId) as { total: number }
    return result.total
  }
}
