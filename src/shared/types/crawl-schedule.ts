// Feature 7.4 — Crawl Scheduling Types

export interface CrawlSchedule {
  id: string
  project_id: string
  start_url: string
  crawl_settings_json: string // Serialized CrawlSettingsInput
  cron_expression: string
  enabled: number // 1 = enabled, 0 = disabled
  last_run_at?: string | null
  next_run_at?: string | null
  created_at: string
  updated_at: string
}

export interface CreateCrawlScheduleInput {
  projectId: string
  startUrl: string
  crawlSettingsJson: string
  cronExpression: string
}

export interface UpdateCrawlScheduleInput {
  enabled?: boolean
  cronExpression?: string
}
