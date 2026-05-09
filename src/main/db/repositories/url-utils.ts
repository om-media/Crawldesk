import type { PageResult } from '../../../shared/types/url'
import type { Indexability } from '../../../shared/types/url'

export function getIndexability(result: PageResult): { indexability: Indexability; reason: string } {
  // Unknown if fetch failed
  if (result.statusCode == null) {
    return { indexability: 'unknown', reason: result.fetchErrorMessage ?? 'Fetch failed' }
  }

  // Non-indexable for non-200 status
  if (result.statusCode < 200 || result.statusCode >= 300) {
    return { indexability: 'non_indexable', reason: `Status code ${result.statusCode}` }
  }

  // Check robots meta noindex
  if (result.seo?.robotsMeta && /\b(?:noindex|none)\b/i.test(result.seo.robotsMeta)) {
    return { indexability: 'non_indexable', reason: 'Blocked by meta robots noindex' }
  }

  // Check X-Robots-Tag header
  if (result.seo?.xRobotsTag && /\b(?:noindex|none)\b/i.test(result.seo.xRobotsTag)) {
    return { indexability: 'non_indexable', reason: 'Blocked by X-Robots-Tag noindex' }
  }

  // Check canonical pointing elsewhere
  const pageNorm = normalizeSimple(result.url)
  if (result.seo?.canonical) {
    const canonNorm = normalizeSimple(result.seo.canonical)
    if (canonNorm !== '' && pageNorm !== canonNorm) {
      return { indexability: 'non_indexable', reason: 'Canonical points to a different URL' }
    }
  }

  return { indexability: 'indexable', reason: '' }
}

function normalizeSimple(url: string): string {
  try {
    const u = new URL(url)
    let href = u.href.toLowerCase()
    // Remove trailing slash except for root
    if (href.endsWith('/') && href.length > u.protocol.length + '//'.length + u.hostname.length + 1) {
      href = href.slice(0, -1)
    }
    return href
  } catch {
    return url.toLowerCase().replace(/\/+$/, '')
  }
}
