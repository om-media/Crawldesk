import { ipcMain } from 'electron'
import type { Database as BetterSqlite3Db } from 'better-sqlite3'
import { generateSitemap } from '../../shared/utils/xml-sitemap-generator'
import type { GenerateSitemapInput, GeneratedSitemapResult } from '../../shared/types/sitemap-generator'

export function registerSitemapsIpc(db: BetterSqlite3Db): void {
  ipcMain.handle(
    'sitemaps:generate',
    async (_e, input: Omit<GenerateSitemapInput, 'urls'> & { crawlId: string }): Promise<GeneratedSitemapResult> => {
      const { crawlId, onlyHttp200, onlyIndexable, includeImages, maxUrlsPerFile } = input

      // Build query with filters
      const clauses: string[] = ['crawl_id = ?']
      const params: any[] = [crawlId]

      if (onlyHttp200 !== false) {
        clauses.push('status_code >= 200 AND status_code < 300')
      }
      if (onlyIndexable !== false) {
        clauses.push("indexability = 'indexable'")
      }

      const rows = db.prepare(`
        SELECT url, updated_at, title, status_code, indexability, images_with_alt_json
        FROM urls WHERE ${clauses.join(' AND ')} ORDER BY url ASC
      `).all(...params) as Array<{
        url: string
        updated_at: string
        title?: string | null
        status_code?: number | null
        indexability?: string | null
        images_with_alt_json?: string | null
      }>

      return generateSitemap({
        urls: rows,
        onlyHttp200,
        onlyIndexable,
        includeImages: !!includeImages,
        maxUrlsPerFile,
      })
    }
  )
}
