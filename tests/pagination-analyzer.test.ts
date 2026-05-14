import { describe, it, expect, beforeEach } from 'vitest'
import { PaginationAnalyzer } from '../src/main/db/pagination-analyzer'
import { createTestDb, insertUrl, getIssuesByType } from './db-utils'

describe('PaginationAnalyzer', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  describe('detectBrokenPaginationChains — broken references', () => {
    it('flags rel=next pointing to a non-crawled URL', () => {
      insertUrl(db, {
        url: 'https://example.com/page/1',
        canonical: 'https://example.com/page/1',
        paginationNext: 'https://example.com/page/2',
      })
      new PaginationAnalyzer(db).analyze('test-crawl')
      const issues = getIssuesByType(db)
      expect(issues['pagination_broken_loop']).toBe(1)
    })

    it('flags rel=prev pointing to a non-crawled URL', () => {
      insertUrl(db, {
        url: 'https://example.com/page/3',
        canonical: 'https://example.com/page/3',
        paginationPrev: 'https://example.com/page/200', // doesn't exist
      })
      new PaginationAnalyzer(db).analyze('test-crawl')
      const issues = getIssuesByType(db)
      expect(issues['pagination_broken_loop']).toBe(1)
    })

    it('does not flag valid next/prev links between crawled pages', () => {
      insertUrl(db, {
        url: 'https://example.com/page/1',
        canonical: 'https://example.com/page/1',
        paginationNext: 'https://example.com/page/2',
      })
      insertUrl(db, {
        url: 'https://example.com/page/2',
        canonical: 'https://example.com/page/2',
        paginationPrev: 'https://example.com/page/1',
      })
      new PaginationAnalyzer(db).analyze('test-crawl')
      const issues = getIssuesByType(db)
      expect(issues['pagination_broken_loop']).toBeUndefined()
    })

    it('ignores non-paginated URLs (is_paginated=0)', () => {
      insertUrl(db, {
        url: 'https://example.com/static',
        canonical: 'https://example.com/static',
        isPaginated: false, // explicitly set to 0 even though no pagination data
      })
      new PaginationAnalyzer(db).analyze('test-crawl')
      const issues = getIssuesByType(db)
      expect(issues['pagination_broken_loop']).toBeUndefined()
    })

    it('no errors when crawl has zero paginated pages', () => {
      insertUrl(db, { url: 'https://example.com/' })
      insertUrl(db, { url: 'https://example.com/about' })
      expect(() => new PaginationAnalyzer(db).analyze('test-crawl')).not.toThrow()
      const issues = getIssuesByType(db)
      expect(Object.keys(issues)).toHaveLength(0)
    })
  })

  describe('detectBrokenPaginationChains — loop detection', () => {
    it('detects circular next chain A→B→C→A', () => {
      insertUrl(db, {
        url: 'https://example.com/a',
        canonical: 'https://example.com/a',
        paginationNext: 'https://example.com/b',
      })
      insertUrl(db, {
        url: 'https://example.com/b',
        canonical: 'https://example.com/b',
        paginationNext: 'https://example.com/c',
      })
      insertUrl(db, {
        url: 'https://example.com/c',
        canonical: 'https://example.com/c',
        paginationNext: 'https://example.com/a', // loops back to start
      })
      new PaginationAnalyzer(db).analyze('test-crawl')
      const issues = getIssuesByType(db)
      // All 3 pages should be flagged for being in a circular chain
      expect(issues['pagination_broken_loop']).toBeGreaterThanOrEqual(3)
    })

    it('does not flag linear chains without cycles', () => {
      insertUrl(db, {
        url: 'https://example.com/page/1',
        canonical: 'https://example.com/page/1',
        paginationNext: 'https://example.com/page/2',
      })
      insertUrl(db, {
        url: 'https://example.com/page/2',
        canonical: 'https://example.com/page/2',
        paginationPrev: 'https://example.com/page/1',
        paginationNext: 'https://example.com/page/3',
      })
      insertUrl(db, {
        url: 'https://example.com/page/3',
        canonical: 'https://example.com/page/3',
        paginationPrev: 'https://example.com/page/2',
      })
      new PaginationAnalyzer(db).analyze('test-crawl')
      const issues = getIssuesByType(db)
      expect(issues['pagination_broken_loop']).toBeUndefined()
    })
  })

  describe('detectMissingPaginationCanonical', () => {
    it('flags paginated page with no canonical tag', () => {
      insertUrl(db, {
        url: 'https://example.com/blog?page=2',
        canonical: null,
        paginationNext: 'https://example.com/blog?page=3',
        isPaginated: true,
      })
      new PaginationAnalyzer(db).analyze('test-crawl')
      const issues = getIssuesByType(db)
      expect(issues['missing_pagination_canonical']).toBe(1)
    })

    it('flags paginated page with mismatched canonical', () => {
      insertUrl(db, {
        url: 'https://example.com/blog?page=5',
        canonical: 'https://example.com/blog', // points to non-paginated version
        paginationNext: 'https://example.com/blog?page=6',
        isPaginated: true,
      })
      new PaginationAnalyzer(db).analyze('test-crawl')
      const issues = getIssuesByType(db)
      expect(issues['missing_pagination_canonical']).toBe(1)
    })

    it('does not flag paginated pages with self-referencing canonical', () => {
      insertUrl(db, {
        url: 'https://example.com/page/2',
        canonical: 'https://example.com/page/2',
        paginationPrev: 'https://example.com/page/1',
        paginationNext: 'https://example.com/page/3',
        isPaginated: true,
      })
      new PaginationAnalyzer(db).analyze('test-crawl')
      const issues = getIssuesByType(db)
      expect(issues['missing_pagination_canonical']).toBeUndefined()
    })
  })
})
