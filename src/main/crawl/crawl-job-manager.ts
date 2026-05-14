import { Worker, isMainThread } from 'worker_threads'
import path from 'path'
import type { BrowserWindow } from 'electron'
import type { Repositories } from '../db/repositories'
import type { CrawlProgressEvent, CrawlStatusEvent } from '../../shared/types/ipc'
import type { PageResult } from '../../shared/types/url'

export class CrawlJobManager {
  private activeCrawlId: string | null = null
  private worker: Worker | null = null
  private resumeResolve: (() => void) | null = null
  private isPaused = false

  constructor(
    private repos: Repositories,
    private mainWindowGetter: () => BrowserWindow | null
  ) {}

  async start(crawlId: string): Promise<void> {
    console.log('[JOB] Starting crawl:', crawlId)
    if (this.activeCrawlId && this.activeCrawlId !== crawlId) {
      throw new Error('CRAWL_ALREADY_RUNNING')
    }
    const settings = this.repos.crawls.getSettings(crawlId)
    if (!settings) throw new Error('NOT_FOUND')
    const crawl = this.repos.crawls.get(crawlId)
    if (!crawl) throw new Error('NOT_FOUND')

    this.repos.crawls.updateStatus(crawlId, 'running')
    this.activeCrawlId = crawlId
    this.isPaused = false
    this.resumeResolve = null

    // Start worker thread pointing to compiled JS
    // With outDir=".", __dirname resolves to main/crawl/ and worker/ is sibling of main/
    const workerPath = path.join(__dirname, '..', '..', 'worker', 'crawler-worker.js')
    console.log('[JOB] Worker path:', workerPath, '(exists:', require('fs').existsSync(workerPath), ')')
    this.worker = new Worker(workerPath)

    this.worker.postMessage({
      type: 'crawl:start',
      crawlId,
      startUrl: crawl.start_url,
      settings,
      rootHostname: (() => { try { return new URL(crawl.start_url).hostname.toLowerCase() } catch { return '' } })(),
    })

    this.worker.on('message', (msg: any) => this.handleWorkerMessage(msg))
    this.worker.on('error', (err) => {
      console.error('[JOB] Worker error:', err.message || err)
      this.repos.crawls.updateStatus(crawlId, 'failed', { error_code: 'WORKER_ERROR' })
      this.emitToRenderer('crawls:status', { crawlId, status: 'failed' })
      this.cleanup()
    })
    this.worker.on('exit', () => this.cleanup())
  }

  pause(crawlId: string): void {
    if (this.activeCrawlId !== crawlId) return
    this.isPaused = true
    this.repos.crawls.updateStatus(crawlId, 'paused')
    this.worker?.postMessage({ type: 'crawl:pause' })
  }

  resume(crawlId: string): void {
    if (this.activeCrawlId !== crawlId) return
    this.isPaused = false
    this.repos.crawls.updateStatus(crawlId, 'running')
    this.resumeResolve?.()
    this.resumeResolve = null
    this.worker?.postMessage({ type: 'crawl:resume' })
  }

  stop(crawlId: string): void {
    if (this.activeCrawlId !== crawlId) return
    this.repos.crawls.updateStatus(crawlId, 'stopped')
    this.worker?.postMessage({ type: 'crawl:stop' })
    this.cleanup()
  }

  // Gracefully stop any active crawl before app quit
  gracefulShutdown(): void {
    if (!this.worker || !this.activeCrawlId) return
    console.log('[JOB] Graceful shutdown for crawl:', this.activeCrawlId)
    this.repos.crawls.updateStatus(this.activeCrawlId, 'stopped')
    this.worker.postMessage({ type: 'crawl:stop' })
    // Give worker a moment to finish, then force terminate
    setTimeout(() => {
      try { this.worker!.terminate().catch(() => {}) } catch {}
      this.worker = null
      this.activeCrawlId = null
      this.resumeResolve = null
      this.isPaused = false
    }, 2000)
  }

  private handleWorkerMessage(msg: any): void {
    switch (msg.type) {
      case 'crawl:pageResultBatch':
        this.handlePageResultBatch(msg.results as PageResult[])
        break
      case 'crawl:progress':
        this.emitToRenderer('crawls:progress', msg.progress)
        break
      case 'crawl:completed':
        this.repos.crawls.updateStatus(this.activeCrawlId!, 'completed')
        this.emitToRenderer('crawls:status', { crawlId: this.activeCrawlId!, status: 'completed' })
        this.cleanup()
        break
      case 'crawl:failed':
        this.repos.crawls.updateStatus(this.activeCrawlId!, 'failed', {
          error_code: msg.error?.code ?? 'UNKNOWN_ERROR',
          error_message: msg.error?.message ?? 'Unknown worker error'
        })
        this.emitToRenderer('crawls:status', { crawlId: this.activeCrawlId!, status: 'failed' })
        this.cleanup()
        break
    }
  }

  private handlePageResultBatch(results: PageResult[]): void {
    if (!results.length) return
    // Bulk upsert into DB
    this.repos.urls.bulkUpsertUrls(results)

    // Update counters
    const completed = results.filter(r => r.fetchErrorCode == null && !r.skippedReason).length
    const failed = results.filter(r => r.fetchErrorCode != null || (r.statusCode && r.statusCode >= 400)).length
    const blocked = results.filter(r => r.blockedReason || r.skippedReason === 'robots_txt').length
    const discovered = results.length - failed - blocked

    if (this.activeCrawlId) {
      const current = this.repos.crawls.get(this.activeCrawlId)!
      this.repos.crawls.updateCounters(this.activeCrawlId, {
        total_completed: current.total_completed + completed,
        total_failed: current.total_failed + failed,
        total_blocked: current.total_blocked + blocked,
        total_discovered: current.total_discovered + discovered,
      })

      // Emit progress to renderer
      this.emitToRenderer('crawls:progress', {
        crawlId: this.activeCrawlId,
        total_discovered: current.total_discovered + discovered,
        total_queued: 0,
        total_completed: current.total_completed + completed,
        total_failed: current.total_failed + failed,
        total_blocked: current.total_blocked + blocked,
        urlsPerMinute: 0,
        avgResponseTimeMs: 0,
        elapsedTimeSeconds: 0,
      } as CrawlProgressEvent)
    }
  }

  private cleanup(): void {
    this.worker?.terminate().catch(() => {})
    this.worker = null
    this.activeCrawlId = null
    this.resumeResolve = null
    this.isPaused = false
  }

  private emitToRenderer(channel: string, data: unknown): void {
    const win = this.mainWindowGetter()
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data)
    }
  }
}
