import { app, BrowserWindow } from 'electron'
import path from 'path'
import { initDatabase, closeDatabase, getDbPath } from './db/database'
import { Repositories } from './db/repositories'
import { ExportService } from './export/export-service'
import { CrawlJobManager } from './crawl/crawl-job-manager'
import { createMainWindow, getMainWindow } from './windows'
import { registerProjectsIpc } from './ipc/projects.ipc'
import { registerCrawlsIpc } from './ipc/crawls.ipc'
import { registerUrlsIpc } from './ipc/urls.ipc'
import { registerIssuesIpc } from './ipc/issues.ipc'
import { registerLinksIpc } from './ipc/links.ipc'
import { registerExportsIpc } from './ipc/exports.ipc'
import { registerAppIpc } from './ipc/app.ipc'

app.setName('CrawlDesk')

let jobManager: CrawlJobManager | null = null

process.on('uncaughtException', (err) => { console.error('[MAIN UNCAUGHT]', err.stack || err) })
process.on('unhandledRejection', (reason) => { console.error('[MAIN REJECTION]', reason) })

app.whenReady().then(() => {
  try {
    const db = initDatabase()
    const repos = new Repositories(db)
    const exportSvc = new ExportService(db, app.getPath('userData'))

    const win = createMainWindow()

    jobManager = new CrawlJobManager(repos, () => getMainWindow())

    registerProjectsIpc(repos)
    registerCrawlsIpc(repos, jobManager)
    registerUrlsIpc(repos)
    registerIssuesIpc(repos)
    registerLinksIpc(repos)
    registerExportsIpc(exportSvc)
    registerAppIpc()
  } catch (e) {
    console.error('[MAIN FATAL]', e)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('before-quit', () => {
  // Gracefully stop active crawls before quitting
  jobManager?.gracefulShutdown()
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') app.quit()
})
