import type { Project, CreateProjectInput, UpdateProjectInput } from './project'
import type { Crawl, CrawlSettingsInput, CrawlProgress as CrawlProgressData } from './crawl'
import type { UrlRecord, Indexability } from './url'
import type { IssueRecord, IssueSummary } from './issue'
import type { LinkRecord, LinkSummary } from './link'

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ListUrlsFilters {
  search?: string
  statusCategory?: '2xx' | '3xx' | '4xx' | '5xx'
  indexability?: Indexability
  issueType?: string
  contentType?: string
  minDepth?: number
  maxDepth?: number
}

export interface ListUrlsInput {
  crawlId: string
  page: number
  pageSize: number
  sort?: { field: string; direction: 'asc' | 'desc' }
  filters?: ListUrlsFilters
}

export interface ListIssuesInput {
  crawlId: string
  issueType?: string
  severity?: string
  urlId?: string
  limit?: number
}

export interface ListLinksInput {
  crawlId: string
  page: number
  pageSize: number
  filters?: {
    isInternal?: boolean
    linkType?: string
    isFollowed?: boolean
    brokenTarget?: boolean
  }
}

export interface ExportUrlsInput {
  crawlId: string
  filtered?: boolean
  filters?: ListUrlsFilters
}

export interface ExportIssuesInput {
  crawlId: string
}

export interface ExportLinksInput {
  crawlId: string
}

export interface ExportResult {
  filePath: string
  rowCount: number
}

export interface UrlSummary {
  total: number
  byStatusCategory: Record<string, number>
  indexableCount: number
  nonIndexableCount: number
  unknownCount: number
  avgResponseTimeMs: number
}

export type CrawlProgressEvent = CrawlProgressData
export interface CrawlStatusEvent {
  crawlId: string
  status: Crawl['status']
}

// IpcError returned from IPC handlers
export interface IpcError {
  code: string
  message: string
}
