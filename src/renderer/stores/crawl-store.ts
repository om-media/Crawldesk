import { create } from 'zustand'
import type { CrawlProgress as CrawlProgressType } from '../../../shared/types/crawl'

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
  updateProgress: (data: Partial<CrawlProgressType>) => void
  reset: () => void
}

export const useCrawlStore = create<CrawlStore>((set) => ({
  progress: null,
  setStatus: (status) => set((s) => ({ progress: s.progress ? { ...s.progress, status } : null })),
  updateProgress: (data) => set((s) => ({
    progress: {
      crawlId: data.crawlId ?? s.progress?.crawlId ?? '',
      total_discovered: data.total_discovered ?? 0,
      total_queued: data.total_queued ?? 0,
      total_completed: data.total_completed ?? 0,
      total_failed: data.total_failed ?? 0,
      total_blocked: data.total_blocked ?? 0,
      urlsPerMinute: data.urls_per_minute ?? data.urlsPerMinute ?? 0,
      avgResponseTimeMs: data.avg_response_time_ms ?? data.avgResponseTimeMs ?? 0,
      elapsedTimeSeconds: data.elapsed_time_seconds ?? data.elapsedTimeSeconds ?? 0,
      status: s.progress?.status ?? 'running',
    }
  })),
  reset: () => set({ progress: null }),
}))
