import * as cheerio from 'cheerio'
import { createHash } from 'crypto'
import type { SeoData, ExtractedLink } from '../../shared/types/url'

export function extractSeo(html: string, pageUrl: string): SeoData & { links: ExtractedLink[] } {
  const $ = cheerio.load(html)

  let title = $('title').first().text()?.trim().replace(/\s+/g, ' ') || null
  const titleLength = title?.length ?? 0
  void $('title').length

  let metaDescription = $('meta[name="description"]').attr('content')?.trim().replace(/\s+/g, ' ') || null
  const metaDescriptionLength = metaDescription?.length ?? 0

  const h1Elements = $('h1')
  const h1Count = h1Elements.length
  const h1 = h1Elements.first().text()?.trim().replace(/\s+/g, ' ') || null

  const canonicalEls = $('link[rel~="canonical"]')
  const canonicalRaw = canonicalEls.first().attr('href')?.trim() || null
  const canonical = resolveRelative(canonicalRaw, pageUrl)

  let robotsMeta = $('meta[name="robots"]').first().attr('content')?.trim() || null
  if (!robotsMeta) {
    robotsMeta = $('meta[name="googlebot"]').first().attr('content')?.trim() || null
  }

  let xRobotsTag: string | null = null
  const robotsHeader = $('head meta[property="x-robots-tag" i]')
  if (robotsHeader.length > 0) {
    xRobotsTag = robotsHeader.first().attr('content')?.trim() || null
  }

  $('script, style, noscript, svg').remove()
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim()
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0

  const contentHash = createHash('sha256').update(bodyText).digest('hex').slice(0, 16)

  const links: ExtractedLink[] = []

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href) return
    const anchorText = $(el).text()?.trim() || ''
    const rel = $(el).attr('rel')
    links.push({ targetUrl: href, anchorText, linkType: 'html_a', rel })
  })

  $('img[src]').each((_, el) => {
    const src = $(el).attr('src')
    if (src) links.push({ targetUrl: src, linkType: 'image' })
  })

  $('link[rel="stylesheet"], link[type="text/css"]').each((_, el) => {
    const href = $(el).attr('href')
    if (href) links.push({ targetUrl: href, linkType: 'css' })
  })

  $('script[src]').each((_, el) => {
    const src = $(el).attr('src')
    if (src) links.push({ targetUrl: src, linkType: 'script' })
  })

  $('iframe[src]').each((_, el) => {
    const src = $(el).attr('src')
    if (src) links.push({ targetUrl: src, linkType: 'iframe' })
  })

  return { title, titleLength, metaDescription, metaDescriptionLength, h1, h1Count, canonical, robotsMeta, xRobotsTag, wordCount, contentHash, links }
}

function resolveRelative(href: string | null, base: string): string | null {
  if (!href) return null
  try {
    return new URL(href, base).href
  } catch {
    return href
  }
}
