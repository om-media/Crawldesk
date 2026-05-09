import { describe, it, expect } from 'vitest'
import { generateSitemap } from '../src/shared/utils/xml-sitemap-generator'

describe('generateSitemap', () => {
  function makeUrl(url: string, opts?: { status_code?: number; indexability?: string }): any {
    return {
      url,
      updated_at: '2026-05-01T00:00:00Z',
      title: 'Test Page',
      status_code: opts?.status_code ?? 200,
      indexability: opts?.indexability ?? 'indexable',
      images_with_alt_json: null,
    }
  }

  describe('basic generation', () => {
    it('generates valid XML with a single URL', () => {
      const result = generateSitemap({ urls: [makeUrl('https://example.com/page')] })
      expect(result.kind).toBe('urlset')
      expect(result.xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
      expect(result.xml).toContain('<loc>https://example.com/page</loc>')
      expect(result.urlCount).toBe(1)
    })

    it('includes lastmod from updated_at field', () => {
      const result = generateSitemap({ urls: [makeUrl('https://example.com/lastmod')] })
      expect(result.xml).toContain('<lastmod>2026-05-01</lastmod>')
    })

    it('handles multiple URLs', () => {
      const urls = Array.from({ length: 3 }, (_, i) => makeUrl(`https://example.com/p${i}`))
      const result = generateSitemap({ urls })
      expect(result.urlCount).toBe(3)
      for (const u of urls) {
        expect(result.xml).toContain(u.url)
      }
    })
  })

  describe('filtering', () => {
    it('excludes non-200 status codes when onlyHttp200 is true', () => {
      const urls = [makeUrl('https://example.com/ok'), makeUrl('https://example.com/gone', { status_code: 410 })]
      const result = generateSitemap({ urls, onlyHttp200: true })
      expect(result.urlCount).toBe(1)
      expect(result.xml).not.toContain('/gone')
    })

    it('includes all statuses when onlyHttp200 is false', () => {
      const urls = [makeUrl('https://example.com/a'), makeUrl('https://example.com/b', { status_code: 500 })]
      const result = generateSitemap({ urls, onlyHttp200: false })
      expect(result.urlCount).toBe(2)
    })

    it('excludes non-indexable pages when onlyIndexable is true', () => {
      const urls = [makeUrl('https://example.com/idx'), makeUrl('https://example.com/nox', { indexability: 'non_indexable' })]
      const result = generateSitemap({ urls, onlyIndexable: true })
      expect(result.urlCount).toBe(1)
      expect(result.xml).not.toContain('/nox')
    })

    it('escapes XML special characters (&)', () => {
      const urls = [makeUrl('https://example.com/page?q=1&test')]  // raw ampersand
      const result = generateSitemap({ urls })
      // Raw '&' must be escaped to '&amp;' in XML output
      expect(result.xml).toContain('<loc>https://example.com/page?q=1&amp;test</loc>')
    })

    it('escapes other XML special characters (< > " \')', () => {
      const urls = [makeUrl("https://example.com/p?a<b&c>d\"e'f")]
      const result = generateSitemap({ urls })
      expect(result.xml).toContain('a&lt;b&amp;c&gt;d&quot;e&apos;f')
    })
  })

  describe('image sitemap support', () => {
    it('includes image entries when includeImages is true', () => {
      const urlWithImages = makeUrl('https://example.com/photos')
      urlWithImages.images_with_alt_json = JSON.stringify([{ src: 'https://example.com/img.jpg' }])
      const result = generateSitemap({ urls: [urlWithImages], includeImages: true })
      expect(result.xml).toContain('<image:image>')
      expect(result.xml).toContain('<image:loc>https://example.com/img.jpg</image:loc>')
    })

    it('does not include images by default', () => {
      const urlWithImages = makeUrl('https://example.com/photos')
      urlWithImages.images_with_alt_json = JSON.stringify([{ src: 'https://example.com/img.jpg' }])
      const result = generateSitemap({ urls: [urlWithImages], includeImages: false })
      expect(result.xml).not.toContain('<image:image>')
    })
  })

  describe('splitting large sitemaps', () => {
    it('splits into multiple files with index when exceeding maxUrlsPerFile', () => {
      const urls = Array.from({ length: 6 }, (_, i) => makeUrl(`https://example.com/page${i}`))
      const result = generateSitemap({ urls, maxUrlsPerFile: 3 })
      expect(result.kind).toBe('sitemapindex')
      expect(result.parts).toBeDefined()
      // Should have 2 parts: sitemap.xml (first 3) + sitemap-1.xml (next 3)
      expect(Object.keys(result.parts!).length).toBe(2)
      expect(result.urlCount).toBe(6)
      expect(result.xml).toContain('<sitemapindex')
    })

    it('produces a single file when under limit', () => {
      const urls = Array.from({ length: 2 }, (_, i) => makeUrl(`https://example.com/u${i}`))
      const result = generateSitemap({ urls, maxUrlsPerFile: 50_000 })
      expect(result.kind).toBe('urlset')
      expect(result.parts).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('returns empty urlset for zero URLs after filtering', () => {
      const result = generateSitemap({ urls: [makeUrl('https://example.com/x', { status_code: 404 })], onlyHttp200: true })
      expect(result.kind).toBe('urlset')
      expect(result.urlCount).toBe(0)
    })

    it('handles null updated_at gracefully', () => {
      const urlRow = makeUrl('https://example.com/no-date')
      urlRow.updated_at = null
      const result = generateSitemap({ urls: [urlRow] })
      // Should not throw and should NOT have lastmod
      expect(result.xml).not.toContain('<lastmod>')
    })
  })
})
