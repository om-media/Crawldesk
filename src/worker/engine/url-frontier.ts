// FIFO queue for crawl URLs with deduplication
export interface QueuedUrl {
  url: string
  normalizedUrl: string
  depth: number
  discoveredFrom?: string
}

export class UrlFrontier {
  private queue: QueuedUrl[] = []
  private seen = new Set<string>()
  private visited = new Set<string>()
  private _maxUrls: number

  constructor(maxUrls: number) {
    this._maxUrls = maxUrls
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
    } catch {}

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
    return this.seen.has(norm) || this.visited.has(norm)
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
