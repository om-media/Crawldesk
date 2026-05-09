import { ipcMain } from 'electron'
import { z } from 'zod'
import type { Repositories } from '../db/repositories'
import type { CrawlSettingsInput } from '../../shared/types/crawl'
import { CrawlJobManager } from '../crawl/crawl-job-manager'

const CreateCrawlSchema = z.object({
  projectId: z.string().min(1),
  startUrl: z.string().url(),
  settings: z.object({
    maxUrls: z.coerce.number().min(1).max(500000),
    maxDepth: z.coerce.number().min(0).max(20),
    concurrency: z.coerce.number().min(1).max(20),
    requestTimeoutMs: z.coerce.number().min(1000).max(60000),
    respectRobotsTxt: z.coerce.boolean(),
    crawlSubdomains: z.coerce.boolean(),
    checkExternalLinks: z.coerce.boolean(),
    crawlExternalLinks: z.coerce.boolean(),
    userAgent: z.string().min(1),
    includePatterns: z.any().transform(v => { if (Array.isArray(v)) return v; if (typeof v === 'string') return v.split('\n').filter(Boolean); return [] }),
    excludePatterns: z.any().transform(v => { if (Array.isArray(v)) return v; if (typeof v === 'string') return v.split('\n').filter(Boolean); return [] })
  })
})

export function registerCrawlsIpc(repos: Repositories, jobManager: CrawlJobManager): void {
  ipcMain.handle('crawls:create', async (_e, input) => {
    console.log('[IPC] crawls:create type:', typeof input, 'keys:', Object.keys(input || {}), 'projectId:', input?.projectId, 'startUrl:', input?.startUrl)
    const parsed = CreateCrawlSchema.safeParse(input)
    if (!parsed.success) {
      const errStr = parsed.error.errors.map(e => `${e.path.join('.')}(${typeof (input as any)?.[e.path[e.path.length-1]]}: "${(input as any)?.[e.path[e.path.length-1]]}"): ${e.message}`).join('; ')
      console.error('[IPC] crawls:create validation failed:', errStr)
      throw new Error(`VALIDATION_ERROR: ${errStr}`)
    }
    const result = repos.crawls.create({ projectId: parsed.data.projectId, startUrl: parsed.data.startUrl }, parsed.data.settings)
    console.log('[IPC] crawls:create success:', result.id)
    return result
  })

  ipcMain.handle('crawls:start', async (_e, crawlId: string) => {
    console.log('[IPC] crawls:start called for:', crawlId)
    try {
      await jobManager.start(crawlId)
      console.log('[IPC] crawls:start success')
    } catch (err: any) {
      console.error('[IPC] crawls:start failed:', err?.message || err)
      throw err
    }
  })

  ipcMain.handle('crawls:pause', async (_e, crawlId: string) => {
    jobManager.pause(crawlId)
  })

  ipcMain.handle('crawls:resume', async (_e, crawlId: string) => {
    jobManager.resume(crawlId)
  })

  ipcMain.handle('crawls:stop', async (_e, crawlId: string) => {
    jobManager.stop(crawlId)
  })

  ipcMain.handle('crawls:get', (_e, crawlId: string) => repos.crawls.get(crawlId))

  ipcMain.handle('crawls:listByProject', (_e, projectId: string) => repos.crawls.listByProject(projectId))
}
