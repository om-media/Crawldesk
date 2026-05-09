// Feature 7.4 — Crawl Diff Analyzer
// Compare current crawl stats against previous run; produce delta records & issues.

import Database from 'better-sqlite3'

export interface CrawlDiff {
  id: string
  current_crawl_id: string
  previous_crawl_id: string
  url_count_delta: number
  new_urls_count: number
  removed_urls_count: number
  broken_links_delta: number
  issues_delta: number
  critical_issues_delta: number
}

export class CrawlDiffAnalyzer {
  constructor(private db: Database.Database) {}

  /** Run after a crawl completes — compare with most recent prior crawl for same project */
  analyze(crawlId: string): CrawlDiff | null {
    const crawl = this.db.prepare('SELECT project_id FROM crawls WHERE id = ?').get(crawlId) as { project_id: string } | undefined
    if (!crawl) return null

    // Find previous crawl (most recent completed before this one, same project)
    const prevRow = this.db.prepare(`
      SELECT id FROM crawls WHERE project_id = ? AND status IN ('completed','failed') AND id != ? ORDER BY created_at DESC LIMIT 1
    `).get(crawl.project_id, crawlId) as { id: string } | undefined
    if (!prevRow) return null

    // URL count comparison by normalized_url
    const curUrls = new Set(
      this.db.prepare('SELECT normalized_url FROM urls WHERE crawl_id = ?').all(crawlId)
        .map((r: any) => r.normalized_url)
    )
    const prevUrls = new Set(
      this.db.prepare('SELECT normalized_url FROM urls WHERE crawl_id = ?').all(prevRow.id)
        .map((r: any) => r.normalized_url)
    )

    const newUrls = [...curUrls].filter(u => !prevUrls.has(u)).length
    const removedUrls = [...prevUrls].filter(u => !curUrls.has(u)).length
    const urlCountDelta = curUrls.size - prevUrls.size

    // Broken link comparison (4xx/5xx)
    const curBroken = this.db.prepare(
      "SELECT COUNT(*) as c FROM urls WHERE crawl_id = ? AND status_code >= 400"
    ).get(crawlId) as { c: number }
    const prevBroken = this.db.prepare(
      "SELECT COUNT(*) as c FROM urls WHERE crawl_id = ? AND status_code >= 400"
    ).get(prevRow.id) as { c: number }
    const brokenLinksDelta = curBroken.c - prevBroken.c

    // Issue count comparison
    const curIssues = this.db.prepare(
      'SELECT COUNT(*) as c FROM issues WHERE crawl_id = ?'
    ).get(crawlId) as { c: number }
    const prevIssues = this.db.prepare(
      'SELECT COUNT(*) as c FROM issues WHERE crawl_id = ?'
    ).get(prevRow.id) as { c: number }
    const issuesDelta = curIssues.c - prevIssues.c

    const curCritical = this.db.prepare(
      "SELECT COUNT(*) as c FROM issues WHERE crawl_id = ? AND severity = 'critical'"
    ).get(crawlId) as { c: number }
    const prevCritical = this.db.prepare(
      "SELECT COUNT(*) as c FROM issues WHERE crawl_id = ? AND severity = 'critical'"
    ).get(prevRow.id) as { c: number }
    const criticalIssuesDelta = curCritical.c - prevCritical.c

    // Insert diff record
    const diff: CrawlDiff = {
      id: crypto.randomUUID(),
      current_crawl_id: crawlId,
      previous_crawl_id: prevRow.id,
      url_count_delta: urlCountDelta,
      new_urls_count: newUrls,
      removed_urls_count: removedUrls,
      broken_links_delta: brokenLinksDelta,
      issues_delta: issuesDelta,
      critical_issues_delta: criticalIssuesDelta
    }

    this.db.prepare(`
      INSERT INTO crawl_diffs (id, current_crawl_id, previous_crawl_id, url_count_delta, new_urls_count, removed_urls_count, broken_links_delta, issues_delta, critical_issues_delta, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(diff.id, diff.current_crawl_id, diff.previous_crawl_id, diff.url_count_delta,
      diff.new_urls_count, diff.removed_urls_count, diff.broken_links_delta,
      diff.issues_delta, diff.critical_issues_delta)

    return diff
  }

  /** Get the latest diff for a given crawl */
  getDiff(crawlId: string): CrawlDiff | null {
    const row = this.db.prepare(
      'SELECT * FROM crawl_diffs WHERE current_crawl_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(crawlId) as CrawlDiff | undefined
    return row || null
  }

  /** Get all diffs for a project's crawls, ordered newest first */
  getDiffsForProject(projectId: string): Array<CrawlDiff & { current_url_count: number }> {
    // Join with crawls to filter by project
    return this.db.prepare(`
      SELECT cd.*, cur.total as current_url_count FROM crawl_diffs cd
      JOIN crawls c ON cd.current_crawl_id = c.id
      LEFT JOIN (SELECT crawl_id, COUNT(*) as total FROM urls GROUP BY crawl_id) cur ON cur.crawl_id = cd.current_crawl_id
      WHERE c.project_id = ?
      ORDER BY cd.created_at DESC
    `).all(projectId) as Array<CrawlDiff & { current_url_count: number }>
  }
}
