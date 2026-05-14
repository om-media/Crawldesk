import type { Database as DB } from 'better-sqlite3'

/**
 * Phase 2 post-crawl analysis for link graph & structural issues.
 * Runs against the DB after a crawl completes.
 */
export class LinkGraphAnalyzer {
  constructor(private db: DB) {}

  /** Run all Phase 2 post-crawl passes. Returns void (issues inserted directly). */
  analyze(crawlId: string): void {
    this.updateInlinkOutlinkCounts(crawlId)
    this.detectOrphanPages(crawlId)
    this.detectAnchorTextOverOptimization(crawlId)
    this.detectRobotsConflicts(crawlId)
    this.detectXRobotsNoindex(crawlId)
    this.detectInternalLinksTo4xx(crawlId)
  }

  // ----------------------------------------------------------------
  // Feature 2.1 — Inlinks / Outlinks Per-Page Counts
  // ----------------------------------------------------------------
  private updateInlinkOutlinkCounts(crawlId: string): void {
    // Update outlink_count: count of links FROM each URL
    const upsertOutlinks = this.db.prepare(`
      UPDATE urls SET outlink_count = COALESCE((
        SELECT COUNT(*) FROM links
        WHERE links.crawl_id = urls.crawl_id AND links.source_url_id = urls.id AND links.is_internal = 1
      ), 0)
      WHERE crawl_id = ?
    `)
    upsertOutlinks.run(crawlId)

    // Update inlink_count: count of internal links TO each URL
    const upsertInlinks = this.db.prepare(`
      UPDATE urls SET inlink_count = COALESCE((
        SELECT COUNT(DISTINCT l.source_url_id) FROM links l
        JOIN urls u ON u.normalized_url = l.normalized_target_url AND u.crawl_id = l.crawl_id
        WHERE l.crawl_id = urls.crawl_id AND l.target_url_id = urls.id AND l.is_internal = 1
      ), 0)
      WHERE crawl_id = ?
    `)
    upsertInlinks.run(crawlId)
  }

  // ----------------------------------------------------------------
  // Feature 2.2 — Orphaned Pages Detection
  // ----------------------------------------------------------------
  private detectOrphanPages(crawlId: string): void {
    const now = new Date().toISOString()
    // Find indexable pages with zero incoming internal follow links (and not the start page)
    const orphans = this.db.prepare(`
      SELECT u.id, u.url
      FROM urls u
      LEFT JOIN links l ON l.crawl_id = u.crawl_id AND l.target_url_id = u.id AND l.is_internal = 1
      WHERE u.crawl_id = ?
        AND u.indexability = 'indexable'
        AND u.is_internal = 1
        AND l.id IS NULL
    `).all(crawlId) as Array<{ id: string; url: string }>

    if (orphans.length === 0) return

    const insertIssue = this.db.prepare(`
      INSERT INTO issues (id, crawl_id, url_id, url, issue_type, severity, message, recommendation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const o of orphans) {
      insertIssue.run(
        crypto.randomUUID(),
        crawlId,
        o.id,
        o.url,
        'orphan_page',
        'high',
        'This indexable page has no incoming internal links.',
        'Add internal links pointing to this page from your navigation or related content.',
        now
      )
    }
  }

  // ----------------------------------------------------------------
  // Feature 2.3 — Anchor Text Over-optimization
  // ----------------------------------------------------------------
  private detectAnchorTextOverOptimization(crawlId: string): void {
    const THRESHOLD = 5 // Flag when same anchor text is used ≥5 times linking to the same target

    const now = new Date().toISOString()

    // Find groups where identical normalized_anchor → same target_url appears >= THRESHOLD times
    const suspicious = this.db.prepare(`
      SELECT l.normalized_target_url, l.anchor_text, COUNT(*) as cnt, GROUP_CONCAT(l.source_url_id) as sources
      FROM links l
      WHERE l.crawl_id = ? AND l.is_internal = 1 AND l.link_type = 'html_a'
        AND l.anchor_text IS NOT NULL AND l.anchor_text != '' AND LENGTH(l.anchor_text) > 2
      GROUP BY l.normalized_target_url, LOWER(TRIM(l.anchor_text))
      HAVING cnt >= ?
    `).all(crawlId, THRESHOLD) as Array<{ normalized_target_url: string; anchor_text: string; cnt: number; sources: string }>

    if (suspicious.length === 0) return

    const insertIssue = this.db.prepare(`
      INSERT INTO issues (id, crawl_id, url_id, url, issue_type, severity, message, recommendation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const s of suspicious) {
      const targetRow = this.db.prepare(
        "SELECT id, url FROM urls WHERE crawl_id = ? AND normalized_url = ? LIMIT 1"
      ).get(crawlId, s.normalized_target_url.toLowerCase()) as { id?: string; url?: string } | undefined

      if (!targetRow?.id) continue

      insertIssue.run(
        crypto.randomUUID(),
        crawlId,
        targetRow.id,
        targetRow.url ?? '',
        'anchor_text_over_optimized',
        'medium',
        `Anchor text "${s.anchor_text}" is used ${s.cnt} times linking to this URL.`,
        'Vary your anchor text naturally. Use synonyms, brand names, or descriptive phrases instead of repeating the exact same keyword.',
        now
      )
    }
  }

  // ----------------------------------------------------------------
  // Feature 2.5 — Robots Directive Conflict Detection
  // ----------------------------------------------------------------
  private detectRobotsConflicts(crawlId: string): void {
    const now = new Date().toISOString()

    const rows = this.db.prepare(`
      SELECT id, url, robots_meta, x_robots_tag
      FROM urls WHERE crawl_id = ?
        AND robots_meta IS NOT NULL AND robots_meta != ''
        AND x_robots_tag IS NOT NULL AND x_robots_tag != ''
    `).all(crawlId) as Array<{ id: string; url: string; robots_meta: string; x_robots_tag: string }>

    if (rows.length === 0) return

    const insertIssue = this.db.prepare(`
      INSERT INTO issues (id, crawl_id, url_id, url, issue_type, severity, message, recommendation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const row of rows) {
      if (!isNoindex(row.robots_meta)) continue
      if (!isNoindex(row.x_robots_tag)) {
        insertIssue.run(
          crypto.randomUUID(),
          crawlId,
          row.id,
          row.url,
          'robots_conflict',
          'high',
          `meta robots says "${row.robots_meta}" but X-Robots-Tag says "${row.x_robots_tag}".`,
          'Align both directives to the same indexability signal.',
          now
        )
      } else if (!isNoindex(row.robots_meta) && isNoindex(row.x_robots_tag)) {
        insertIssue.run(
          crypto.randomUUID(),
          crawlId,
          row.id,
          row.url,
          'robots_conflict',
          'high',
          `meta robots says "${row.robots_meta}" but X-Robots-Tag says "${row.x_robots_tag}".`,
          'Align both directives to the same indexability signal.',
          now
        )
      }
    }
  }

  // ----------------------------------------------------------------
  // Feature 2.5 — X-Robots-Tag noindex detection
  // ----------------------------------------------------------------
  private detectXRobotsNoindex(crawlId: string): void {
    const now = new Date().toISOString()

    const rows = this.db.prepare(`
      SELECT id, url, x_robots_tag
      FROM urls WHERE crawl_id = ?
        AND x_robots_tag IS NOT NULL AND x_robots_tag != ''
    `).all(crawlId) as Array<{ id: string; url: string; x_robots_tag: string }>

    const insertIssue = this.db.prepare(`
      INSERT INTO issues (id, crawl_id, url_id, url, issue_type, severity, message, recommendation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const row of rows) {
      if (!isNoindex(row.x_robots_tag)) continue
      insertIssue.run(
        crypto.randomUUID(),
        crawlId,
        row.id,
        row.url,
        'x_robots_noindex',
        'medium',
        `Page is blocked from indexing via X-Robots-Tag: ${row.x_robots_tag}`,
        'Remove the noindex directive from response headers if this page should be indexed.',
        now
      )
    }
  }

  // ----------------------------------------------------------------
  // Feature 2.6 — Internal Links Pointing to 4xx URLs
  // Flags source pages that link to crawled URLs returning 4xx status
  // ----------------------------------------------------------------
  private detectInternalLinksTo4xx(crawlId: string): void {
    const now = new Date().toISOString()

    // Join links with target URLs where targets have 4xx status codes
    // Group by source URL and count distinct broken outbound links per source
    const flagged = this.db.prepare(`
      SELECT u.id AS src_id, u.url AS src_url, COUNT(*) AS cnt
      FROM links l
      JOIN urls t ON t.crawl_id = l.crawl_id AND LOWER(TRIM(t.normalized_url)) = LOWER(TRIM(l.normalized_target_url))
      JOIN urls u ON u.id = l.source_url_id
      WHERE l.crawl_id = ? AND l.is_internal = 1 AND l.link_type = 'html_a'
        AND t.status_code >= 400 AND t.status_code < 500
      GROUP BY u.id, u.url
    `).all(crawlId) as Array<{ src_id: string; src_url: string; cnt: number }>

    if (flagged.length === 0) return

    const insertIssue = this.db.prepare(`
      INSERT INTO issues (id, crawl_id, url_id, url, issue_type, severity, message, recommendation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const f of flagged) {
      insertIssue.run(
        crypto.randomUUID(), crawlId, f.src_id, f.src_url,
        'internal_link_to_4xx',
        'medium',
        `${f.cnt} internal link(s) from this page point to URLs returning 4xx errors.`,
        'Update or remove broken internal links. Redirect removed pages (301) to relevant live content if applicable.',
        now
      )
    }
  }
}

// Simple heuristic: check if a robots value contains "noindex"
function isNoindex(value: string): boolean {
  return /\bnoindex\b/i.test(value)
}
