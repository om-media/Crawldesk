// Feature 4.2 — Sitemap Comparison Detector (modular version)
// Compares sitemap-declared URLs against crawled URLs; generates issues for discrepancies.

import Database from 'better-sqlite3'
import type { IssueRecordInput } from '../../../shared/types/issue'

export class SitemapComparisonDetector {
  constructor(private db: Database.Database) {}

  detect(crawlId: string): IssueRecordInput[] {
    const issues: IssueRecordInput[] = []
    issues.push(...this.detectSitemapUrlsNotCrawled(crawlId))
    issues.push(...this.detectCrawledUrlsMissingFromSitemap(crawlId))
    issues.push(...this.detectSitemapUrlErrorStatus(crawlId))
    return issues
  }

  private detectSitemapUrlsNotCrawled(crawlId: string): IssueRecordInput[] {
    // Get all sitemap entries
    const sitemaps = this.db.prepare(
      "SELECT entries_json FROM sitemaps WHERE crawl_id = ? AND entries_json IS NOT NULL"
    ).all(crawlId) as Array<{ entries_json: string }>

    if (!sitemaps.length) return []

    // Build set of declared sitemap URLs
    const sitemapUrls = new Set<string>()
    for (const sm of sitemaps) {
      try {
        const entries = JSON.parse(sm.entries_json) as Array<{ loc?: string }> | Record<string, any>
        if (Array.isArray(entries)) {
          for (const e of entries) if (e?.loc) sitemapUrls.add(e.loc.toLowerCase())
        }
      } catch { /* skip malformed */ }
    }

    // Build set of crawled normalized URLs
    const crawledUrls = new Set(
      this.db.prepare('SELECT normalized_url FROM urls WHERE crawl_id = ?').all(crawlId)
        .map((r: any) => r.normalized_url as string).filter(Boolean)
    )

    const notCrawled = [...sitemapUrls].filter(u => !crawledUrls.has(u))
    return notCrawled.slice(0, 500).map(url => ({
      crawlId,
      url,
      issue_type: 'sitemap_url_not_crawled',
      severity: 'low' as const,
      message: `URL ${url} is in the sitemap but was not crawled.`,
      recommendation: 'Check why this URL wasn\'t crawled — it may be blocked by robots.txt or unreachable.'
    }))
  }

  private detectCrawledUrlsMissingFromSitemap(crawlId: string): IssueRecordInput[] {
    // Get all sitemap declared URLs
    const sitemaps = this.db.prepare(
      "SELECT entries_json FROM sitemaps WHERE crawl_id = ? AND entries_json IS NOT NULL"
    ).all(crawlId) as Array<{ entries_json: string }>

    if (!sitemaps.length) return []

    const sitemapUrls = new Set<string>()
    for (const sm of sitemaps) {
      try {
        const entries = JSON.parse(sm.entries_json) as Array<{ loc?: string }> | Record<string, any>
        if (Array.isArray(entries)) {
          for (const e of entries) if (e?.loc) sitemapUrls.add(e.loc.toLowerCase())
        }
      } catch { /* skip */ }
    }

    // Indexable pages NOT in any sitemap
    const missing = this.db.prepare(`
      SELECT u.id, u.url FROM urls u
      WHERE u.crawl_id = ? AND u.indexability = 'indexable' AND u.status_code BETWEEN 200 AND 299
    `).all(crawlId) as Array<{ id: string; url: string }>

    return missing.filter(u => !sitemapUrls.has(u.url.toLowerCase()))
      .slice(0, 500)
      .map(u => ({
        crawlId,
        urlId: u.id,
        url: u.url,
        issue_type: 'crawled_url_missing_from_sitemap',
        severity: 'medium' as const,
        message: `Page ${u.url} was crawled but is not in any submitted sitemap.`,
        recommendation: 'Add important pages to your XML sitemap for faster discovery by search engines.'
      }))
  }

  private detectSitemapUrlErrorStatus(crawlId: string): IssueRecordInput[] {
    // URLs that are both in sitemaps AND returned error status codes
    const errorPages = this.db.prepare(`
      SELECT u.id, u.url, u.status_code FROM urls u
      WHERE u.crawl_id = ? AND (u.status_code >= 400 OR u.status_code IS NULL)
    `).all(crawlId) as Array<{ id: string; url: string; status_code?: number | null }>

    if (!errorPages.length) return []

    // Check which ones are declared in sitemaps
    const sitemaps = this.db.prepare(
      "SELECT entries_json FROM sitemaps WHERE crawl_id = ? AND entries_json IS NOT NULL"
    ).all(crawlId) as Array<{ entries_json: string }>

    if (!sitemaps.length) return []

    const sitemapUrls = new Set<string>()
    for (const sm of sitemaps) {
      try {
        const entries = JSON.parse(sm.entries_json) as Array<{ loc?: string }>
        if (Array.isArray(entries)) for (const e of entries) if (e?.loc) sitemapUrls.add(e.loc.toLowerCase())
      } catch {}
    }

    return errorPages.filter(u => sitemapUrls.has(u.url.toLowerCase())).map(u => ({
      crawlId,
      urlId: u.id,
      url: u.url,
      issue_type: 'sitemap_url_error_status',
      severity: 'high' as const,
      message: `Sitemap URL ${u.url} returned HTTP ${u.status_code ?? 'unknown'}.`,
      recommendation: 'Fix the broken URL or remove it from your sitemap if no longer valid.'
    }))
  }
}
