import { ipcMain } from 'electron'
import type { Repositories } from '../db/repositories'

export function registerLinksIpc(repos: Repositories): void {
  ipcMain.handle('links:list', (_e, input) => repos.links.list(input))
  ipcMain.handle('links:summarize', (_e, crawlId) => repos.links.summarize(crawlId))
}
