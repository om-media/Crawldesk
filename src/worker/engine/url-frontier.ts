// FIFO queue for crawl URLs with deduplication and bounded memory
export interface QueuedUrl {
  url: string
  normalizedUrl: string
  depth: number
  discoveredFrom?: string
}

const VISITED_CACHE_MAX = 150_000 // Cap visited cache to ~24MB (160KB avg per URL * 150k)
// Bounded LRU-style visited cache using Map insertion order
function createVisitedCache(maxSize: number): { set: Set<string>; map: Map<string, number>; counter: number; check: (url: string) => boolean; add: (url: string) => void; get size() : number } {
  const map = new Map<string, number>()
  let counter = 0
  return {
    set: null as unknown as Set<string>, // unused
    map,
    counter: 0,
    check(url: string) { return map.has(url) },
    add(url: string) {
      if (map.has(url)) {
        // Refresh position - delete and re-add to maintain insertion order
        map.delete(url)
      } else if (map.size >= maxSize) {
        // Evict oldest entry
        const firstKey = map.keys().next().value
        if (firstKey !== undefined) map.delete(firstKey)
      }
      map.set(url, ++counter)
    },
    get size() { return map.size },
  }
}

export class UrlFrontier {
  private queue: QueuedUrl[] = []
  private seen = new Set<string>()
  private visited: ReturnType<typeof createVisitedCache>
  private _maxUrls: number

  constructor(maxUrls: number) {
    this._maxUrls = maxUrls
    this.visited = createVisitedCache(Math.max(VISITED_CACHE_MAX, Math.floor(maxUrls * 1.5)))
  }

  add(url: string, depth: number, discoveredFrom?: string): boolean {
    // Normalize for dedup (simple lowercase + no trailing slash except root)
    let norm = url.toLowerCase()
    if (!norm.includes('?')) {
      norm = norm.replace(/\/+$/, '') || '/'
    }
    if (this.hasSeen(norm)) return false
    const total = this.seen.size + this.visited.size
    if (total >= this._maxUrls) return false
    // URL length check
    if (url.length > 2048) return false
    // Query param count check
    try {
      const parsed = new URL(url)
      if ([...parsed.searchParams.keys()].length > 10) return false
    } catch (err) {
      console.warn('[Frontier] Invalid URL rejected:', url, err instanceof Error ? err.message : String(err))
    }

    this.queue.push({ url, normalizedUrl: norm, depth, discoveredFrom })
    this.seen.add(norm)
    return true
  }

  next(): QueuedUrl | null {
    return this.queue.shift() ?? null
  }

  take(count: number): QueuedUrl[] {
    const batch: QueuedUrl[] = []
    for (let i = 0; i < count && this.queue.length > 0; i++) {
      const item = this.queue.shift()
      if (item) batch.push(item)
    }
    return batch
  }

  markVisited(normalizedUrl: string): void {
    const norm = normalizedUrl.toLowerCase().replace(/\/+$/, '') || '/'
    this.seen.delete(norm)
    this.visited.add(norm)
  }

  hasSeen(normalizedUrl: string): boolean {
    const norm = normalizedUrl.toLowerCase().replace(/\/+$/, '') || '/'
    return this.seen.has(norm) || this.visited.check(norm)
  }

  size(): number {
    return this.queue.length
  }

  visitedCount(): number {
    return this.visited.size + this.seen.size - this.queue.length
  }

  totalProcessed(): number {
    return this.visited.size
  }
}
