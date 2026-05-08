import Database from 'better-sqlite3'
import type { UrlRecord, PageResult } from '../../../shared/types/url'
import type { ListUrlsInput, PaginatedResult, UrlSummary } from '../../../shared/types/ipc'
import { getIndexability } from './url-utils'

export class UrlsRepo {
  private upsertStmt!: Database.Statement
  private insertLinkStmt!: Database.Statement
  private insertIssueStmt!: Database.Statement

  constructor(private db: Database.Database) {
    // Prepare statements once at construction for better performance during bulk inserts
    this.upsertStmt = this.db.prepare(`
      INSERT INTO urls (id, crawl_id, url, normalized_url, final_url, status_code, status_category, content_type,
        content_length, is_internal, is_crawlable, indexability, indexability_reason, title, title_length,
        meta_description, meta_description_length, h1, h1_count, canonical, robots_meta, x_robots_tag,
        depth, response_time_ms, word_count, content_hash, discovered_from_url, fetch_error_code,
        fetch_error_message, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(crawl_id, normalized_url) DO UPDATE SET
        final_url = excluded.final_url,
        status_code = excluded.status_code,
        status_category = excluded.status_category,
        content_type = excluded.content_type,
        title = excluded.title,
        title_length = excluded.title_length,
        meta_description = excluded.meta_description,
        meta_description_length = excluded.meta_description_length,
        h1 = excluded.h1,
        h1_count = excluded.h1_count,
        canonical = excluded.canonical,
        robots_meta = excluded.robots_meta,
        x_robots_tag = excluded.x_robots_tag,
        response_time_ms = excluded.response_time_ms,
        word_count = excluded.word_count,
        content_hash = excluded.content_hash,
        indexability = excluded.indexability,
        indexability_reason = excluded.indexability_reason,
        updated_at = excluded.updated_at
    `)

    this.insertLinkStmt = this.db.prepare(`
      INSERT OR IGNORE INTO links (id, crawl_id, source_url_id, source_url, target_url, normalized_target_url, anchor_text, link_type, is_internal, is_followed, rel, discovered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    this.insertIssueStmt = this.db.prepare(`
      INSERT INTO issues (id, crawl_id, url_id, url, issue_type, severity, message, recommendation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
  }

  upsertUrl(result: PageResult): void {
    const now = new Date().toISOString()
    // Build link records too
    if (result.links && result.links.length > 0) {
      for (const link of result.links) {
        const normalizedTarget = this.normalizeForDb(link.targetUrl, result.finalUrl || result.url)
        this.insertLinkStmt.run(
          crypto.randomUUID(),
          result.crawlId,
          result.urlId,
          result.url,
          link.targetUrl,
          normalizedTarget,
          link.anchorText ?? null,
          link.linkType,
          result.isInternal ? 1 : 0,
          !(link.rel && /\bnofollow\b/i.test(link.rel)) ? 1 : 0,
          link.rel ?? null,
          now
        )
      }
    }
  }

  bulkUpsertUrls(results: PageResult[]): void {
    const insert = this.db.transaction((items: typeof results) => {
      const now = new Date().toISOString()
      for (const r of items) {
        // Upsert URL row using pre-prepared statement
        this.upsertStmt.run(
          r.urlId, r.crawlId, r.url, r.normalizedUrl,
          r.finalUrl ?? null,
          r.statusCode ?? null,
          this.categoryForCode(r.statusCode),
          r.contentType ?? null,
          r.contentLength ?? null,
          r.isInternal ? 1 : 0,
          (r.fetchErrorCode == null && !r.skippedReason) ? 1 : 0,
          this.resolveIndexability(r),
          this.resolveIndexabilityReason(r),
          r.seo?.title ?? null, r.seo?.titleLength ?? null,
          r.seo?.metaDescription ?? null, r.seo?.metaDescriptionLength ?? null,
          r.seo?.h1 ?? null, r.seo?.h1Count ?? 0,
          r.seo?.canonical ?? null,
          r.seo?.robotsMeta ?? null, r.seo?.xRobotsTag ?? null,
          r.depth, r.responseTimeMs ?? null, r.wordCount ?? null, r.contentHash ?? null,
          r.discoveredFromUrl ?? null,
          r.fetchErrorCode ?? null, r.fetchErrorMessage ?? null,
          now, now
        )

        // Insert links (URL row was just inserted above in same tx, so FK is valid)
        if (r.links) {
          for (const link of r.links) {
            const normalizedTarget = this.normalizeForDb(link.targetUrl, r.finalUrl || r.url)
            this.insertLinkStmt.run(
              crypto.randomUUID(), r.crawlId, r.urlId, r.url, link.targetUrl, normalizedTarget,
              link.anchorText ?? null, link.linkType, r.isInternal ? 1 : 0,
              !(link.rel && /\bnofollow\b/i.test(link.rel)) ? 1 : 0, link.rel ?? null, now
            )
          }
        }

        // Insert issues — use r.crawlId and r.urlId to ensure FK references are correct
        // (issues may have stale empty-string IDs from worker-side detection before crawlId was assigned)
        if (r.issues) {
          for (const issue of r.issues) {
            this.insertIssueStmt.run(
              crypto.randomUUID(), r.crawlId, r.urlId, issue.url,
              issue.issue_type, issue.severity, issue.message, issue.recommendation, now
            )
          }
        }
      }
    })
    try {
      insert(results)
    } catch (e: any) {
      console.error('[DB] bulkUpsertUrls failed:', e.message, 'for result count:', results.length)
      throw e
    }
  }

  list(input: ListUrlsInput): PaginatedResult<UrlRecord> {
    const whereClauses: string[] = ['crawl_id = ?']
    const params: any[] = [input.crawlId]

    if (input.filters?.search) {
      whereClauses.push('(url LIKE ? OR title LIKE ? OR meta_description LIKE ? OR h1 LIKE ?)')
      const likeTerm = `%${input.filters.search}%`
      params.push(likeTerm, likeTerm, likeTerm, likeTerm)
    }
    if (input.filters?.statusCategory) {
      whereClauses.push('status_category = ?')
      params.push(input.filters.statusCategory)
    }
    if (input.filters?.indexability) {
      whereClauses.push('indexability = ?')
      params.push(input.filters.indexability)
    }
    if (input.filters?.issueType) {
      whereClauses.push(`id IN (SELECT url_id FROM issues WHERE crawl_id = ? AND issue_type = ?)`)
      params.push(input.crawlId, input.filters.issueType)
    }
    if (input.filters?.contentType) {
      whereClauses.push('content_type LIKE ?')
      params.push(`%${input.filters.contentType}%`)
    }
    if (input.filters?.minDepth !== undefined) {
      whereClauses.push('depth >= ?')
      params.push(input.filters.minDepth)
    }
    if (input.filters?.maxDepth !== undefined) {
      whereClauses.push('depth <= ?')
      params.push(input.filters.maxDepth)
    }

    const sortBy = ['status_code', 'title', 'url', 'depth', 'response_time_ms', 'created_at']
    const field = input.sort?.field ?? 'status_code'
    const direction = input.sort?.direction === 'asc' ? 'ASC' : 'DESC'
    const orderField = sortBy.includes(field) ? field : 'url'

    // Count total
    const countQuery = `SELECT COUNT(*) as total FROM urls WHERE ${whereClauses.join(' AND ')}`
    const { total } = this.db.prepare(countQuery).get(...params) as { total: number }

    // Fetch page
    params.push(input.pageSize, input.page * input.pageSize)
    const query = `SELECT * FROM urls WHERE ${whereClauses.join(' AND ')} ORDER BY ${orderField} ${direction}, url ASC LIMIT ? OFFSET ?`
    const items = this.db.prepare(query).all(...params) as UrlRecord[]

    return {
      items,
      total,
      page: input.page,
      pageSize: input.pageSize,
      totalPages: Math.ceil(total / input.pageSize)
    }
  }

  get(urlId: string): UrlRecord | null {
    const row = this.db.prepare('SELECT * FROM urls WHERE id = ?').get(urlId) as UrlRecord | undefined
    return row || null
  }

  summarize(crawlId: string): UrlSummary {
    const byStatus = this.db.prepare(
      "SELECT status_category, COUNT(*) as cnt FROM urls WHERE crawl_id = ? AND status_category IS NOT NULL GROUP BY status_category"
    ).all(crawlId) as Array<{ status_category: string; cnt: number }>

    const indexableCount = this.db.prepare(
      'SELECT COUNT(*) as c FROM urls WHERE crawl_id = ? AND indexability = \'indexable\''
    ).get(crawlId) as { c: number }

    const nonIndexableCount = this.db.prepare(
      'SELECT COUNT(*) as c FROM urls WHERE crawl_id = ? AND indexability = \'non_indexable\''
    ).get(crawlId) as { c: number }

    const unknownCount = this.db.prepare(
      'SELECT COUNT(*) as c FROM urls WHERE crawl_id = ? AND (indexability = \'unknown\' OR indexability IS NULL)'
    ).get(crawlId) as { c: number }

    const totalRow = this.db.prepare(
      'SELECT COUNT(*) as total, AVG(response_time_ms) as avg_rt FROM urls WHERE crawl_id = ?'
    ).get(crawlId) as { total: number; avg_rt: number | null }

    return {
      total: totalRow.total,
      byStatusCategory: Object.fromEntries(byStatus.map(s => [s.status_category, s.cnt])),
      indexableCount: indexableCount.c,
      nonIndexableCount: nonIndexableCount.c,
      unknownCount: unknownCount.c,
      avgResponseTimeMs: Math.round(totalRow.avg_rt ?? 0)
    }
  }

  private categoryForCode(code?: number | null): string | null {
    if (!code) return null
    if (code >= 200 && code < 300) return '2xx'
    if (code >= 300 && code < 400) return '3xx'
    if (code >= 400 && code < 500) return '4xx'
    if (code >= 500 && code < 600) return '5xx'
    return null
  }

  private resolveIndexability(r: PageResult): string | null {
    const { indexability } = getIndexability(r)
    return indexability === 'unknown' ? null : indexability
  }

  private resolveIndexabilityReason(r: PageResult): string | null {
    const { reason } = getIndexability(r)
    return reason || null
  }

  private normalizeForDb(url: string, base?: string): string {
    try {
      const parsed = new URL(url, base)
      return parsed.href.toLowerCase()
    } catch {
      return url.toLowerCase()
    }
  }
}
