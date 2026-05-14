import { describe, it, expect } from 'vitest'
import { extractSeo } from '../src/worker/engine/seo-extractor'

describe('Pagination Extraction', () => {
  const baseHtml = `<!DOCTYPE html><html><head></head><body><h1>Test</h1></body></html>`

  function injectHeadTags(html: string, tags: string): string {
    return html.replace('</head>', `${tags}</head>`)
  }

  it('extracts rel=next link', () => {
    const html = injectHeadTags(baseHtml, '<link rel="next" href="https://example.com/page/2">')
    const result = extractSeo(html, 'https://example.com/page/1')
    expect(result.pagination.isPaginated).toBe(true)
    expect(result.pagination.relNext).toBe('https://example.com/page/2')
    expect(result.pagination.relPrev).toBeNull()
  })

  it('extracts rel=prev link', () => {
    const html = injectHeadTags(baseHtml, '<link rel="prev" href="https://example.com/page/1">')
    const result = extractSeo(html, 'https://example.com/page/2')
    expect(result.pagination.isPaginated).toBe(true)
    expect(result.pagination.relPrev).toBe('https://example.com/page/1')
    expect(result.pagination.relNext).toBeNull()
  })

  it('extracts both rel=next and rel=prev', () => {
    const html = injectHeadTags(
      baseHtml,
      '<link rel="prev" href="https://example.com/page/1"><link rel="next" href="https://example.com/page/3">'
    )
    const result = extractSeo(html, 'https://example.com/page/2')
    expect(result.pagination.isPaginated).toBe(true)
    expect(result.pagination.relPrev).toBe('https://example.com/page/1')
    expect(result.pagination.relNext).toBe('https://example.com/page/3')
  })

  it('resolves relative pagination URLs to absolute', () => {
    const html = injectHeadTags(
      baseHtml,
      '<link rel="next" href="/page/2"><link rel="prev" href="/page/1">'
    )
    const result = extractSeo(html, 'https://example.com/page/current')
    expect(result.pagination.relNext).toBe('https://example.com/page/2')
    expect(result.pagination.relPrev).toBe('https://example.com/page/1')
  })

  it('returns isPaginated=false when no next/prev links exist', () => {
    const result = extractSeo(baseHtml, 'https://example.com/')
    expect(result.pagination.isPaginated).toBe(false)
    expect(result.pagination.relNext).toBeNull()
    expect(result.pagination.relPrev).toBeNull()
  })
})
