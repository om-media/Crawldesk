import type { PageResult } from '../../shared/types/url'
import type { IssueRecordInput } from '../../shared/types/issue'

export function detectIssues(result: PageResult): IssueRecordInput[] {
  const issues: IssueRecordInput[] = []
  const crawlId = result.crawlId
  const isHtml200 = (result.statusCode === 200 || !result.contentType || result.contentType.includes('text/html')) &&
    (!result.fetchErrorCode) && (!result.skippedReason) && result.seo !== undefined

  if (!isHtml200) {
    // Server error check
    if (result.statusCode && result.statusCode >= 500) {
      issues.push({
        crawlId, url: result.url, issue_type: 'server_error_5xx', severity: 'critical',
        message: `Server returned status code ${result.statusCode}.`,
        recommendation: 'Investigate server logs and fix the underlying application error.'
      })
    }
    return issues
  }

  const seo = result.seo!

  // Missing title
  if (!seo.title || seo.title.trim().length === 0) {
    issues.push({
      crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'missing_title', severity: 'high',
      message: 'Page has no <title> tag or it is empty.',
      recommendation: 'Add a descriptive, unique <title> tag to this page.'
    })
  } else {
    // Title too long (>60 chars)
    if (seo.titleLength > 60) {
      issues.push({
        crawlId, url: result.url, urlId: result.urlId,
        issue_type: 'title_too_long', severity: 'low',
        message: `Title is ${seo.titleLength} characters long, which may be truncated in search results.`,
        recommendation: 'Shorten the title to approximately 50-60 characters.'
      })
    }
    // Title too short (<30 chars)
    if (seo.titleLength > 0 && seo.titleLength < 30) {
      issues.push({
        crawlId, url: result.url, urlId: result.urlId,
        issue_type: 'title_too_short', severity: 'low',
        message: `Title is only ${seo.titleLength} characters, providing insufficient context.`,
        recommendation: 'Expand the title to include more descriptive keywords (target 40-60 chars).'
      })
    }
  }

  // Missing meta description
  if (!seo.metaDescription || seo.metaDescription.trim().length === 0) {
    issues.push({
      crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'missing_meta_description', severity: 'medium',
      message: 'Page has no meta description.',
      recommendation: 'Add a concise meta description of 120-155 characters.'
    })
  } else {
    if (seo.metaDescriptionLength > 160) {
      issues.push({
        crawlId, url: result.url, urlId: result.urlId,
        issue_type: 'meta_description_too_long', severity: 'low',
        message: `Meta description is ${seo.metaDescriptionLength} characters and may be truncated.`,
        recommendation: 'Shorten to 120-155 characters for optimal display in search results.'
      })
    }
    if (seo.metaDescriptionLength > 0 && seo.metaDescriptionLength < 70) {
      issues.push({
        crawlId, url: result.url, urlId: result.urlId,
        issue_type: 'meta_description_too_short', severity: 'low',
        message: `Meta description is only ${seo.metaDescriptionLength} characters.`,
        recommendation: 'Expand to 120-155 characters to provide better context for searchers.'
      })
    }
  }

  // Missing H1
  if (!seo.h1 || seo.h1.trim().length === 0) {
    issues.push({
      crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'missing_h1', severity: 'medium',
      message: 'Page has no H1 heading.',
      recommendation: 'Add exactly one descriptive H1 that summarizes the page content.'
    })
  } else if (seo.h1Count > 1) {
    issues.push({
      crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'multiple_h1', severity: 'low',
      message: `Page has ${seo.h1Count} H1 headings.`,
      recommendation: 'Use a single H1 per page; convert additional ones to H2 or lower.'
    })
  }

  // Noindex detection
  const isNoindex = (seo.robotsMeta && /\b(?:noindex|none)\b/i.test(seo.robotsMeta)) ||
    (!!result.seo?.xRobotsTag && /\b(?:noindex|none)\b/i.test(result.seo.xRobotsTag))
  if (isNoindex) {
    issues.push({
      crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'important_page_noindex', severity: 'high',
      message: 'Page is set to noindex and will be excluded from search engine results.',
      recommendation: 'Remove noindex directive if this page should rank in search engines.'
    })
  }

  // Canonicalized URL check
  if (seo.canonical) {
    try {
      const pageNorm = new URL(result.url).href.toLowerCase().replace(/\/+$/, '')
      const canonNorm = new URL(seo.canonical).href.toLowerCase().replace(/\/+$/, '')
      if (canonNorm !== pageNorm) {
        issues.push({
          crawlId, url: result.url, urlId: result.urlId,
          issue_type: 'canonicalized_url', severity: 'medium',
          message: `Canonical points to ${seo.canonical}, which differs from the current URL.`,
          recommendation: 'Verify the canonical target is correct or self-reference if this page should rank independently.'
        })
      }
    } catch {}
  }

  // Redirect chain
  if (result.redirectChain && result.redirectChain.length > 1) {
    issues.push({
      crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'redirect_chain', severity: 'medium',
      message: `URL has a redirect chain of ${result.redirectChain.length} hops.`,
      recommendation: 'Update links to point directly to the final destination URL.'
    })
  }

  // Slow response (>2000ms)
  if (result.responseTimeMs && result.responseTimeMs > 2000) {
    issues.push({
      crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'slow_response', severity: 'low',
      message: `Response time was ${result.responseTimeMs}ms (over 2 seconds).`,
      recommendation: 'Optimize server performance through caching, CDN usage, or backend improvements.'
    })
  }

  return issues
}
