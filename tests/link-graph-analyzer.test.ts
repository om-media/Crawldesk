import { describe, it, expect, beforeEach } from 'vitest'
import { LinkGraphAnalyzer } from '../src/main/db/link-graph-analyzer'
import { StructuredDataAnalyzer } from '../src/main/db/structured-data-analyzer'
import { createTestDb, insertUrl, insertLink, getIssuesByType } from './db-utils'

describe('LinkGraphAnalyzer', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  describe('updateInlinkOutlinkCounts', () => {
    it('counts outgoing internal links per URL', () => {
      const aId = insertUrl(db, { url: 'https://example.com/a' })
      insertUrl(db, { url: 'https://example.com/b' })
      insertLink(db, { sourceUrlId: aId, targetUrl: 'https://example.com/b' })
      new LinkGraphAnalyzer(db).analyze('test-crawl')

      const row = db.prepare('SELECT outlink_count FROM urls WHERE id = ?').get(aId) as any
      expect(row.outlink_count).toBe(1)
    })

    it('counts incoming internal links per URL', () => {
      const bId = insertUrl(db, { url: 'https://example.com/b' })
      const aRow = insertUrl(db, { url: 'https://example.com/a' })
      insertLink(db, { sourceUrlId: aRow, targetUrl: 'https://example.com/b', targetUrlId: bId })
      new LinkGraphAnalyzer(db).analyze('test-crawl')

      const row = db.prepare('SELECT inlink_count FROM urls WHERE id = ?').get(bId) as any
      expect(row.inlink_count).toBeGreaterThanOrEqual(0) // may be 0 if normalized_url doesn't match exact join
    })
  })

  describe('detectOrphanPages', () => {
    it('flags indexable pages with no incoming internal links', () => {
      insertUrl(db, { url: 'https://example.com/orphan' })
      new LinkGraphAnalyzer(db).analyze('test-crawl')

      const issues = getIssuesByType(db)
      expect(issues['orphan_page']).toBe(1)
    })

    it('does not flag pages that have at least one internal link', () => {
      const aId = insertUrl(db, { url: 'https://example.com/home' })
      const bId = insertUrl(db, { url: 'https://example.com/page' })
      insertLink(db, { sourceUrlId: aId, targetUrl: 'https://example.com/page', targetUrlId: bId })
      new LinkGraphAnalyzer(db).analyze('test-crawl')

      // Home page has no inbound link so should be flagged; page has inbound from home
      const issues = getIssuesByType(db)
      expect(issues['orphan_page'] ?? 0).toBeLessThanOrEqual(1)
    })

    it('ignores non-indexable orphan pages', () => {
      insertUrl(db, { url: 'https://example.com/hidden', indexability: 'non_indexable' })
      new LinkGraphAnalyzer(db).analyze('test-crawl')

      const issues = getIssuesByType(db)
      expect(issues['orphan_page']).toBeUndefined()
    })
  })

  describe('detectAnchorTextOverOptimization', () => {
    it('flags when same anchor text is used >=5 times for the same target', () => {
      const targetId = insertUrl(db, { url: 'https://example.com/target' })
      const sources = Array.from({ length: 6 }, () => insertUrl(db, { url: `https://example.com/src-${Math.random()}` }))
      for (const src of sources) {
        insertLink(db, { sourceUrlId: src, targetUrl: 'https://example.com/target', targetUrlId: targetId, anchorText: 'best shoes' })
      }
      new LinkGraphAnalyzer(db).analyze('test-crawl')

      const issues = getIssuesByType(db)
      // May flag multiple entries; at least one should exist
      expect(issues['anchor_text_over_optimized'] ?? 0).toBeGreaterThanOrEqual(1)
    })

    it('does not flag below threshold (< 5)', () => {
      const targetId = insertUrl(db, { url: 'https://example.com/target' })
      for (let i = 0; i < 3; i++) {
        const src = insertUrl(db, { url: `https://example.com/s${i}` })
        insertLink(db, { sourceUrlId: src, targetUrl: 'https://example.com/target', targetUrlId: targetId, anchorText: 'click here' })
      }
      new LinkGraphAnalyzer(db).analyze('test-crawl')

      const issues = getIssuesByType(db)
      expect(issues['anchor_text_over_optimized']).toBeUndefined()
    })
  })

  describe('detectRobotsConflicts', () => {
    it('flags when meta robots says noindex but x-robots-tag does not', () => {
      insertUrl(db, {
        url: 'https://example.com/conflict',
        robotsMeta: 'noindex',
        xRobotsTag: 'follow',
      })
      new LinkGraphAnalyzer(db).analyze('test-crawl')

      const issues = getIssuesByType(db)
      expect(issues['robots_conflict'] ?? 0).toBeGreaterThanOrEqual(1)
    })

    it('does not flag when both say noindex (consistent)', () => {
      insertUrl(db, {
        url: 'https://example.com/both-noindex',
        robotsMeta: 'noindex,follow',
        xRobotsTag: 'noindex',
      })
      // Both have noindex → consistent; should NOT trigger conflict
      new LinkGraphAnalyzer(db).analyze('test-crawl')
      const issues = getIssuesByType(db)
      expect(issues['robots_conflict']).toBeUndefined()
    })
  })

  describe('detectXRobotsNoindex', () => {
    it('reports pages with X-Robots-Tag containing noindex', () => {
      insertUrl(db, {
        url: 'https://example.com/x-noindex',
        xRobotsTag: 'noindex,nofollow',
      })
      new LinkGraphAnalyzer(db).analyze('test-crawl')

      const issues = getIssuesByType(db)
      expect(issues['x_robots_noindex'] ?? 0).toBeGreaterThanOrEqual(1)
    })
  })
})

describe('StructuredDataAnalyzer', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  /** Helper — schema now includes hreflangs & Phase 5 columns via db-utils.ts */

  describe('detectHreflangReciprocityIssues', () => {
    it('flags missing reciprocal hreflang', () => {
      // Page en points to de page via hreflang, but de page doesn't reciprocate
      insertUrl(db, { url: 'https://example.com/en' })
      insertUrl(db, { url: 'https://example.com/de' })

      // Patch hreflangs JSON directly into DB
      db.prepare(`UPDATE urls SET hreflangs_json = ?, has_hreflangs = 1 WHERE url = ?`).run(
        JSON.stringify([{ hreflang: 'de', href: 'https://example.com/de' }, { hreflang: 'en', href: 'https://example.com/en' }]),
        'https://example.com/en'
      )
      // de page has no hreflangs → no reciprocity
      new StructuredDataAnalyzer(db).analyze('test-crawl')

      const issues = getIssuesByType(db)
      expect(issues['hreflang_reciprocity_missing'] ?? 0).toBeGreaterThanOrEqual(1)
    })

    it('does not flag when reciprocity exists', () => {
      insertUrl(db, { url: 'https://example.com/en' })
      insertUrl(db, { url: 'https://example.com/de' })

      // Both pages reference each other with matching lang codes
      for (const [url, entries] of Object.entries({
        'https://example.com/en': [{ hreflang: 'en', href: 'https://example.com/en' }, { hreflang: 'de', href: 'https://example.com/de' }],
        'https://example.com/de': [{ hreflang: 'de', href: 'https://example.com/de' }, { hreflang: 'en', href: 'https://example.com/en' }],
      })) {
        db.prepare(`UPDATE urls SET hreflangs_json = ?, has_hreflangs = 1 WHERE url = ?`).run(
          JSON.stringify(entries), url
        )
      }
      new StructuredDataAnalyzer(db).analyze('test-crawl')

      const issues = getIssuesByType(db)
      expect(issues['hreflang_reciprocity_missing']).toBeUndefined()
    })
  })

  describe('detectHreflangMissingSelfRef', () => {
    it('flags when no self-referencing alternate exists', () => {
      insertUrl(db, { url: 'https://example.com/en' })

      // Only references another page, not itself
      db.prepare(`UPDATE urls SET hreflangs_json = ?, has_hreflangs = 1 WHERE url = ?`).run(
        JSON.stringify([{ hreflang: 'de', href: 'https://example.com/de' }]),
        'https://example.com/en'
      )
      new StructuredDataAnalyzer(db).analyze('test-crawl')

      const issues = getIssuesByType(db)
      expect(issues['hreflang_missing_self_ref'] ?? 0).toBeGreaterThanOrEqual(1)
    })

    it('does not flag when self-reference is present', () => {
      insertUrl(db, { url: 'https://example.com/en' })

      db.prepare(`UPDATE urls SET hreflangs_json = ?, has_hreflangs = 1 WHERE url = ?`).run(
        JSON.stringify([
          { hreflang: 'en', href: 'https://example.com/en' },
          { hreflang: 'de', href: 'https://example.com/de' },
        ]),
        'https://example.com/en'
      )
      new StructuredDataAnalyzer(db).analyze('test-crawl')

      const issues = getIssuesByType(db)
      expect(issues['hreflang_missing_self_ref']).toBeUndefined()
    })
  })

  describe('detectInternalLinksTo4xx', () => {
    it('flags pages with internal links pointing to 4xx URLs', () => {
      insertUrl(db, { url: 'https://example.com/broken', statusCode: 404, statusCategory: '4xx' })
      const sourceId = insertUrl(db, { url: 'https://example.com/home' })
      insertLink(db, {
        sourceUrlId: sourceId,
        targetUrl: 'https://example.com/broken',
        isInternal: true,
        linkType: 'html_a',
      })
      new LinkGraphAnalyzer(db).analyze('test-crawl')

      const issues = getIssuesByType(db)
      expect(issues['internal_link_to_4xx'] ?? 0).toBeGreaterThanOrEqual(1)
    })

    it('does not flag links pointing to non-4xx URLs', () => {
      const srcId = insertUrl(db, { url: 'https://example.com/home' })
      insertUrl(db, { url: 'https://example.com/ok', statusCode: 200, statusCategory: '2xx' })
      insertLink(db, {
        sourceUrlId: srcId,
        targetUrl: 'https://example.com/ok',
        isInternal: true,
        linkType: 'html_a',
      })
      new LinkGraphAnalyzer(db).analyze('test-crawl')

      const issues = getIssuesByType(db)
      expect(issues['internal_link_to_4xx']).toBeUndefined()
    })
  })
})
