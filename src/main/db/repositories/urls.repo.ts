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
        fetch_error_message, created_at, updated_at,
        -- v2 columns: hreflang
        hreflangs_json, has_hreflangs,
        -- v2: heading hierarchy h2-h6
        h2, h2_count, h3, h3_count, h4, h4_count, h5, h5_count, h6, h6_count,
        -- v2: image alt audit
        image_count, images_missing_alt_attr, images_empty_alt, images_long_alt,
        -- v2: social meta
        social_meta_json, has_og_tags, has_twitter_card,
        -- v2: structured data flags
        structured_data_json, sd_webpage, sd_article, sd_product, sd_faq_page, sd_breadcrumblist, sd_organization, sd_local_business, sd_review, sd_event, sd_has_parse_errors,
        -- v2: carbon estimation
        carbon_bytes_transferred, carbon_co2_grams, carbon_rating,
        -- v2: link graph counts
        inlink_count, unique_inlink_count, outlink_count, unique_outlink_count, external_outlink_count,
        -- v2: pagination
        pagination_next, pagination_prev, is_paginated,
        -- v2: js rendering comparison
        noindex_in_rendered, rendered_html_title, rendered_html_meta_desc, rendered_word_count, html_word_count, word_count_change, js_redirect_url, total_transferred_bytes, dom_content_loaded_ms, network_idle_ms,
        -- v2: anchor text over-optimization
        anchor_text_over_optimized)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        -- v2 columns defaults
        ?, ?,
        ?, 0, ?, 0, ?, 0, ?, 0, ?, 0,
        0, 0, 0, 0,
        ?, 0, 0,
        ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, '',
        0, 0, 0, 0, 0,
        ?, ?, 0,
        0, ?, ?, 0, 0, 0, ?, 0, null, null,
        0)
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
        updated_at = excluded.updated_at,
        hreflangs_json = excluded.hreflangs_json,
        has_hreflangs = excluded.has_hreflangs,
        h2 = excluded.h2, h2_count = excluded.h2_count,
        h3 = excluded.h3, h3_count = excluded.h3_count,
        h4 = excluded.h4, h4_count = excluded.h4_count,
        h5 = excluded.h5, h5_count = excluded.h5_count,
        h6 = excluded.h6, h6_count = excluded.h6_count,
        image_count = excluded.image_count,
        images_missing_alt_attr = excluded.images_missing_alt_attr,
        images_empty_alt = excluded.images_empty_alt,
        images_long_alt = excluded.images_long_alt,
        social_meta_json = excluded.social_meta_json,
        has_og_tags = excluded.has_og_tags,
        has_twitter_card = excluded.has_twitter_card,
        structured_data_json = excluded.structured_data_json,
        sd_webpage = excluded.sd_webpage,
        sd_article = excluded.sd_article,
        sd_product = excluded.sd_product,
        sd_faq_page = excluded.sd_faq_page,
        sd_breadcrumblist = excluded.sd_breadcrumblist,
        sd_organization = excluded.sd_organization,
        sd_local_business = excluded.sd_local_business,
        sd_review = excluded.sd_review,
        sd_event = excluded.sd_event,
        sd_has_parse_errors = excluded.sd_has_parse_errors,
        carbon_bytes_transferred = excluded.carbon_bytes_transferred,
        carbon_co2_grams = excluded.carbon_co2_grams,
        carbon_rating = excluded.carbon_rating,
        inlink_count = excluded.inlink_count,
        unique_inlink_count = excluded.unique_inlink_count,
        outlink_count = excluded.outlink_count,
        unique_outlink_count = excluded.unique_outlink_count,
        external_outlink_count = excluded.external_outlink_count,
        pagination_next = excluded.pagination_next,
        pagination_prev = excluded.pagination_prev,
        is_paginated = excluded.is_paginated,
        noindex_in_rendered = excluded.noindex_in_rendered,
        rendered_html_title = excluded.rendered_html_title,
        rendered_html_meta_desc = excluded.rendered_html_meta_desc,
        rendered_word_count = excluded.rendered_word_count,
        html_word_count = excluded.html_word_count,
        word_count_change = excluded.word_count_change,
        js_redirect_url = excluded.js_redirect_url,
        total_transferred_bytes = excluded.total_transferred_bytes,
        dom_content_loaded_ms = excluded.dom_content_loaded_ms,
        network_idle_ms = excluded.network_idle_ms,
        anchor_text_over_optimized = excluded.anchor_text_over_optimized
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
          now, now,
          // v2: hreflang
          r.seo?.hreflangsJson ?? null, (r.seo?.hasHreflangs ? 1 : 0),
          // v2: heading hierarchy h2-h6
          r.seo?.h2 ?? null, r.seo?.h2Count ?? 0,
          r.seo?.h3 ?? null, r.seo?.h3Count ?? 0,
          r.seo?.h4 ?? null, r.seo?.h4Count ?? 0,
          r.seo?.h5 ?? null, r.seo?.h5Count ?? 0,
          r.seo?.h6 ?? null, r.seo?.h6Count ?? 0,
          // v2: image alt audit
          r.seo?.imageCount ?? 0, r.seo?.imagesMissingAltAttr ?? 0,
          r.seo?.imagesEmptyAlt ?? 0, r.seo?.imagesLongAlt ?? 0,
          // v2: social meta
          r.seo?.socialMetaJson ?? null, (r.seo?.hasOgTags ? 1 : 0), (r.seo?.hasTwitterCard ? 1 : 0),
          // v2: structured data flags
          r.seo?.structuredDataJson ?? null, (r.seo?.sdWebpage ? 1 : 0), (r.seo?.sdArticle ? 1 : 0),
          (r.seo?.sdProduct ? 1 : 0), (r.seo?.sdFaqPage ? 1 : 0), (r.seo?.sdBreadcrumblist ? 1 : 0),
          (r.seo?.sdOrganization ? 1 : 0), (r.seo?.sdLocalBusiness ? 1 : 0),
          (r.seo?.sdReview ? 1 : 0), (r.seo?.sdEvent ? 1 : 0), (r.seo?.sdHasParseErrors ? 1 : 0),
          // v2: carbon estimation
          r.seo?.carbonBytesTransferred ?? 0, r.seo?.carbonCo2Grams ?? 0, r.seo?.carbonRating ?? '',
          // v2: link graph counts (computed post-crawl, default 0)
          0, 0, 0, 0, 0,
          // v2: pagination
          r.seo?.paginationNext ?? null, r.seo?.paginationPrev ?? null, (r.seo?.isPaginated ? 1 : 0),
          // v2: js rendering comparison
          (r.seo?.noindexInRendered ? 1 : 0), r.seo?.renderedHtmlTitle ?? null,
          r.seo?.renderedHtmlMetaDesc ?? null, r.seo?.renderedWordCount ?? 0,
          r.seo?.htmlWordCount ?? 0, r.seo?.wordCountChange ?? 0,
          r.seo?.jsRedirectUrl ?? null, r.seo?.totalTransferredBytes ?? 0,
          r.seo?.domContentLoadedMs ?? null, r.seo?.networkIdleMs ?? null,
          // v2: anchor text over-optimization (computed post-crawl)
          0
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

  analyzeKeywords(crawlId: string, gramType: 'unigrams' | 'bigrams' | 'trigrams'): Array<{ keyword: string; count: number; urls: number }> {
    const rows = this.db.prepare(`
      SELECT id, title, h1, meta_description
      FROM urls
      WHERE crawl_id = ?
    `).all(crawlId) as Array<{ id: string; title?: string | null; h1?: string | null; meta_description?: string | null }>

    const gramSize = gramType === 'trigrams' ? 3 : gramType === 'bigrams' ? 2 : 1
    const counts = new Map<string, { count: number; urlIds: Set<string> }>()

    for (const row of rows) {
      const text = [row.title, row.h1, row.meta_description].filter(Boolean).join(' ')
      const tokens = this.tokenizeForKeywords(text)
      for (let i = 0; i <= tokens.length - gramSize; i += 1) {
        const gram = tokens.slice(i, i + gramSize).join(' ')
        const current = counts.get(gram) ?? { count: 0, urlIds: new Set<string>() }
        current.count += 1
        current.urlIds.add(row.id)
        counts.set(gram, current)
      }
    }

    return Array.from(counts.entries())
      .map(([keyword, stat]) => ({ keyword, count: stat.count, urls: stat.urlIds.size }))
      .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword))
      .slice(0, 250)
  }

  estimatePageCarbon(crawlId: string): Array<{ urlId: string; url: string; bytes: number; co2Grams: number; rating: string }> {
    const rows = this.db.prepare(`
      SELECT id, url, content_length, total_transferred_bytes, carbon_bytes_transferred, carbon_co2_grams, carbon_rating
      FROM urls
      WHERE crawl_id = ?
    `).all(crawlId) as Array<{
      id: string
      url: string
      content_length?: number | null
      total_transferred_bytes?: number | null
      carbon_bytes_transferred?: number | null
      carbon_co2_grams?: number | null
      carbon_rating?: string | null
    }>

    const update = this.db.prepare(`
      UPDATE urls
      SET carbon_bytes_transferred = ?, carbon_co2_grams = ?, carbon_rating = ?
      WHERE id = ?
    `)

    const results = rows.map((row) => {
      const bytes = row.carbon_bytes_transferred || row.total_transferred_bytes || row.content_length || 0
      const co2Grams = row.carbon_co2_grams || this.estimateCo2Grams(bytes)
      const rating = row.carbon_rating || this.carbonRating(co2Grams)
      update.run(bytes, co2Grams, rating, row.id)
      return { urlId: row.id, url: row.url, bytes, co2Grams, rating }
    })

    return results.sort((a, b) => b.co2Grams - a.co2Grams)
  }

  findContentClusters(crawlId: string): Array<{ contentHash: string; urls: Array<{ id: string; url: string; title?: string | null }> }> {
    const rows = this.db.prepare(`
      SELECT id, url, title, content_hash
      FROM urls
      WHERE crawl_id = ? AND content_hash IS NOT NULL AND content_hash != ''
      ORDER BY content_hash, url
    `).all(crawlId) as Array<{ id: string; url: string; title?: string | null; content_hash: string }>

    const clusters = new Map<string, Array<{ id: string; url: string; title?: string | null }>>()
    for (const row of rows) {
      const urls = clusters.get(row.content_hash) ?? []
      urls.push({ id: row.id, url: row.url, title: row.title })
      clusters.set(row.content_hash, urls)
    }

    return Array.from(clusters.entries())
      .filter(([, urls]) => urls.length > 1)
      .map(([contentHash, urls]) => ({ contentHash, urls }))
      .sort((a, b) => b.urls.length - a.urls.length)
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

  private tokenizeForKeywords(text: string): string[] {
    const stopWords = new Set([
      'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is',
      'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'with', 'your'
    ])
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2 && !stopWords.has(token))
  }

  private estimateCo2Grams(bytes: number): number {
    const gigabytes = bytes / 1_000_000_000
    return Number((gigabytes * 0.81 * 442).toFixed(4))
  }

  private carbonRating(co2Grams: number): string {
    if (co2Grams <= 0.095) return 'A+'
    if (co2Grams <= 0.186) return 'A'
    if (co2Grams <= 0.341) return 'B'
    if (co2Grams <= 0.493) return 'C'
    if (co2Grams <= 0.656) return 'D'
    if (co2Grams <= 0.846) return 'E'
    return 'F'
  }
}
