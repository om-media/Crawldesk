// Simple XML sitemap parser using basic string parsing (avoids heavy DOM deps in worker)
export interface SitemapUrl {
  loc: string
  lastmod: string | null
  changefreq: string | null
  priority: number | null
  images?: SitemapImage[]
  videos?: SitemapVideo[]
}

export interface SitemapImage {
  loc: string
  title: string | null
  caption: string | null
  geo_location: string | null
}

export interface SitemapVideo {
  thumbnail_loc: string
  title: string | null
  description: string | null
  duration: number | null
}

export interface SitemapIndexEntry {
  loc: string
  lastmod: string | null
}

export type ParsedSitemap =
  | { kind: 'urlset'; urls: SitemapUrl[] }
  | { kind: 'sitemapindex'; entries: SitemapIndexEntry[] }

function getTagValue(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<(?:[\\w-]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, 'i'))
  return match?.[1]?.trim() || null
}

function getBlocks(block: string, tag: string): string[] {
  const blocks: string[] = []
  const regex = new RegExp(`<(?:[\\w-]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, 'gi')
  let match
  while ((match = regex.exec(block)) !== null) {
    blocks.push(match[1])
  }
  return blocks
}

export function parseSitemap(xml: string): ParsedSitemap | null {
  try {
    if (!xml.trim()) return null

    if (isSitemapIndex(xml)) {
      const entries = parseSitemapIndex(xml)
      return entries.length > 0 ? { kind: 'sitemapindex', entries } : null
    }

    const urls: SitemapUrl[] = []
    // Match <url><loc>...</loc></url> blocks
    const urlRegex = /<url[^>]*>([\s\S]*?)<\/url>/gi
    let match
    while ((match = urlRegex.exec(xml)) !== null) {
      const block = match[1]
      const loc = getTagValue(block, 'loc')
      if (loc) {
        const priority = getTagValue(block, 'priority')
        urls.push({
          loc,
          lastmod: getTagValue(block, 'lastmod'),
          changefreq: getTagValue(block, 'changefreq'),
          priority: priority ? parseFloat(priority) : null,
          images: parseImages(block),
          videos: parseVideos(block)
        })
      }
    }
    return urls.length > 0 ? { kind: 'urlset', urls } : null
  } catch {
    return null
  }
}

export function parseSitemapIndex(xml: string): SitemapIndexEntry[] {
  try {
    const entries: SitemapIndexEntry[] = []
    const sitemapRegex = /<sitemap[^>]*>([\s\S]*?)<\/sitemap>/gi
    let match
    while ((match = sitemapRegex.exec(xml)) !== null) {
      const block = match[1]
      const loc = getTagValue(block, 'loc')
      if (loc) {
        entries.push({ loc, lastmod: getTagValue(block, 'lastmod') })
      }
    }
    return entries
  } catch {
    return []
  }
}

export function parseSitemapDocument(xml: string): ParsedSitemap | null {
  return parseSitemap(xml)
}

export function isSitemapIndex(xml: string): boolean {
  return /<sitemap(?:\s|>|\/)/i.test(xml) && !/<url(?:\s|>|\/)/i.test(xml)
}

function parseImages(block: string): SitemapImage[] {
  return getBlocks(block, 'image').map((imageBlock) => ({
    loc: getTagValue(imageBlock, 'loc') ?? '',
    title: getTagValue(imageBlock, 'title'),
    caption: getTagValue(imageBlock, 'caption'),
    geo_location: getTagValue(imageBlock, 'geo_location')
  })).filter((image) => image.loc.length > 0)
}

function parseVideos(block: string): SitemapVideo[] {
  return getBlocks(block, 'video').map((videoBlock) => {
    const duration = getTagValue(videoBlock, 'duration')
    return {
      thumbnail_loc: getTagValue(videoBlock, 'thumbnail_loc') ?? '',
      title: getTagValue(videoBlock, 'title'),
      description: getTagValue(videoBlock, 'description'),
      duration: duration ? parseInt(duration, 10) : null
    }
  }).filter((video) => video.thumbnail_loc.length > 0)
}
