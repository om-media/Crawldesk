import type { Database as DB } from 'better-sqlite3'
import type { SitemapUrl, ParsedSitemap } from '../../worker/engine/sitemap'

/**
 * Phase 4 post-crawl analysis: compare sitemap-declared URLs against crawled URLs.
 */
export class SitemapComparisonAnalyzer {
  constructor(private db: DB) {}

  analyze(crawlId: string): void {
    const sitemapUrlsSet = this.getSitemapUrls(crawlId)
    if (sitemapUrlsSet.size === 0) return // No sitemaps parsed — nothing to compare

    const crawledRows = this.db.prepare(`
      SELECT normalized_url, url, status_code, indexability FROM urls WHERE crawl_id = ?
    `).all(crawlId) as Array<{ normalized_url: string; url: string; status_code?: number | null; indexability?: string | null }>

    const crawledNormToRow = new Map<string, typeof crawledRows[0]>()
    for (const row of crawledRows) {
      const norm = row.normalized_url.toLowerCase().replace(/\/+$/, '')
      crawledNormToRow.set(norm, row)
    }

    const now = new Date().toISOString()
    const insertIssue = this.db.prepare(`
      INSERT INTO issues (id, crawl_id, url_id, url, issue_type, severity, message, recommendation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    // Build sets for diff operations
    const crawledNorms = new Set(crawledNormToRow.keys())
    const sitemapNorms = new Set(sitemapUrlsSet)

    // 1. Sitemap - Crawled = URLs in sitemap but not visited
    for (const sUrl of sitemapNorms) {
      if (!crawledNorms.has(sUrl)) {
        insertIssue.run(
          crypto.randomUUID(), crawlId, '', sUrl,
          'sitemap_url_not_crawled', 'low',
          `URL ${sUrl} is in the sitemap but was not crawled.`,
          "Check why this URL wasn't crawled — it may be blocked by robots.txt or unreachable.",
          now
        )
      }
    }

    // 2. Crawled indexable pages NOT in any sitemap
    for (const [norm, row] of crawledNormToRow.entries()) {
      if (row.indexability === 'indexable' && !sitemapNorms.has(norm)) {
        insertIssue.run(
          crypto.randomUUID(), crawlId, '', row.url,
          'crawled_url_missing_from_sitemap', 'medium',
          `Page ${row.url} was crawled but is not in any submitted sitemap.`,
          'Add important pages to your XML sitemap for faster discovery by search engines.',
          now
        )
      }
    }

    // 3. Intersection with non-200 = sitemap listing dead/broken pages
    for (const sUrl of sitemapNorms) {
      const row = crawledNormToRow.get(sUrl)
      if (row && row.status_code && (row.status_code < 200 || row.status_code >= 400)) {
        insertIssue.run(
          crypto.randomUUID(), crawlId, '', sUrl,
          'sitemap_url_error_status', 'high',
          `Sitemap URL ${sUrl} returned HTTP ${row.status_code}.`,
          'Fix the broken URL or remove it from your sitemap if no longer valid.',
          now
        )
      }
    }
  }

  /** Get all URLs declared across urlset-type sitemaps (not index entries) */
  private getSitemapUrls(crawlId: string): Set<string> {
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
}
