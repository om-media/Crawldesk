import type { CrawlSettingsInput, CrawlProgress as ProgressType } from '../../shared/types/crawl'
import type { PageResult } from '../../shared/types/url'
import type { MessagePort } from 'worker_threads'
import { normalizeUrl } from './normalizer'
import { PrivateIpGuard } from './private-ip-guard'
import { ScopeService, wildcardToRegex } from './scope'
import { UrlFrontier } from './url-frontier'
import { Fetcher } from './fetcher'
import { RobotsService } from './robots'
import { extractSeo } from './seo-extractor'
import { detectIssues } from './issue-detector'

export interface EngineCallbacks {
  onProgress: (progress: any) => void
  onPageResultBatch: (results: PageResult[]) => void
  onCompleted: () => void
  onFailed: (error: { code: string; message: string }) => void
}

export class CrawlEngine {
  private frontier: UrlFrontier
  private scope: ScopeService
  private guard = new PrivateIpGuard()
  private fetcher: Fetcher
  private robots = new RobotsService()
  private stopped = false
  private paused = false
  private resumePromise: Promise<void> | null = null
  private resumeResolver: (() => void) | null = null
  private totalCompleted = 0
  private totalFailed = 0
  private totalBlocked = 0
  private startTime: number = 0
  private batchTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private config: CrawlSettingsInput,
    private rootHostname: string,
    private startUrl: string,
    private callbacks: EngineCallbacks
  ) {
    this.frontier = new UrlFrontier(config.maxUrls)
    this.fetcher = new Fetcher({
      timeoutMs: config.requestTimeoutMs,
      userAgent: config.userAgent,
    })

    const includeRe = config.includePatterns.map(p => wildcardToRegex(p))
    const excludeRe = config.excludePatterns.map(p => wildcardToRegex(p))
    this.scope = new ScopeService({
      startHostname: rootHostname,
      crawlSubdomains: config.crawlSubdomains,
      includePatterns: includeRe,
      excludePatterns: excludeRe,
      maxDepth: config.maxDepth,
      maxUrls: config.maxUrls,
      crawlExternalLinks: config.crawlExternalLinks,
    })
  }

  async start(): Promise<void> {
    this.startTime = Date.now()
    // Start periodic progress emission
    this.batchTimer = setInterval(() => this.emitProgress(), 2000)

    try {
      await this.run()
    } catch (err: any) {
      this.callbacks.onFailed({ code: 'ENGINE_ERROR', message: err.message || 'Crawl engine error' })
    } finally {
      if (this.batchTimer) clearInterval(this.batchTimer)
    }
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
    this.resumeResolver?.()
    this.resumeResolver = null
    this.resumePromise = null
  }

  stop(): void {
    this.stopped = true
    this.resumeResolver?.()
  }

  private async run(): Promise<void> {
    // Fetch robots.txt first
    const normStart = normalizeUrl(this.startUrl)
    if (!normStart.error && this.config.respectRobotsTxt) {
      await this.fetchRobots(normStart.protocol + '//' + this.rootHostname + '/robots.txt')
    }

    // Add start URL to frontier
    this.frontier.add(this.startUrl, 0)

    // Main crawl loop
    while (!this.stopped) {
      if (this.totalCompleted >= this.config.maxUrls) break

      // Pause handling
      while (this.paused && !this.stopped) {
        if (!this.resumePromise) {
          this.resumePromise = new Promise(resolve => { this.resumeResolver = resolve })
        }
        await this.resumePromise
      }

      const batch = this.frontier.take(this.config.concurrency)
      if (batch.length === 0) break

      const tasks = batch.map(item => this.processUrl(item))
      const results = await Promise.all(tasks)
      for (const r of results) {
        if (r) this.callbacks.onPageResultBatch([r])
      }

      this.emitProgress()
    }

    // Final progress emit
    if (this.batchTimer) clearInterval(this.batchTimer)
    this.emitProgress()
    this.callbacks.onCompleted()
  }

  private async fetchRobots(url: string): Promise<void> {
    try {
      const result = await this.fetcher.fetch(url)
      if (result.statusCode === 200 && result.body) {
        this.robots.load(result.body.toString())
      }
    } catch {
      // Missing robots.txt means everything is allowed
    }
  }

  private async processUrl(item: { url: string; depth: number; discoveredFrom?: string }): Promise<PageResult | null> {
    const norm = normalizeUrl(item.url)
    if (norm.error) {
      return this.makeSkippedResult(item, 'invalid_url', norm.error.message || 'Invalid URL')
    }

    // Private IP guard
    if (this.guard.isBlocked(norm.hostname)) {
      return this.makeBlockedResult(item, 'blocked_private_ip', 'Private or reserved IP address blocked')
    }

    // Scope check
    if (!this.scope.shouldCrawl(norm, item.depth)) {
      return this.makeSkippedResult(item, 'out_of_scope', 'URL is outside crawl scope')
    }

    // Robots check
    let robotsPath = norm.pathname + norm.search
    let robotsAllowed = true
    if (this.config.respectRobotsTxt) {
      robotsAllowed = this.robots.isAllowed(robotsPath)
      if (!robotsAllowed) {
        return this.makeBlockedResult(item, 'robots_txt_blocked', 'Disallowed by robots.txt')
      }
    }

    // Fetch the URL
    const fetchResult = await this.fetcher.fetch(norm.normalizedUrl)

    const urlId = crypto.randomUUID()
    const pageResult: PageResult = {
      urlId,
      crawlId: '', // set externally
      url: item.url,
      normalizedUrl: norm.normalizedUrl,
      finalUrl: fetchResult.finalUrl || undefined,
      statusCode: fetchResult.statusCode,
      contentType: fetchResult.contentType || undefined,
      contentLength: fetchResult.contentLength ?? undefined,
      isInternal: this.scope.isInternal(norm),
      depth: item.depth,
      responseTimeMs: fetchResult.responseTimeMs,
      discoveredFromUrl: item.discoveredFrom,
      redirectChain: fetchResult.redirectChain.length > 0 ? fetchResult.redirectChain : undefined,
      fetchErrorCode: fetchResult.error?.code || undefined,
      fetchErrorMessage: fetchResult.error?.message || undefined,
    }

    // Mark as visited
    this.frontier.markVisited(norm.normalizedUrl)

    if (fetchResult.statusCode && (fetchResult.statusCode < 200 || fetchResult.statusCode >= 400)) {
      this.totalFailed++
    } else {
      this.totalCompleted++
    }

    // Parse HTML pages for SEO data
    if (!fetchResult.error && fetchResult.body && fetchResult.contentType?.includes('text/html')) {
      const extracted = extractSeo(fetchResult.body.toString(), fetchResult.finalUrl || item.url)
      pageResult.seo = {
        title: extracted.title,
        titleLength: extracted.titleLength,
        metaDescription: extracted.metaDescription,
        metaDescriptionLength: extracted.metaDescriptionLength,
        h1: extracted.h1,
        h1Count: extracted.h1Count,
        canonical: extracted.canonical,
        robotsMeta: extracted.robotsMeta,
        xRobotsTag: fetchResult.headers['x-robots-tag'] ?? null,
        wordCount: extracted.wordCount,
        contentHash: extracted.contentHash,
      }
      pageResult.links = extracted.links
      pageResult.wordCount = extracted.wordCount
      pageResult.contentHash = extracted.contentHash ?? undefined

      // Detect issues
      pageResult.issues = detectIssues(pageResult)

      // Add discovered internal links to frontier
      for (const link of extracted.links) {
        if (link.linkType !== 'html_a') continue
        const linkNorm = normalizeUrl(link.targetUrl, fetchResult.finalUrl || item.url)
        if (linkNorm.error) continue
        if (!this.scope.isInternal(linkNorm)) continue
        if (this.guard.isBlocked(linkNorm.hostname)) continue
        const nextDepth = item.depth + 1
        if (nextDepth > this.config.maxDepth) continue
        this.frontier.add(linkNorm.normalizedUrl, nextDepth, fetchResult.finalUrl || item.url)
      }
    } else if (fetchResult.statusCode && fetchResult.statusCode >= 300 && fetchResult.statusCode < 400) {
      // Redirect — record but don't parse
      this.totalCompleted++
    } else {
      this.totalFailed++
    }

    return pageResult
  }

  private makeSkippedResult(item: any, reason: string, message: string): PageResult {
    this.totalCompleted++
    return {
      urlId: crypto.randomUUID(), crawlId: '', url: item.url, normalizedUrl: item.url.toLowerCase(),
      isInternal: false, depth: item.depth, skippedReason: reason, discoveredFromUrl: item.discoveredFrom,
    }
  }

  private makeBlockedResult(item: any, reason: string, message: string): PageResult {
    this.totalBlocked++
    return {
      urlId: crypto.randomUUID(), crawlId: '', url: item.url, normalizedUrl: item.url.toLowerCase(),
      isInternal: false, depth: item.depth, blockedReason: reason, discoveredFromUrl: item.discoveredFrom,
    }
  }

  private emitProgress(): void {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000)
    const rate = elapsed > 0 ? Math.round((this.totalCompleted * 60) / elapsed) : 0
    this.callbacks.onProgress({
      total_completed: this.totalCompleted,
      total_failed: this.totalFailed,
      total_blocked: this.totalBlocked,
      total_queued: this.frontier.size(),
      urls_per_minute: rate,
      elapsed_seconds: elapsed,
    })
  }
}
