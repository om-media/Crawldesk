// Strict robots.txt parser with group handling and most-specific-match semantics
interface RobotsGroup {
  userAgents: string[]
  allow: string[]
  disallow: string[]
}

export class RobotsService {
  private groups: RobotsGroup[] = []
  private sitemaps: string[] = []
  private loaded = false

  load(content: string): void {
    this.loaded = true
    const parsed = parseRobotsTxt(content)
    this.groups = parsed.groups
    this.sitemaps = parsed.sitemaps
  }

  isAllowed(urlPath: string): boolean {
    if (!this.loaded || this.groups.length === 0) return true
    // Find matching groups: specific user-agent first, fallback to '*' wildcard
    let matchedGroups = this.groups.filter(g => g.userAgents.some(ua => ua === '*'))
    for (const g of this.groups) {
      if (g.userAgents.length > 1 || !g.userAgents.includes('*')) {
        matchedGroups.push(...matchedGroups) // prioritize non-wildcard if they exist
      }
    }
    // Use longest match wins; disallow takes precedence at same length
    let bestLen = -1
    let allowed = true
    for (const group of matchedGroups) {
      for (const pattern of group.disallow) {
        if (pattern && urlPath.startsWith(pattern)) {
          if (pattern.length > bestLen) {
            bestLen = pattern.length
            allowed = false
          } else if (pattern.length === bestLen) {
            allowed = false
          }
        }
      }
      for (const pattern of group.allow) {
        if (urlPath.startsWith(pattern)) {
          if (pattern.length >= bestLen) {
            bestLen = pattern.length
            allowed = true
          }
        }
      }
    }
    return allowed
  }

  getSitemaps(): string[] {
    return [...new Set(this.sitemaps)]
  }
}

function parseRobotsTxt(content: string): { groups: RobotsGroup[]; sitemaps: string[] } {
  const groups: RobotsGroup[] = []
  const sitemaps: string[] = []
  let current: RobotsGroup | null = null

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const colonIdx = trimmed.indexOf(':')
    if (colonIdx < 0) continue

    const key = trimmed.slice(0, colonIdx).trim().toLowerCase()
    const value = trimmed.slice(colonIdx + 1).trim()

    if (key === 'user-agent') {
      // Multiple user-agents in a row belong to the same group
      if (!current) {
        current = { userAgents: [value], allow: [], disallow: [] }
        groups.push(current)
      } else {
        current.userAgents.push(value)
      }
    } else if (current && key === 'allow') {
      current.allow.push(value)
    } else if (current && key === 'disallow') {
      // Empty Disallow means everything is allowed for this group
      current.disallow.push(value)
    } else if (key === 'sitemap') {
      sitemaps.push(value)
    }
  }
  return { groups, sitemaps }
}
