import { describe, it, expect } from 'vitest'
import { parseSitemap, isSitemapIndex } from '../src/worker/engine/sitemap'

describe('parseSitemap', () => {
  describe('urlset parsing', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url>
          <loc>https://example.com/page-a</loc>
          <lastmod>2026-05-01</lastmod>
          <changefreq>daily</changefreq>
          <priority>0.9</priority>
        </url>
        <url>
          <loc>https://example.com/page-b</loc>
        </url>
      </urlset>`

    it('parses basic urlset with loc fields', () => {
      const result = parseSitemap(xml)
      expect(result).not.toBeNull()
      if (!result) return
      expect(result.kind).toBe('urlset')
      expect(result.urls).toHaveLength(2)
      expect(result.urls[0].loc).toBe('https://example.com/page-a')
      expect(result.urls[1].loc).toBe('https://example.com/page-b')
    })

    it('extracts lastmod, changefreq, priority when present', () => {
      const result = parseSitemap(xml)
      expect(result?.urls[0].lastmod).toBe('2026-05-01')
      expect(result?.urls[0].changefreq).toBe('daily')
      expect(result?.urls[0].priority).toBeCloseTo(0.9)
    })

    it('returns null for missing optional fields on second entry', () => {
      const result = parseSitemap(xml)
      expect(result?.urls[1].lastmod).toBeNull()
      expect(result?.urls[1].changefreq).toBeNull()
      expect(result?.urls[1].priority).toBeNull()
    })

    it('ignores invalid priority values gracefully', () => {
      const badPriorityXml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/p</loc><priority>invalid</priority></url>
      </urlset>`
      // Should not throw; just returns the string as-is from parseFloat (NaN → stored as-is)
      const result = parseSitemap(badPriorityXml)
      expect(result).not.toBeNull()
    })
  })

  describe('sitemapindex parsing', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap>
          <loc>https://example.com/sitemap-en.xml</loc>
          <lastmod>2026-04-01</lastmod>
        </sitemap>
        <sitemap>
          <loc>https://example.com/sitemap-de.xml</loc>
        </sitemap>
      </sitemapindex>`

    it('parses sitemapindex entries', () => {
      const result = parseSitemap(xml)
      expect(result).not.toBeNull()
      if (!result) return
      expect(result.kind).toBe('sitemapindex')
      expect(result.entries).toHaveLength(2)
      expect(result.entries[0].loc).toBe('https://example.com/sitemap-en.xml')
      expect(result.entries[0].lastmod).toBe('2026-04-01')
      expect(result.entries[1].lastmod).toBeNull()
    })
  })

  describe('image sitemap parsing', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
              xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
        <url>
          <loc>https://example.com/photo-page</loc>
          <image:image>
            <image:loc>https://example.com/image.jpg</image:loc>
            <image:title>Sunset photo</image:title>
            <image:caption>A beautiful sunset</image:caption>
          </image:image>
        </url>
      </urlset>`

    it('extracts image entries with loc, title, caption', () => {
      const result = parseSitemap(xml)
      if (!result || result.kind !== 'urlset') throw new Error('Expected urlset')
      expect(result.urls[0].images).toHaveLength(1)
      expect(result.urls[0].images?.[0]?.loc).toBe('https://example.com/image.jpg')
      expect(result.urls[0].images?.[0]?.title).toBe('Sunset photo')
      expect(result.urls[0].images?.[0]?.caption).toBe('A beautiful sunset')
      expect(result.urls[0].images?.[0]?.geo_location).toBeNull()
    })

    it('handles multiple images in a single URL entry', () => {
      const multiXml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
              xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
        <url>
          <loc>https://example.com/gallery</loc>
          <image:image><image:loc>https://example.com/a.jpg</image:loc></image:image>
          <image:image><image:loc>https://example.com/b.jpg</image:loc></image:image>
        </url>
      </urlset>`
      const result = parseSitemap(multiXml)
      if (!result || result.kind !== 'urlset') throw new Error('Expected urlset')
      expect(result.urls[0].images).toHaveLength(2)
    })
  })

  describe('video sitemap parsing', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
              xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
        <url>
          <loc>https://example.com/video-page</loc>
          <video:video>
            <video:thumbnail_loc>https://example.com/thumb.png</video:thumbnail_loc>
            <video:title>Tutorial video</video:title>
            <video:description>Learn how to...</video:description>
            <video:duration>300</video:duration>
          </video:video>
        </url>
      </urlset>`

    it('extracts video entries with required thumbnail_loc', () => {
      const result = parseSitemap(xml)
      if (!result || result.kind !== 'urlset') throw new Error('Expected urlset')
      expect(result.urls[0].videos).toHaveLength(1)
      expect(result.urls[0].videos?.[0]?.thumbnail_loc).toBe('https://example.com/thumb.png')
      expect(result.urls[0].videos?.[0]?.title).toBe('Tutorial video')
      expect(result.urls[0].videos?.[0]?.description).toBe('Learn how to...')
      expect(result.urls[0].videos?.[0]?.duration).toBe(300)
    })

    it('handles missing optional video fields gracefully', () => {
      const minimalXml = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
              xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
        <url>
          <loc>https://example.com/v2</loc>
          <video:video><video:thumbnail_loc>https://example.com/t.jpg</video:thumbnail_loc></video:video>
        </url>
      </urlset>`
      const result = parseSitemap(minimalXml)
      if (!result || result.kind !== 'urlset') throw new Error('Expected urlset')
      expect(result.urls[0].videos).toHaveLength(1)
      expect(result.urls[0].videos?.[0]?.title).toBeNull()
      expect(result.urls[0].videos?.[0]?.duration).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('returns null for empty XML', () => {
      expect(parseSitemap('')).toBeNull()
    })

    it('returns null for non-XML content', () => {
      expect(parseSitemap('just plain text')).toBeNull()
    })

    it('handles malformed tags gracefully', () => {
      const badXml = `<urlset><url><loc></url></urlset>`
      // Should not crash; may return empty or partial result
      expect(() => parseSitemap(badXml)).not.toThrow()
    })
  })
})

describe('isSitemapIndex', () => {
  it('returns true for sitemapindex XML', () => {
    expect(isSitemapIndex('<sitemap><loc>https://x.com/s.xml</loc></sitemap>')).toBe(true)
  })

  it('returns false for urlset XML', () => {
    expect(isSitemapIndex('<urlset><url><loc>https://x.com/</loc></url></urlset>')).toBe(false)
  })

  it('returns false for mixed (has both <sitemap> and <url>) — unlikely but safe', () => {
    // Edge case: if XML contains both, treat as urlset because <url> takes priority
    expect(isSitemapIndex('<sitemap/><url/>')).toBe(false)
  })
})
