import { ipcMain, shell, app } from 'electron'

export function registerAppIpc(): void {
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:getDataPath', () => app.getPath('userData'))
  ipcMain.handle('app:openExternalUrl', async (_e, url: string) => {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return false
    await shell.openExternal(url)
    return true
  })
  ipcMain.handle('app:openPath', async (_e, fileSystemPath: string) => {
    await shell.openPath(fileSystemPath)
    return true
  })
}
