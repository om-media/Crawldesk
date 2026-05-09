import type { PageResult, HreflangEntry } from '../../../shared/types/url'
import type { IssueRecordInput } from '../../../shared/types/issue'

/**
 * Feature 3.1/3.2 — Hreflang extraction from <link rel="alternate"> tags.
 * Returns extracted entries; inline issues are reported here, deep validation
 * (reciprocity, self-ref completeness) runs in the post-crawl analyzer.
 */
export function extractHreflangs(html: string): HreflangEntry[] {
  const entries: HreflangEntry[] = []
  // Match <link ... > with both rel="alternate" and hreflang attributes
  const regex = /<link\s+[^>]*rel=["'](?:alternate|Alternate)["'][^>]*(?:hreflang=["']([^"']+)["'])[^>\n]*href=["']([^"']+)["'][^>]*/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    const hreflang = match[1]?.trim() ?? ''
    const href = match[2].trim()
    if (!href || !hreflang) continue
    // Also check for media attribute
    const mediaMatch = match[0].match(/media=["']([^"']+)["']/i)
    entries.push({
      hreflang,
      href,
      media: mediaMatch?.[1] ?? null,
    })
  }

  // Also try reversed order: href before rel/hreflang
  const revRegex = /<link\s+[^>]*href=["']([^"']+)["'][^>]*(?:hreflang=["']([^"']+)["'])[^>]*rel=["'](?:alternate|Alternate)["'][^>]*/gi
  while ((match = revRegex.exec(html)) !== null) {
    const href = match[1].trim()
    const hreflang = (match[2] ?? '').trim()
    if (!href || !hreflang) continue
    // Avoid duplicates already found by first pass
    if (entries.some(e => e.href === href && e.hreflang === hreflang)) continue
    const mediaMatch = match[0].match(/media=["']([^"']+)["']/i)
    entries.push({
      hreflang,
      href,
      media: mediaMatch?.[1] ?? null,
    })
  }

  return entries
}

/** Check for obvious inline hreflang issues on this page. */
export function detectHreflangIssues(result: PageResult): IssueRecordInput[] {
  const issues: IssueRecordInput[] = []
  if (!result.seo?.hreflangs || result.seo.hreflangs.length === 0) return issues

  const entries = result.seo.hreflangs
  const seenLangs = new Map<string, number>()

  for (let i = 0; i < entries.length; i++) {
    seenLangs.set(entries[i].hreflang, (seenLangs.get(entries[i].hreflang) ?? 0) + 1)
  }

  // Duplicate language codes on the same page
  for (const [lang, count] of seenLangs.entries()) {
    if (count > 1) {
      issues.push({
        crawlId: result.crawlId, url: result.url, urlId: result.urlId,
        issue_type: 'hreflang_duplicate_lang', severity: 'high',
        message: `Language code "${lang}" appears ${count} times in hreflang tags on this page.`,
        recommendation: 'Each hreflang value should be unique per page. Remove duplicate entries.',
      })
    }
  }

  // Validate language code format (basic BCP-47 check)
  const validLangRegex = /^(\*|[a-z]{2}(?:-[A-Z]{2})?|(x-default))$/i
  for (const entry of entries) {
    if (!validLangRegex.test(entry.hreflang) && entry.hreflang !== '*') {
      issues.push({
        crawlId: result.crawlId, url: result.url, urlId: result.urlId,
        issue_type: 'hreflang_invalid_code', severity: 'medium',
        message: `Invalid hreflang code: "${entry.hreflang}". Expected a valid BCP-47 language tag or "x-default".`,
        recommendation: 'Use ISO 639-1 language codes (e.g., "en", "de") with optional region (e.g., "en-US").',
      })
    }
  }

  return issues
}
