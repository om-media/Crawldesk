export type CrawlStatus = 'created' | 'running' | 'paused' | 'stopped' | 'completed' | 'failed'

export interface Crawl {
  id: string
  project_id: string
  start_url: string
  status: CrawlStatus
  total_discovered: number
  total_queued: number
  total_completed: number
  total_failed: number
  total_blocked: number
  started_at?: string | null
  finished_at?: string | null
  created_at: string
  updated_at: string
  error_code?: string | null
  error_message?: string | null
}

export interface CrawlSettingsInput {
  maxUrls: number
  maxDepth: number
  concurrency: number
  requestTimeoutMs: number
  respectRobotsTxt: boolean
  crawlSubdomains: boolean
  checkExternalLinks: boolean
  crawlExternalLinks: boolean
  userAgent: string
  includePatterns: string[]
  excludePatterns: string[]
}

export interface CrawlProgress {
  crawlId: string
  total_discovered: number
  total_queued: number
  total_completed: number
  total_failed: number
  total_blocked: number
  urlsPerMinute: number
  avgResponseTimeMs: number
  elapsedTimeSeconds: number
}

export interface CrawlSummary {
  crawlId: string
  totalCompleted: number
  totalFailed: number
  totalBlocked: number
  durationSeconds: number
}

export const DEFAULT_CRAWL_SETTINGS: Omit<CrawlSettingsInput, 'includePatterns' | 'excludePatterns'> = {
  maxUrls: 10000,
  maxDepth: 10,
  concurrency: 10,
  requestTimeoutMs: 15000,
  respectRobotsTxt: true,
  crawlSubdomains: false,
  checkExternalLinks: true,
  crawlExternalLinks: false,
  userAgent: 'CrawlDeskBot/0.1 (+https://example.com/bot)'
} as const
