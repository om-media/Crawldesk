import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { SitemapComparisonAnalyzer } from '../src/main/db/sitemap-comparison-analyzer'
import { SCHEMA_SQL, insertUrl, getIssuesByType } from './db-utils'

// Extend schema with sitemaps table + Phase 4 columns
const FULL_SCHEMA = `
${SCHEMA_SQL}
CREATE TABLE IF NOT EXISTS sitemaps (
  id TEXT PRIMARY KEY,
  crawl_id TEXT NOT NULL,
  sitemap_url TEXT NOT NULL,
  status_code INTEGER,
  discovered_from TEXT,
  url_count INTEGER DEFAULT 0,
  is_index INTEGER DEFAULT 0,
  parent_sitemap_url TEXT,
  entries_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

/** Insert a sitemap record */
function insertSitemap(db: typeof createDb, data: {
  urls?: Array<{ loc: string; lastmod?: string | null; changefreq?: string | null; priority?: number | null }>;
  indexEntries?: Array<{ loc: string; lastmod?: string | null }>;
}): void {
  const isIndex = !!(data.indexEntries && data.indexEntries.length > 0)
  let entriesJson: string | null = null
  if (isIndex) {
    entriesJson = JSON.stringify(data.indexEntries!)
  } else if (data.urls) {
    entriesJson = JSON.stringify(data.urls)
  }

  db.prepare(`
    INSERT INTO sitemaps (id, crawl_id, sitemap_url, discovered_from, url_count, is_index, entries_json, created_at)
    VALUES (?, ?, ?, 'robots.txt', ?, ?, ?, datetime('now'))
  `).run(
    crypto.randomUUID(),
    'test-crawl',
    'https://example.com/sitemap.xml',
    isIndex ? (data.indexEntries!.length) : (data.urls?.length ?? 0),
    isIndex ? 1 : 0,
    entriesJson
  )
}

function createDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(FULL_SCHEMA)
  return db
}

describe('SitemapComparisonAnalyzer', () => {
  let db: ReturnType<typeof createDb>

  beforeEach(() => {
    db = createDb()
  })

  describe('sitemap_url_not_crawled', () => {
    it('flags URLs in sitemap that were never crawled', () => {
      insertSitemap(db, { urls: [{ loc: 'https://example.com/uncrawled' }] })
      // No URL row inserted for /uncrawled
      new SitemapComparisonAnalyzer(db).analyze('test-crawl')

      const issues = getIssuesByType(db)
      expect(issues['sitemap_url_not_crawled']).toBeGreaterThanOrEqual(1)
    })

    it('does not flag sitemap URLs that exist in crawl results', () => {
      insertUrl(db, { url: 'https://example.com/page' })
      insertSitemap(db, { urls: [{ loc: 'https://example.com/page' }] })
      new SitemapComparisonAnalyzer(db).analyze('test-crawl')

      const issues = getIssuesByType(db)
      expect(issues['sitemap_url_not_crawled']).toBeUndefined()
    })
  })

  describe('crawled_url_missing_from_sitemap', () => {
    it('flags indexable pages not listed in any sitemap', () => {
      insertUrl(db, { url: 'https://example.com/orphan-page' })
      // No sitemap entries at all → skip comparison early (returns when sitemap set is empty)
      // We need at least one sitemap URL to trigger the check
      insertSitemap(db, { urls: [{ loc: 'https://example.com/other' }] })
      new SitemapComparisonAnalyzer(db).analyze('test-crawl')

      const issues = getIssuesByType(db)
      expect(issues['crawled_url_missing_from_sitemap'] ?? 0).toBeGreaterThanOrEqual(1)
    })

    it('does not flag non-indexable pages missing from sitemap', () => {
      insertUrl(db, { url: 'https://example.com/hidden', indexability: 'non_indexable' })
      insertSitemap(db, { urls: [{ loc: 'https://example.com/other' }] })
      new SitemapComparisonAnalyzer(db).analyze('test-crawl')

      const issues = getIssuesByType(db)
      expect(issues['crawled_url_missing_from_sitemap']).toBeUndefined()
    })
  })

  describe('sitemap_url_error_status', () => {
    it('flags sitemap URLs that returned HTTP errors', () => {
      insertUrl(db, { url: 'https://example.com/broken', statusCode: 404 })
      insertSitemap(db, { urls: [{ loc: 'https://example.com/broken' }] })
      new SitemapComparisonAnalyzer(db).analyze('test-crawl')

      const issues = getIssuesByType(db)
      expect(issues['sitemap_url_error_status'] ?? 0).toBeGreaterThanOrEqual(1)
    })

    it('does not flag 200 responses', () => {
      insertUrl(db, { url: 'https://example.com/ok', statusCode: 200 })
      insertSitemap(db, { urls: [{ loc: 'https://example.com/ok' }] })
      new SitemapComparisonAnalyzer(db).analyze('test-crawl')

      const issues = getIssuesByType(db)
      expect(issues['sitemap_url_error_status']).toBeUndefined()
    })

    it('does not fire when no sitemaps are present', () => {
      // No sitemaps → early return in analyzer
      new SitemapComparisonAnalyzer(db).analyze('test-crawl')
      const issues = getIssuesByType(db)
      expect(Object.keys(issues)).toHaveLength(0)
    })
  })
})
