/**
 * @DEPRECATED - Electron Preload (Legacy)
 * 
 * This file is DEPRECATED and kept only for reference.
 * The application now uses Tauri as its primary desktop framework.
 * 
 * Tauri implementation: src/renderer/tauri-api.ts + src-tauri/src/
 * 
 * DO NOT use this file - it references Electron APIs that are no longer loaded.
 */

// @ts-nocheck - This file is deprecated and not actively maintained

import { contextBridge, ipcRenderer } from 'electron'
import type { Project, CreateProjectInput, UpdateProjectInput } from '../shared/types/project'
import type { Crawl, CrawlSettingsInput, CrawlProgress as CrawlProgressType } from '../shared/types/crawl'
import type { UrlRecord } from '../shared/types/url'
import type { IssueRecord, IssueSummary } from '../shared/types/issue'
import type { LinkRecord, LinkSummary } from '../shared/types/link'
import type { 
  PaginatedResult, 
  ListUrlsInput, 
  ListIssuesInput, 
  ListLinksInput, 
  ExportUrlsInput, 
  ExportIssuesInput, 
  ExportLinksInput, 
  ExportResult,
  UrlSummary,
  CrawlStatusEvent 
} from '../shared/types/ipc'

interface CrawldeskApi {
  projects: {
    create: (input: CreateProjectInput) => Promise<Project>
    list: () => Promise<Project[]>
    get: (id: string) => Promise<Project | null>
    update: (id: string, patch: UpdateProjectInput) => Promise<void>
    delete: (id: string) => Promise<void>
  },
  crawls: {
    create: (projectId: string, settings: CrawlSettingsInput & { startUrl: string }) => Promise<Crawl>
    start: (crawlId: string) => Promise<void>
    pause: (crawlId: string) => Promise<void>
    resume: (crawlId: string) => Promise<void>
    stop: (crawlId: string) => Promise<void>
    get: (crawlId: string) => Promise<Crawl | null>
    listByProject: (projectId: string) => Promise<Crawl[]>
    onProgress: (cb: (progress: CrawlProgressType) => void) => () => void
    onStatus: (cb: (event: CrawlStatusEvent) => void) => () => void
  },
  urls: {
    list: (input: ListUrlsInput) => Promise<PaginatedResult<UrlRecord>>
    get: (urlId: string) => Promise<UrlRecord | null>
    summarize: (crawlId: string) => Promise<UrlSummary>
  },
  issues: {
    summarize: (crawlId: string) => Promise<IssueSummary[]>
    list: (input: ListIssuesInput) => Promise<IssueRecord[]>
  },
  links: {
    list: (input: ListLinksInput) => Promise<PaginatedResult<LinkRecord>>
    summarize: (crawlId: string) => Promise<LinkSummary>
  },
  exports: {
    exportUrls: (input: ExportUrlsInput) => Promise<ExportResult>
    exportIssues: (input: ExportIssuesInput) => Promise<ExportResult>
    exportLinks: (input: ExportLinksInput) => Promise<ExportResult>
  },
  app: {
    getVersion: () => Promise<string>
    getDataPath: () => Promise<string>
    openExternalUrl: (url: string) => Promise<void>
    openPath: (pathStr: string) => Promise<void>
  }
}

contextBridge.exposeInMainWorld('crawldesk' as keyof CrawldeskApi, {
  projects: {
    create: (input: CreateProjectInput) => ipcRenderer.invoke('projects:create', input),
    list: () => ipcRenderer.invoke('projects:list'),
    get: (id: string) => ipcRenderer.invoke('projects:get', id),
    update: (id: string, patch: UpdateProjectInput) => ipcRenderer.invoke('projects:update', id, patch),
    delete: (id: string) => ipcRenderer.invoke('projects:delete', id),
  },
  crawls: {
    create: (projectId: string, settings: CrawlSettingsInput & { startUrl: string }) => 
      ipcRenderer.invoke('crawls:create', { projectId, startUrl: settings.startUrl, settings }),
    start: (crawlId: string) => ipcRenderer.invoke('crawls:start', crawlId),
    pause: (crawlId: string) => ipcRenderer.invoke('crawls:pause', crawlId),
    resume: (crawlId: string) => ipcRenderer.invoke('crawls:resume', crawlId),
    stop: (crawlId: string) => ipcRenderer.invoke('crawls:stop', crawlId),
    get: (crawlId: string) => ipcRenderer.invoke('crawls:get', crawlId),
    listByProject: (projectId: string) => ipcRenderer.invoke('crawls:listByProject', projectId),
    onProgress: (cb: (progress: CrawlProgressType) => void) => {
      const sub = (_e: Electron.IpcRendererEvent, data: CrawlProgressType) => cb(data)
      ipcRenderer.on('crawls:progress', sub)
      return () => ipcRenderer.removeListener('crawls:progress', sub)
    },
    onStatus: (cb: (event: CrawlStatusEvent) => void) => {
      const sub = (_e: Electron.IpcRendererEvent, data: CrawlStatusEvent) => cb(data)
      ipcRenderer.on('crawls:status', sub)
      return () => ipcRenderer.removeListener('crawls:status', sub)
    }
  },
  urls: {
    list: (input: ListUrlsInput) => ipcRenderer.invoke('urls:list', input),
    get: (urlId: string) => ipcRenderer.invoke('urls:get', urlId),
    summarize: (crawlId: string) => ipcRenderer.invoke('urls:summarize', crawlId),
  },
  issues: {
    summarize: (crawlId: string) => ipcRenderer.invoke('issues:summarize', crawlId),
    list: (input: ListIssuesInput) => ipcRenderer.invoke('issues:list', input),
  },
  links: {
    list: (input: ListLinksInput) => ipcRenderer.invoke('links:list', input),
    summarize: (crawlId: string) => ipcRenderer.invoke('links:summarize', crawlId),
  },
  exports: {
    exportUrls: (input: ExportUrlsInput) => ipcRenderer.invoke('exports:urls', input),
    exportIssues: (input: ExportIssuesInput) => ipcRenderer.invoke('exports:issues', input),
    exportLinks: (input: ExportLinksInput) => ipcRenderer.invoke('exports:links', input),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getDataPath: () => ipcRenderer.invoke('app:getDataPath'),
    openExternalUrl: (url: string) => ipcRenderer.invoke('app:openExternalUrl', url),
    openPath: (pathStr: string) => ipcRenderer.invoke('app:openPath', pathStr),
  }
} as CrawldeskApi)

// Declare the global type for the renderer
declare global {
  interface Window {
    crawldesk: CrawldeskApi
  }
}
