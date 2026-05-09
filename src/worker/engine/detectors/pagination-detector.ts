// Feature 2.4 — Pagination Detector (modular inline version)
// Detects broken pagination chains and missing canonical on paginated pages.

import Database from 'better-sqlite3'
import type { IssueRecordInput } from '../../../shared/types/issue'

export class PaginationDetector {
  constructor(private db: Database.Database) {}

  detect(crawlId: string): IssueRecordInput[] {
    const issues: IssueRecordInput[] = []
    issues.push(...this.detectBrokenPaginationChains(crawlId))
    issues.push(...this.detectMissingPaginationCanonical(crawlId))
    return issues
  }

  private detectBrokenPaginationChains(crawlId: string): IssueRecordInput[] {
    // Build set of all crawled normalized URLs for quick lookup
    const crawledUrls = new Set(
      this.db.prepare('SELECT normalized_url FROM urls WHERE crawl_id = ?').all(crawlId)
        .map((r: any) => r.normalized_url as string).filter(Boolean)
    )

    // Find paginated pages whose next/prev point to non-crawled URLs
    const pages = this.db.prepare(`
      SELECT u.id, u.url, u.pagination_next, u.pagination_prev
      FROM urls u WHERE u.crawl_id = ? AND (u.pagination_next IS NOT NULL OR u.pagination_prev IS NOT NULL)
    `).all(crawlId) as Array<{ id: string; url: string; pagination_next?: string | null; pagination_prev?: string | null }>

    const issues: IssueRecordInput[] = []
    for (const p of pages) {
      if (p.pagination_next && !crawledUrls.has(p.pagination_next.toLowerCase())) {
        issues.push({
          crawlId,
          urlId: p.id,
          url: p.url,
          issue_type: 'broken_pagination_chain',
          severity: 'medium' as const,
          message: `Pagination "next" link points to uncrawled URL: ${p.pagination_next}`,
          recommendation: 'Verify the next page exists and is accessible to crawlers.'
        })
      }
      if (p.pagination_prev && !crawledUrls.has(p.pagination_prev.toLowerCase())) {
        issues.push({
          crawlId,
          urlId: p.id,
          url: p.url,
          issue_type: 'broken_pagination_chain',
          severity: 'medium' as const,
          message: `Pagination "prev" link points to uncrawled URL: ${p.pagination_prev}`,
          recommendation: 'Verify the previous page exists and is accessible to crawlers.'
        })
      }
    }
    return issues
  }

  private detectMissingPaginationCanonical(crawlId: string): IssueRecordInput[] {
    // Paginated pages without canonical tag
    const pages = this.db.prepare(`
      SELECT u.id, u.url FROM urls u WHERE u.crawl_id = ? AND u.is_paginated = 1 AND (u.canonical IS NULL OR u.canonical = '')
    `).all(crawlId) as Array<{ id: string; url: string }>

    return pages.map(p => ({
      crawlId,
      urlId: p.id,
      url: p.url,
      issue_type: 'missing_pagination_canonical',
      severity: 'low' as const,
      message: 'Paginated page missing canonical tag.',
      recommendation: 'Set self-referencing canonical on paginated pages, or point all to the main listing page.'
    }))
  }
}
