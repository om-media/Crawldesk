import { describe, it, expect } from 'vitest'
import { ScopeService, wildcardToRegex } from '../src/worker/engine/scope'
import { normalizeUrl } from '../src/worker/engine/normalizer'

describe('ScopeService', () => {
  const baseConfig = {
    startHostname: 'example.com',
    crawlSubdomains: false,
    includePatterns: [] as RegExp[],
    excludePatterns: [] as RegExp[],
    maxDepth: 10,
    maxUrls: 10000,
    crawlExternalLinks: false,
  }

  it('marks same-host URLs as internal', () => {
    const svc = new ScopeService(baseConfig)
    const norm = normalizeUrl('https://example.com/a')
    expect(svc.isInternal(norm)).toBe(true)
  })

  it('marks different host as external', () => {
    const svc = new ScopeService(baseConfig)
    const norm = normalizeUrl('https://other.com/a')
    expect(svc.isInternal(norm)).toBe(false)
  })

  it('handles subdomain mode when enabled', () => {
    const config = { ...baseConfig, crawlSubdomains: true }
    const svc = new ScopeService(config)
    const norm = normalizeUrl('https://blog.example.com/a')
    expect(svc.isInternal(norm)).toBe(true)
  })

  it('excludes subdomains when disabled', () => {
    const svc = new ScopeService(baseConfig)
    const norm = normalizeUrl('https://www.example.com/a')
    expect(svc.isInternal(norm)).toBe(false)
  })

  it('respects exclude patterns', () => {
    const config = { ...baseConfig, excludePatterns: [/tag/] }
    const svc = new ScopeService(config)
    const norm = normalizeUrl('https://example.com/tag/news')
    expect(svc.shouldCrawl(norm, 0)).toBe(false)
  })

  it('respects max depth', () => {
    const config = { ...baseConfig, maxDepth: 2 }
    const svc = new ScopeService(config)
    const norm = normalizeUrl('https://example.com/deep/page')
    expect(svc.shouldCrawl(norm, 3)).toBe(false)
    expect(svc.shouldCrawl(norm, 2)).toBe(true)
  })

  it('wildcardToRegex converts * to .*', () => {
    const re = wildcardToRegex('*/tag/*')
    expect(re.test('https://example.com/tag/something')).toBe(true)
    expect(re.test('http://other.com/tag/1')).toBe(true)
  })
})
