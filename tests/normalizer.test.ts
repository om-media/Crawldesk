import { describe, it, expect } from 'vitest'
import { normalizeUrl } from '../src/worker/engine/normalizer'

describe('normalizeUrl', () => {
  it('lowercases hostname', () => {
    const r = normalizeUrl('https://Example.com/Path#section')
    expect(r.normalizedUrl).toBe('https://example.com/Path')
  })

  it('removes default HTTPS port 443', () => {
    const r = normalizeUrl('https://example.com:443/a')
    expect(r.normalizedUrl).toBe('https://example.com/a')
  })

  it('removes default HTTP port 80', () => {
    const r = normalizeUrl('http://example.com:80/a')
    expect(r.normalizedUrl).toBe('http://example.com/a')
  })

  it('resolves relative URLs against base URL', () => {
    const r = normalizeUrl('/page', 'https://example.com/blog/')
    expect(r.normalizedUrl).toBe('https://example.com/page')
  })

  it('removes tracking UTM parameters', () => {
    const r = normalizeUrl('https://example.com/?utm_source=x&a=1')
    expect(r.normalizedUrl).toBe('https://example.com/?a=1')
  })

  it('returns error for unsupported protocol', () => {
    const r = normalizeUrl('mailto:test@example.com')
    expect(r.error?.code).toBe('unsupported_protocol')
  })

  it('preserves path case', () => {
    const r = normalizeUrl('https://example.com/MyPage')
    expect(r.pathname).toBe('/MyPage')
  })

  it('handles invalid URL gracefully', () => {
    const r = normalizeUrl('not-a-url')
    expect(r.error?.code).toBe('invalid_url')
  })

  it('sorts query params alphabetically', () => {
    const r = normalizeUrl('https://example.com/?z=1&a=2&m=3')
    expect(r.search).toBe('?a=2&m=3&z=1')
  })
})
