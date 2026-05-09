// Simplified robots.txt parser
export interface RobotsRule {
  userAgent: string
  allow?: string[]
  disallow?: string[]
  sitemap?: string[]
}

export class RobotsService {
  private rules: RobotsRule[] = []
  private loaded = false

  load(content: string): void {
    this.loaded = true
    this.rules = parseRobotsTxt(content)
  }

  isAllowed(urlPath: string): boolean {
    if (!this.loaded || this.rules.length === 0) return true
    // Find matching rule (first match for '*' or specific user agent)
    const applicable = this.findApplicableRules('*')
    for (const rule of applicable) {
      if (rule.disallow && rule.disallow.some(d => urlPath.startsWith(d))) return false
      if (rule.allow && rule.allow.some(a => urlPath.startsWith(a))) return true
    }
    return true
  }

  getSitemaps(): string[] {
    const sitemaps: string[] = []
    for (const r of this.rules) {
      if (r.sitemap) sitemaps.push(...r.sitemap)
    }
    return [...new Set(sitemaps)]
  }

  findApplicableRules(userAgent: string): RobotsRule[] {
    return this.rules.filter(r => r.userAgent.toLowerCase() === userAgent.toLowerCase())
  }
}

function parseRobotsTxt(content: string): RobotsRule[] {
  const rules: RobotsRule[] = []
  let current: RobotsRule | null = null

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const colonIdx = trimmed.indexOf(':')
    if (colonIdx < 0) continue

    const key = trimmed.slice(0, colonIdx).trim().toLowerCase()
    const value = trimmed.slice(colonIdx + 1).trim()

    if (key === 'user-agent') {
      current = { userAgent: value, allow: [], disallow: [], sitemap: [] }
      rules.push(current)
    } else if (current && key === 'allow') {
      current.allow!.push(value)
    } else if (current && key === 'disallow') {
      current.disallow!.push(value)
    } else if (current && key === 'sitemap') {
      current.sitemap!.push(value)
    }
  }
  return rules
}
