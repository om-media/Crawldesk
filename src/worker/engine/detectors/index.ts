import type { PageResult } from '../../../shared/types/url'
import type { IssueRecordInput } from '../../../shared/types/issue'
import { detectContentIssues } from './content-detector'
import { detectCanonicalIssues } from './canonical-detector'
import { detectImageIssues } from './image-detector'
import { detectSocialIssues } from './social-detector'
import { detectSecurityIssues } from './security-detector'
import { detectHreflangIssues } from './hreflang-detector'
import { detectStructuredDataIssues } from './structured-data-detector'

/**
 * Aggregator that runs all inline detectors on a single page result.
 */
export function detectIssues(result: PageResult): IssueRecordInput[] {
  const issues: IssueRecordInput[] = []

  // Server error check (always first, before SEO checks)
  if (result.statusCode && result.statusCode >= 500) {
    issues.push({
      crawlId: result.crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'server_error_5xx', severity: 'critical',
      message: `Server returned status code ${result.statusCode}.`,
      recommendation: 'Investigate server logs and fix the underlying application error.',
    })
  }

  // Only run content-level checks on successful HTML pages with SEO data
  const isHtml200 = !!(result.seo
    && (!result.fetchErrorCode)
    && (!result.skippedReason)
    && (result.contentType?.includes('text/html') || !result.contentType)
    && (result.statusCode === 200))

  if (isHtml200) {
    issues.push(...detectContentIssues(result))
    issues.push(...detectCanonicalIssues(result))
    issues.push(...detectImageIssues(result))
    issues.push(...detectSocialIssues(result))
    issues.push(...detectSecurityIssues(result))
    issues.push(...detectHreflangIssues(result))
    issues.push(...detectStructuredDataIssues(result))

    // Redirect chain
    if (result.redirectChain && result.redirectChain.length > 1) {
      issues.push({
        crawlId: result.crawlId, url: result.url, urlId: result.urlId,
        issue_type: 'redirect_chain', severity: 'medium',
        message: `URL has a redirect chain of ${result.redirectChain.length} hops.`,
        recommendation: 'Update links to point directly to the final destination URL.',
      })
    }

    // Slow response (>2000ms)
    if (result.responseTimeMs && result.responseTimeMs > 2000) {
      issues.push({
        crawlId: result.crawlId, url: result.url, urlId: result.urlId,
        issue_type: 'slow_response', severity: 'low',
        message: `Response time was ${result.responseTimeMs}ms (over 2 seconds).`,
        recommendation: 'Optimize server performance through caching, CDN usage, or backend improvements.',
      })
    }
  }

  return issues
}
