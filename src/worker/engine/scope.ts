import type { NormalizedUrlResult } from './normalizer'

export interface ScopeConfig {
  startHostname: string
  crawlSubdomains: boolean
  includePatterns: RegExp[]
  excludePatterns: RegExp[]
  maxDepth: number
  maxUrls: number
  crawlExternalLinks: boolean
}

export class ScopeService {
  private rootDomain: string

  constructor(private config: ScopeConfig) {
    this.rootDomain = extractRootDomain(config.startHostname)
  }

  isInternal(normalized: NormalizedUrlResult): boolean {
    if (!normalized.hostname) return false
    const host = normalized.hostname.toLowerCase()
    // Exact match
    if (host === this.config.startHostname.toLowerCase()) return true
    // Subdomain mode
    if (this.config.crawlSubdomains && host.endsWith('.' + this.rootDomain)) return true
    return false
  }

  shouldCrawl(normalized: NormalizedUrlResult, depth: number): boolean {
    if (!['http:', 'https:'].includes(normalized.protocol)) return false
    if (depth > this.config.maxDepth) return false
    if (!this.isInternal(normalized) && !this.config.crawlExternalLinks) return false

    // Check patterns against full normalized URL
    const url = normalized.normalizedUrl
    for (const p of this.config.excludePatterns) {
      if (p.test(url)) return false
    }
    if (this.config.includePatterns.length > 0) {
      let matched = false
      for (const p of this.config.includePatterns) {
        if (p.test(url)) { matched = true; break }
      }
      if (!matched) return false
    }
    return true
  }

  isAllowed(normalized: NormalizedUrlResult): boolean {
    return this.shouldCrawl(normalized, 0) || this.isInternal(normalized)
  }
}

function extractRootDomain(hostname: string): string {
  const parts = hostname.split('.')
  if (parts.length <= 2) return hostname
  // Simple heuristic: last two parts
  return parts.slice(-2).join('.')
}

export function wildcardToRegex(pattern: string): RegExp {
  // Escape regex special chars then convert * to .*
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const converted = escaped.replace(/\\\*/g, '.*')
  return new RegExp(converted, 'i')
}
