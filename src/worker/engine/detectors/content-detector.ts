import type { PageResult } from '../../../shared/types/url'
import type { IssueRecordInput } from '../../../shared/types/issue'

/**
 * Detects title, meta description, heading and word count issues.
 */
export function detectContentIssues(result: PageResult): IssueRecordInput[] {
  const issues: IssueRecordInput[] = []
  if (!result.seo) return issues

  const seo = result.seo

  // --- Title checks ---
  if (!seo.title || seo.title.trim().length === 0) {
    issues.push({
      crawlId: result.crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'missing_title', severity: 'high',
      message: 'Page has no <title> tag or it is empty.',
      recommendation: 'Add a descriptive, unique <title> tag to this page.',
    })
  } else {
    if (seo.titleLength > 60) {
      issues.push({
        crawlId: result.crawlId, url: result.url, urlId: result.urlId,
        issue_type: 'title_too_long', severity: 'low',
        message: `Title is ${seo.titleLength} characters long, which may be truncated in search results.`,
        recommendation: 'Shorten the title to approximately 50-60 characters.',
      })
    }
    if (seo.titleLength > 0 && seo.titleLength < 30) {
      issues.push({
        crawlId: result.crawlId, url: result.url, urlId: result.urlId,
        issue_type: 'title_too_short', severity: 'low',
        message: `Title is only ${seo.titleLength} characters, providing insufficient context.`,
        recommendation: 'Expand the title to include more descriptive keywords (target 40-60 chars).',
      })
    }
  }

  // --- Meta description checks ---
  if (!seo.metaDescription || seo.metaDescription.trim().length === 0) {
    issues.push({
      crawlId: result.crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'missing_meta_description', severity: 'medium',
      message: 'Page has no meta description.',
      recommendation: 'Add a concise meta description of 120-155 characters.',
    })
  } else {
    if (seo.metaDescriptionLength > 160) {
      issues.push({
        crawlId: result.crawlId, url: result.url, urlId: result.urlId,
        issue_type: 'meta_description_too_long', severity: 'low',
        message: `Meta description is ${seo.metaDescriptionLength} characters and may be truncated.`,
        recommendation: 'Shorten to 120-155 characters for optimal display in search results.',
      })
    }
    if (seo.metaDescriptionLength > 0 && seo.metaDescriptionLength < 70) {
      issues.push({
        crawlId: result.crawlId, url: result.url, urlId: result.urlId,
        issue_type: 'meta_description_too_short', severity: 'low',
        message: `Meta description is only ${seo.metaDescriptionLength} characters.`,
        recommendation: 'Expand to 120-155 characters to provide better context for searchers.',
      })
    }
  }

  // --- H1 checks ---
  if (!seo.h1 || seo.h1.trim().length === 0) {
    issues.push({
      crawlId: result.crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'missing_h1', severity: 'medium',
      message: 'Page has no H1 heading.',
      recommendation: 'Add exactly one descriptive H1 that summarizes the page content.',
    })
  } else if (seo.h1Count > 1) {
    issues.push({
      crawlId: result.crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'multiple_h1', severity: 'low',
      message: `Page has ${seo.h1Count} H1 headings.`,
      recommendation: 'Use a single H1 per page; convert additional ones to H2 or lower.',
    })
  }

  // --- Feature 1.1: Missing H2 ---
  const h2Count = seo.h2?.count ?? 0
  if (h2Count === 0 && seo.wordCount > 0) {
    issues.push({
      crawlId: result.crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'missing_h2', severity: 'low',
      message: 'Page has no H2 headings.',
      recommendation: 'Add descriptive H2 sections to structure your content and improve readability.',
    })
  }

  // --- Feature 1.1: Heading non-sequential detection ---
  detectNonSequentialHeadings(result, issues)

  // --- Noindex check ---
  const isNoindex = (seo.robotsMeta && /\b(?:noindex|none)\b/i.test(seo.robotsMeta)) ||
    (!!result.seo?.xRobotsTag && /\b(?:noindex|none)\b/i.test(result.seo.xRobotsTag))
  if (isNoindex) {
    issues.push({
      crawlId: result.crawlId, url: result.url, urlId: result.urlId,
      issue_type: 'important_page_noindex', severity: 'high',
      message: 'Page is set to noindex and will be excluded from search engine results.',
      recommendation: 'Remove noindex directive if this page should rank in search engines.',
    })
  }

  return issues
}

/**
 * Check for heading hierarchy that skips levels (e.g., H1 → H3 without H2).
 */
function detectNonSequentialHeadings(result: PageResult, issues: IssueRecordInput[]): void {
  const seo = result.seo!

  // Build a list of heading levels present on the page with their counts
  type LevelInfo = { level: number; count: number }
  const levelsPresent: LevelInfo[] = []

  // H1 always exists as part of SeoData
  if ((seo.h1Count ?? 0) > 0) levelsPresent.push({ level: 1, count: seo.h1Count! })

  const headings = ['h2', 'h3', 'h4', 'h5', 'h6'] as const
  for (const h of headings) {
    const headingData = seo[h]
    if (headingData && headingData.count > 0) {
      levelsPresent.push({ level: parseInt(h.slice(1)), count: headingData.count })
    }
  }

  // Determine max level reached so far while iterating through encountered levels
  let prevLevel = -1
  for (const info of levelsPresent) {
    if (info.level > prevLevel + 1) {
      // Found a skip — report at most one issue per page
      issues.push({
        crawlId: result.crawlId, url: result.url, urlId: result.urlId,
        issue_type: 'heading_non_sequential', severity: 'medium',
        message: `Heading hierarchy skips from H${prevLevel} to H${info.level}.`,
        recommendation: 'Headings should follow sequential order (H1 → H2 → H3). Fix the heading structure for better accessibility and SEO.',
      })
      break
    }
    prevLevel = Math.max(prevLevel, info.level)
  }
}
