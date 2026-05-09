import type { PageResult } from '../../../shared/types/url'
import type { IssueRecordInput } from '../../../shared/types/issue'

/**
 * Detects canonical-related issues: missing tag, external domain, mismatched URL.
 */
export function detectCanonicalIssues(result: PageResult): IssueRecordInput[] {
  const issues: IssueRecordInput[] = []
  if (!result.seo) return issues

  const seo = result.seo!

  // --- No canonical tag ---
  if (!seo.canonical) {
    issues.push({
      crawlId: result.crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'no_canonical_tag', severity: 'medium',
      message: 'Page has no canonical link element.',
      recommendation: 'Add a self-referencing canonical tag to every page to prevent duplicate content issues.',
    })
    return issues
  }

  try {
    const pageUrl = new URL(result.url)
    const canonUrl = new URL(seo.canonical)

    // --- External canonical ---
    if (canonUrl.hostname.toLowerCase() !== pageUrl.hostname.toLowerCase()) {
      issues.push({
        crawlId: result.crawlId, url: result.url, urlId: result.urlId,
        issue_type: 'external_canonical', severity: 'high',
        message: `Canonical points to external domain: ${canonUrl.hostname}.`,
        recommendation: 'External canonicalization may cause ranking signals to flow away from your site. Verify this is intentional.',
      })
    }

    // --- Canonicalized URL (mismatch with current URL) ---
    const pageNorm = pageUrl.href.toLowerCase().replace(/\/+$/, '')
    const canonNorm = canonUrl.href.toLowerCase().replace(/\/+$/, '')
    if (canonNorm !== pageNorm) {
      issues.push({
        crawlId: result.crawlId, url: result.url, urlId: result.urlId,
        issue_type: 'canonicalized_url', severity: 'medium',
        message: `Canonical points to ${seo.canonical}, which differs from the current URL.`,
        recommendation: 'Verify the canonical target is correct or self-reference if this page should rank independently.',
      })
    }
  } catch {
    // Invalid URL — skip canonical checks
  }

  return issues
}
