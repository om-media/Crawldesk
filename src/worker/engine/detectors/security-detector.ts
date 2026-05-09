import type { PageResult, ExtractedLink } from '../../../shared/types/url'
import type { IssueRecordInput } from '../../../shared/types/issue'

/**
 * Detects security header issues and mixed content on HTTPS pages.
 */
export function detectSecurityIssues(result: PageResult): IssueRecordInput[] {
  const issues: IssueRecordInput[] = []
  if (!result.seo) return issues

  // Security headers come from fetcher response
  const headers: Record<string, string> = result.responseHeaders ?? {}
  const isHttps = result.url.startsWith('https://')

  // --- Missing X-Content-Type-Options ---
  if (!headers['x-content-type-options']?.includes('nosniff')) {
    issues.push({
      crawlId: result.crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'missing_x_content_type_options', severity: 'medium',
      message: 'Missing X-Content-Type-Options: nosniff header.',
      recommendation: 'Add this header to prevent MIME-type sniffing attacks.',
    })
  }

  // --- Missing clickjacking protection (X-Frame-Options or CSP frame-ancestors) ---
  const hasXfo = !!headers['x-frame-options']
  const csp = headers['content-security-policy'] || ''
  const hasCspFrameAncestors = /frame-ancestors\b/i.test(csp)
  if (!hasXfo && !hasCspFrameAncestors) {
    issues.push({
      crawlId: result.crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'missing_x_frame_options', severity: 'low',
      message: 'Page lacks clickjacking protection.',
      recommendation: 'Set X-Frame-Options: SAMEORIGIN or add Content-Security-Policy with frame-ancestors directive.',
    })
  }

  // --- Missing HSTS on HTTPS pages ---
  if (isHttps && !headers['strict-transport-security']) {
    issues.push({
      crawlId: result.crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'missing_hsts', severity: 'medium',
      message: 'HTTPS page is missing HSTS header.',
      recommendation: 'Enable Strict-Transport-Security with a max-age of at least 31536000 (1 year).',
    })
  }

  // --- Feature 1.5: Mixed content detection — HTTP resources on HTTPS pages ---
  if (isHttps && result.links) {
    const httpResources = result.links.filter(
      (l: ExtractedLink) => (l.linkType === 'image' || l.linkType === 'script' || l.linkType === 'css')
        && l.targetUrl.startsWith('http://')
    )
    if (httpResources.length > 0) {
      issues.push({
        crawlId: result.crawlId, url: result.url, urlId: result.urlId,
        issue_type: 'mixed_content', severity: 'high',
        message: `Found ${httpResources.length} HTTP resource(s) on an HTTPS page (e.g., "${httpResources[0].targetUrl.slice(0, 80)}...").`,
        recommendation: 'Change all HTTP resource URLs to HTTPS. Mixed content blocks secure features and shows browser warnings.',
      })
    }
  }

  return issues
}
