import { ipcMain } from 'electron'
import type { ExportService } from '../export/export-service'

export function registerExportsIpc(exportSvc: ExportService): void {
  ipcMain.handle('exports:urls', async (_e, input) => exportSvc.exportUrls(input))
  ipcMain.handle('exports:issues', async (_e, input) => exportSvc.exportIssues(input))
  ipcMain.handle('exports:links', async (_e, input) => exportSvc.exportLinks(input))
}
