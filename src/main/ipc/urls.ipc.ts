import { ipcMain } from 'electron'
import type { Repositories } from '../db/repositories'

export function registerUrlsIpc(repos: Repositories): void {
  ipcMain.handle('urls:list', (_e, input) => repos.urls.list(input))
  ipcMain.handle('urls:get', (_e, urlId) => repos.urls.get(urlId))
  ipcMain.handle('urls:summarize', (_e, crawlId) => repos.urls.summarize(crawlId))
}
