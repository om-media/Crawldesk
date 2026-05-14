import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'

export function registerPsiIpc(db: Database): void {
  // List all PSI results for a crawl
  ipcMain.handle('psi:listByCrawl', (_e, crawlId: string) => {
    return db.prepare(`
      SELECT id, crawl_id, url_id, url, strategy,
        performance_score, accessibility_score, best_practices_score, seo_score,
        lcp_ms, fid_ms, cls, fcp_ms, ttfb_ms, speed_index, fetched_at
      FROM psi_results WHERE crawl_id = ? ORDER BY fetched_at DESC
    `).all(crawlId) as any[]
  })

  // Aggregate summary of PSI scores across a crawl
  ipcMain.handle('psi:summarize', (_e, crawlId: string) => {
    const row = db.prepare(`
      SELECT 
        AVG(performance_score) as avgPerformance,
        AVG(accessibility_score) as avgAccessibility,
        AVG(best_practices_score) as avgBestPractices,
        AVG(seo_score) as avgSeo,
        AVG(lcp_ms) as avgLcpMs,
        AVG(cls) as avgCls,
        COUNT(*) as totalUrlsWithPsi
      FROM psi_results WHERE crawl_id = ?
    `).get(crawlId) as any
    if (!row || !row.totalUrlsWithPsi) {
      return {
        avgPerformance: null, avgAccessibility: null,
        avgBestPractices: null, avgSeo: null,
        avgLcpMs: null, avgCls: null,
        totalUrlsWithPsi: 0
      }
    }
    return {
      avgPerformance: Math.round((row.avgPerformance ?? 0) * 100),
      avgAccessibility: Math.round((row.avgAccessibility ?? 0) * 100),
      avgBestPractices: Math.round((row.avgBestPractices ?? 0) * 100),
      avgSeo: Math.round((row.avgSeo ?? 0) * 100),
      avgLcpMs: Math.round(row.avgLcpMs ?? 0),
      avgCls: parseFloat((row.avgCls ?? 0).toFixed(3)),
      totalUrlsWithPsi: row.totalUrlsWithPsi
    }
  })
}
