import type { Database as DB } from 'better-sqlite3'

/**
 * Phase 3 post-crawl analysis: hreflang validation & JSON-LD rich results checks.
 */
export class StructuredDataAnalyzer {
  constructor(private db: DB) {}

  analyze(crawlId: string): void {
    this.detectHreflangReciprocityIssues(crawlId)
    this.detectHreflangMissingSelfRef(crawlId)
    this.detectHreflangMissingXDefault(crawlId)
    this.detectHreflangNon200Targets(crawlId)
    this.detectHreflangInconsistentLanguageCode(crawlId)
    this.detectHreflangNotUsingCanonical(crawlId)
    this.detectHreflangNoindexReturnLink(crawlId)
    this.detectHreflangUnlinkedUrls(crawlId)
    // JSON-LD issues are detected inline (per-page); no cross-page aggregation needed here
  }

  /**
   * Feature 3.2 — Hreflang Reciprocity Check.
   * If A points to B via hreflang, then B should also have an alternate pointing back to A with matching lang.
   */
  private detectHreflangReciprocityIssues(crawlId: string): void {
    const now = new Date().toISOString()

    // Get all URLs with hreflangs AND all crawled normalized URLs
    const rowsWithHreflang = this.db.prepare(`
      SELECT id, normalized_url, url, hreflangs_json
      FROM urls
      WHERE crawl_id = ? AND has_hreflangs = 1
        AND hreflangs_json IS NOT NULL AND hreflangs_json != ''
    `).all(crawlId) as Array<{ id: string; normalized_url: string; url: string; hreflangs_json: string }>

    const allCrawledUrls = this.db.prepare(`
      SELECT normalized_url FROM urls WHERE crawl_id = ?
    `).all(crawlId) as Array<{ normalized_url: string }>
    const crawledSet = new Set<string>()
    for (const r of allCrawledUrls) {
      crawledSet.add(r.normalized_url.toLowerCase().replace(/\/+$/, ''))
    }

    // Process even if only one page has hreflangs — we still need to check reciprocity

    // Build a map: normUrl → [{hreflang, targetNorm}] for each page's hreflang targets
    type Entry = { hreflang: string; targetNorm: string }
    const urlToEntries = new Map<string, Entry[]>()

    for (const row of rowsWithHreflang) {
      try {
        const entries = JSON.parse(row.hreflangs_json) as Array<{ hreflang: string; href: string }>
        const parsed: Entry[] = []
        for (const e of entries) {
          try {
            const tNorm = new URL(e.href).href.toLowerCase().replace(/\/+$/, '')
            parsed.push({ hreflang: e.hreflang.toLowerCase(), targetNorm: tNorm })
          } catch { /* skip invalid URLs */ }
        }
        const normUrl = row.normalized_url.replace(/\/+$/, '').toLowerCase()
        urlToEntries.set(normUrl, parsed)
      } catch { continue }
    }

    // Check reciprocity: A→B means B should also have an entry pointing back to A.
    // If B was crawled but has no such reference, it's a reciprocity violation.
    const insertIssue = this.db.prepare(`
      INSERT INTO issues (id, crawl_id, url_id, url, issue_type, severity, message, recommendation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const [sourceNorm, entries] of urlToEntries.entries()) {
      for (const entry of entries) {
        if (entry.targetNorm === sourceNorm) continue // self-ref is fine
        // Check if the target URL exists in our crawl
        if (!crawledSet.has(entry.targetNorm)) continue // uncrawled — can't validate
        // Get all entries on target page
        const targetEntries = urlToEntries.get(entry.targetNorm)
        // If target page has NO hreflangs at all → definitely missing reciprocity
        if (!targetEntries || targetEntries.length === 0) {
          insertIssue.run(
            crypto.randomUUID(),
            crawlId,
            '',
            sourceNorm,
            'hreflang_reciprocity_missing',
            'medium',
            `Page declares hreflang "${entry.hreflang}" → ${entry.targetNorm}, but that page does not reciprocate.`,
            'Each pair of hreflang alternates should be bidirectional. Add the missing reference.',
            now
          )
          continue
        }
        // Does any entry on the target page point back to this source?
        const exactMatch = targetEntries.some(
          te => te.targetNorm.replace(/\/+$/, '') === sourceNorm.replace(/\/+$/, '')
        )
        if (!exactMatch) {
          insertIssue.run(
            crypto.randomUUID(),
            crawlId,
            '',
            sourceNorm,
            'hreflang_reciprocity_missing',
            'medium',
            `Page declares hreflang "${entry.hreflang}" → ${entry.targetNorm}, but that page does not reciprocate.`,
            'Each pair of hreflang alternates should be bidirectional. Add the missing reference.',
            now
          )
        }
      }
    }
  }

  /**
   * Feature 3.2 — Hreflang self-reference check.
   * If a page has hreflangs for other pages, it should also have one pointing to itself.
   */
  private detectHreflangMissingSelfRef(crawlId: string): void {
    const now = new Date().toISOString()

    const rows = this.db.prepare(`
      SELECT id, normalized_url, url, hreflangs_json
      FROM urls
      WHERE crawl_id = ? AND has_hreflangs = 1
        AND hreflangs_json IS NOT NULL AND hreflangs_json != ''
    `).all(crawlId) as Array<{ id: string; normalized_url: string; url: string; hreflangs_json: string }>

    if (rows.length === 0) return

    const insertIssue = this.db.prepare(`
      INSERT INTO issues (id, crawl_id, url_id, url, issue_type, severity, message, recommendation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const row of rows) {
      try {
        const entries = JSON.parse(row.hreflangs_json) as Array<{ href: string }>
        const selfNorm = row.normalized_url.replace(/\/+$/, '').toLowerCase()
        const hasSelfRef = entries.some(e => {
          try {
            return new URL(e.href).href.toLowerCase().replace(/\/+$/, '') === selfNorm
          } catch { return false }
        })
        // Also check against original url (may differ slightly due to normalization)
        const origNorm = row.url.replace(/\/+$/, '').toLowerCase()
        const hasOrigRef = entries.some(e => {
          try {
            return new URL(e.href).href.toLowerCase().replace(/\/+$/, '') === origNorm
          } catch { return false }
        })
        if (!hasSelfRef && !hasOrigRef) {
          insertIssue.run(
            crypto.randomUUID(),
            crawlId,
            row.id,
            row.url,
            'hreflang_missing_self_ref',
            'low',
            'Hreflang tags do not include a self-referencing alternate link.',
            'Add a self-referencing hreflang entry for this page\'s own URL and language code.',
            now
          )
        }
      } catch { continue }
    }
  }

  /**
   * Feature 3.2 — Missing x-default check.
   * Pages with multiple language versions should have an x-default fallback.
   */
  private detectHreflangMissingXDefault(crawlId: string): void {
    const now = new Date().toISOString()

    const rows = this.db.prepare(`
      SELECT id, url, hreflangs_json
      FROM urls
      WHERE crawl_id = ? AND has_hreflangs = 1
        AND hreflangs_json IS NOT NULL AND hreflangs_json != ''
    `).all(crawlId) as Array<{ id: string; url: string; hreflangs_json: string }>

    if (rows.length === 0) return

    const insertIssue = this.db.prepare(`
      INSERT INTO issues (id, crawl_id, url_id, url, issue_type, severity, message, recommendation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const row of rows) {
      try {
        const entries = JSON.parse(row.hreflangs_json) as Array<{ hreflang: string }>
        const hasMultipleLangs = entries.length >= 2
        if (!hasMultipleLangs) continue
        const hasXDefault = entries.some(e => e.hreflang.toLowerCase() === 'x-default')
        if (!hasXDefault) {
          insertIssue.run(
            crypto.randomUUID(),
            crawlId,
            row.id,
            row.url,
            'hreflang_missing_x_default',
            'medium',
            `Hreflang group with ${entries.length} languages is missing an x-default entry.`,
            'Add <link rel="alternate" hreflang="x-default" href="..."> pointing to a fallback page.',
            now
          )
        }
      } catch { continue }
    }
  }

  /**
   * Feature 3.2 — Non-200 target detection.
   * Hreflang targets that return non-200 status codes are invalid.
   */
  private detectHreflangNon200Targets(crawlId: string): void {
    const now = new Date().toISOString()

    const rowsWithHreflang = this.db.prepare(`
      SELECT url, normalized_url, hreflangs_json
      FROM urls
      WHERE crawl_id = ? AND has_hreflangs = 1
        AND hreflangs_json IS NOT NULL AND hreflangs_json != ''
    `).all(crawlId) as Array<{ url: string; normalized_url: string; hreflangs_json: string }>

    if (rowsWithHreflang.length === 0) return

    // Build a map of normalized URL → status_code for all crawled URLs
    const allUrls = this.db.prepare(`
      SELECT normalized_url, status_code FROM urls WHERE crawl_id = ?
    `).all(crawlId) as Array<{ normalized_url: string; status_code?: number | null }>
    const normToStatus = new Map<string, number>()
    for (const u of allUrls) {
      normToStatus.set(u.normalized_url.toLowerCase().replace(/\/+$/, ''), u.status_code ?? 0)
    }

    const insertIssue = this.db.prepare(`
      INSERT INTO issues (id, crawl_id, url_id, url, issue_type, severity, message, recommendation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const row of rowsWithHreflang) {
      try {
        const entries = JSON.parse(row.hreflangs_json) as Array<{ hreflang: string; href: string }>
        for (const e of entries) {
          try {
            const targetNorm = new URL(e.href).href.toLowerCase().replace(/\/+$/, '')
            const status = normToStatus.get(targetNorm)
            if (status && status >= 400) {
              insertIssue.run(
                crypto.randomUUID(),
                crawlId,
                '',
                row.url,
                'broken_internal_link',
                'high',
                `Hreflang target ${e.href} (${e.hreflang}) returned HTTP ${status}.`,
                'Fix the broken hreflang target page so it returns a valid response.',
                now
              )
            }
          } catch { /* skip invalid URLs */ }
        }
      } catch { continue }
    }
  }

  /**
   * Feature 3.2 — Inconsistent language code detection.
   * Hreflang self-reference URL should match the page's canonical URL.
   */
  private detectHreflangInconsistentLanguageCode(crawlId: string): void {
    const now = new Date().toISOString()

    // Build map of crawled URL → its canonical
    const allUrlsWithCanonical = this.db.prepare(`
      SELECT url, canonical FROM urls WHERE crawl_id = ? AND canonical IS NOT NULL AND canonical != ''
    `).all(crawlId) as Array<{ url: string; canonical: string }>
    const normToCanonical = new Map<string, string>()
    for (const u of allUrlsWithCanonical) {
      normToCanonical.set(u.url.replace(/\/+$/, '').toLowerCase(), u.canonical.toLowerCase().replace(/\/+$/, ''))
    }

    const rowsWithHreflang = this.db.prepare(`
      SELECT id, url, hreflangs_json FROM urls
      WHERE crawl_id = ? AND has_hreflangs = 1
        AND hreflangs_json IS NOT NULL AND hreflangs_json != ''
    `).all(crawlId) as Array<{ id: string; url: string; hreflangs_json: string }>

    if (rowsWithHreflang.length === 0) return

    const insertIssue = this.db.prepare(`
      INSERT INTO issues (id, crawl_id, url_id, url, issue_type, severity, message, recommendation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const row of rowsWithHreflang) {
      try {
        const entries = JSON.parse(row.hreflangs_json) as Array<{ hreflang: string; href: string }>
        const selfNorm = row.url.replace(/\/+$/, '').toLowerCase()
        const pageCanonical = normToCanonical.get(selfNorm)
        if (!pageCanonical) continue // No canonical on this page — skip

        const hasSelfRefEntry = entries.find(e => {
          try { return new URL(e.href).href.toLowerCase().replace(/\/+$/, '') === selfNorm } catch { return false }
        })
        if (!hasSelfRefEntry) continue // Skip pages without self-ref (handled by missing_self_ref check)

        const selfRefUrl = new URL(hasSelfRefEntry.href).href.toLowerCase().replace(/\/+$/, '')
        if (selfRefUrl !== pageCanonical && !pageCanonical.startsWith(selfRefUrl)) {
          insertIssue.run(
            crypto.randomUUID(), crawlId, '', row.url, 'hreflang_inconsistent_language_code',
            'medium' as const,
            `Hreflang self-reference (${hasSelfRefEntry.href}) does not match canonical URL (${pageCanonical}).`,
            'The self-referencing hreflang should point to the same URL as the <link rel="canonical"> tag.', now
          )
        }
      } catch { continue }
    }
  }

  /**
   * Feature 3.2 — Hreflang not using canonical URLs.
   * Each hreflang target should use its own canonical URL, not an alternate/parameterized version.
   */
  private detectHreflangNotUsingCanonical(crawlId: string): void {
    const now = new Date().toISOString()

    const rowsWithHreflang = this.db.prepare(`
      SELECT id, url, canonical, hreflangs_json FROM urls
      WHERE crawl_id = ? AND has_hreflangs = 1
        AND hreflangs_json IS NOT NULL AND hreflangs_json != ''
    `).all(crawlId) as Array<{ id: string; url: string; canonical?: string | null; hreflangs_json: string }>

    if (rowsWithHreflang.length === 0) return

    // Build map of all crawled URLs → their canonical
    const allUrls = this.db.prepare(`
      SELECT url, canonical FROM urls WHERE crawl_id = ?
    `).all(crawlId) as Array<{ url: string; canonical?: string | null }>
    const normToCanonical = new Map<string, string>()
    for (const u of allUrls) {
      const canonUrl = u.canonical || u.url
      normToCanonical.set(u.url.toLowerCase().replace(/\/+$/, ''), canonUrl.toLowerCase().replace(/\/+$/, ''))
    }

    const insertIssue = this.db.prepare(`
      INSERT INTO issues (id, crawl_id, url_id, url, issue_type, severity, message, recommendation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const row of rowsWithHreflang) {
      try {
        const entries = JSON.parse(row.hreflangs_json) as Array<{ hreflang: string; href: string }>
        for (const e of entries) {
          try {
            const targetNorm = new URL(e.href).href.toLowerCase().replace(/\/+$/, '')
            const targetCanonical = normToCanonical.get(targetNorm)
            if (!targetCanonical) continue // Target not crawled — can't validate
            const hrefNorm = e.href.replace(/\/+$/, '').toLowerCase()
            if (targetCanonical !== targetNorm && hrefNorm !== targetCanonical) {
              insertIssue.run(
                crypto.randomUUID(), crawlId, '', row.url, 'hreflang_not_using_canonical',
                'medium' as const,
                `Hreflang "${e.hreflang}" points to ${e.href}, but that page's canonical is ${targetCanonical}.`,
                'Each hreflang alternate should point directly to the canonical version of the target URL.', now
              )
            }
          } catch { /* skip invalid URLs */ }
        }
      } catch { continue }
    }
  }

  /**
   * Feature 3.2 — Hreflang noindex return link detection.
   * Pages referenced via hreflang should NOT have noindex directives in robots_meta or x_robots_tag.
   */
  private detectHreflangNoindexReturnLink(crawlId: string): void {
    const now = new Date().toISOString()

    const rowsWithHreflang = this.db.prepare(`
      SELECT url, hreflangs_json FROM urls
      WHERE crawl_id = ? AND has_hreflangs = 1
        AND hreflangs_json IS NOT NULL AND hreflangs_json != ''
    `).all(crawlId) as Array<{ url: string; hreflangs_json: string }>

    if (rowsWithHreflang.length === 0) return

    // Build map of normalized URL → robots info for all crawled URLs
    const allUrls = this.db.prepare(`
      SELECT normalized_url, robots_meta, x_robots_tag, noindex_in_rendered FROM urls WHERE crawl_id = ?
    `).all(crawlId) as Array<{
      normalized_url: string; robots_meta?: string | null; x_robots_tag?: string | null; noindex_in_rendered?: number | null
    }>
    const normToRobots = new Map<string, { robots_meta?: string | null; x_robots_tag?: string | null; noindexInRendered?: boolean }>()
    for (const u of allUrls) {
      normToRobots.set(u.normalized_url.toLowerCase().replace(/\/+$/, ''), {
        robots_meta: u.robots_meta,
        x_robots_tag: u.x_robots_tag,
        noindexInRendered: !!u.noindex_in_rendered,
      })
    }

    const insertIssue = this.db.prepare(`
      INSERT INTO issues (id, crawl_id, url_id, url, issue_type, severity, message, recommendation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const row of rowsWithHreflang) {
      try {
        const entries = JSON.parse(row.hreflangs_json) as Array<{ hreflang: string; href: string }>
        for (const e of entries) {
          try {
            const targetNorm = new URL(e.href).href.toLowerCase().replace(/\/+$/, '')
            const robots = normToRobots.get(targetNorm)
            if (!robots) continue // Target not crawled — can't validate

            let noindexSource: string | null = null
            if (robots.robots_meta?.includes('noindex')) noindexSource = 'meta robots'
            else if (robots.x_robots_tag?.includes('noindex')) noindexSource = 'X-Robots-Tag header'
            else if (robots.noindexInRendered) noindexSource = 'rendered JavaScript'

            if (noindexSource) {
              insertIssue.run(
                crypto.randomUUID(), crawlId, '', row.url, 'hreflang_noindex_return_link',
                'high' as const,
                `Hreflang "${e.hreflang}" points to ${e.href}, which returns a noindex directive via ${noindexSource}.`,
                'Remove the noindex directive from pages that are referenced in hreflang alternate groups.', now
              )
            }
          } catch { /* skip invalid URLs */ }
        }
      } catch { continue }
    }
  }

  /**
   * Feature 3.2 — Hreflang unlinked URL detection.
   * Pages declared via hreflang should have internal incoming links to be discoverable.
   */
  private detectHreflangUnlinkedUrls(crawlId: string): void {
    const now = new Date().toISOString()

    const rowsWithHreflang = this.db.prepare(`
      SELECT url, normalized_url, hreflangs_json FROM urls
      WHERE crawl_id = ? AND has_hreflangs = 1
        AND hreflangs_json IS NOT NULL AND hreflangs_json != ''
    `).all(crawlId) as Array<{ url: string; normalized_url: string; hreflangs_json: string }>

    if (rowsWithHreflang.length === 0) return

    // Build map of all crawled URLs → their inlink count
    const allUrls = this.db.prepare(`
      SELECT normalized_url, inlink_count FROM urls WHERE crawl_id = ?
    `).all(crawlId) as Array<{ normalized_url: string; inlink_count?: number | null }>
    const normToInlinks = new Map<string, number>()
    for (const u of allUrls) {
      normToInlinks.set(u.normalized_url.toLowerCase().replace(/\/+$/, ''), u.inlink_count ?? 0)
    }

    const insertIssue = this.db.prepare(`
      INSERT INTO issues (id, crawl_id, url_id, url, issue_type, severity, message, recommendation, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const row of rowsWithHreflang) {
      try {
        const entries = JSON.parse(row.hreflangs_json) as Array<{ hreflang: string; href: string }>
        for (const e of entries) {
          try {
            const targetNorm = new URL(e.href).href.toLowerCase().replace(/\/+$/, '')
            const sourceNorm = row.normalized_url.toLowerCase().replace(/\/+$/, '')
            if (targetNorm === sourceNorm) continue // self-ref is fine

            const inlinks = normToInlinks.get(targetNorm) ?? 0
            if (inlinks === 0) {
              insertIssue.run(
                crypto.randomUUID(), crawlId, '', row.url, 'hreflang_unlinked_urls',
                'low' as const,
                `Hreflang "${e.hreflang}" points to ${e.href}, which has zero internal incoming links.`,
                'Ensure all hreflang alternates are discoverable via the site\'s navigation or content links.', now
              )
            }
          } catch { /* skip invalid URLs */ }
        }
      } catch { continue }
    }
  }
}
