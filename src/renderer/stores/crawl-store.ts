import { create } from 'zustand'
import type { CrawlProgress as CrawlProgressType } from '@shared/types/crawl'

type BackendCrawlProgress = Partial<CrawlProgressType> & Record<string, any>

interface CrawlProgressState {
  crawlId: string | null
  total_discovered: number
  total_queued: number
  total_completed: number
  total_failed: number
  total_blocked: number
  urlsPerMinute: number
  avgResponseTimeMs: number
  elapsedTimeSeconds: number
  status: string
}

interface CrawlStore {
  progress: CrawlProgressState | null
  setStatus: (status: string) => void
  updateProgress: (data: BackendCrawlProgress) => void
  reset: () => void
}

const defaultProgress: Omit<CrawlProgressState, 'crawlId'> = {
  total_discovered: 0,
  total_queued: 0,
  total_completed: 0,
  total_failed: 0,
  total_blocked: 0,
  urlsPerMinute: 0,
  avgResponseTimeMs: 0,
  elapsedTimeSeconds: 0,
  status: 'running',
}

export const useCrawlStore = create<CrawlStore>((set) => ({
  progress: null,
  setStatus: (status) => set((s) => ({
    progress: s.progress ? { ...s.progress, status } : { crawlId: '', ...defaultProgress, status }
  })),
  updateProgress: (data) => set((s) => ({
    progress: (() => {
      const terminalStatus = ['completed', 'failed', 'stopped'].includes(s.progress?.status ?? '')
      const incomingStatus = data.status
      return {
        crawlId: data.crawlId ?? s.progress?.crawlId ?? '',
        total_discovered: data.total_discovered ?? data.totalDiscovered ?? data.total_urls ?? data.totalUrl ?? s.progress?.total_discovered ?? 0,
        total_queued: data.total_queued ?? data.totalQueued ?? data.queued_urls ?? data.queuedUrls ?? s.progress?.total_queued ?? 0,
        total_completed: data.total_completed ?? data.totalCompleted ?? data.crawled_urls ?? data.crawledUrls ?? s.progress?.total_completed ?? 0,
        total_failed: data.total_failed ?? data.totalFailed ?? s.progress?.total_failed ?? 0,
        total_blocked: data.total_blocked ?? data.totalBlocked ?? s.progress?.total_blocked ?? 0,
        urlsPerMinute: data.urls_per_minute ?? data.urlsPerMinute ?? s.progress?.urlsPerMinute ?? 0,
        avgResponseTimeMs: data.avg_response_time_ms ?? data.avgResponseTimeMs ?? s.progress?.avgResponseTimeMs ?? 0,
        elapsedTimeSeconds: data.elapsed_time_seconds ?? data.elapsedTimeSeconds ?? s.progress?.elapsedTimeSeconds ?? 0,
        status: terminalStatus && (!incomingStatus || incomingStatus === 'running') ? s.progress!.status : incomingStatus ?? s.progress?.status ?? 'running',
      }
    })()
  })),
  reset: () => set({ progress: null }),
}))
