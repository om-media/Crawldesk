import { BrowserWindow, shell } from 'electron'
import path from 'path'
import fs from 'fs'

let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

const RENDERER_PORT = 5173

function hasBuiltRenderer(): boolean {
  return fs.existsSync(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'))
}

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Auto-detect dev mode: use Vite if env says development AND no built renderer exists
  const isDev = !process.env.IS_TEST && process.env.NODE_ENV === 'development' && !hasBuiltRenderer()
  console.log('[WINDOWS] Dev mode:', isDev, 'hasBuiltRenderer:', hasBuiltRenderer())
  if (isDev) {
    mainWindow.loadURL(`http://localhost:${RENDERER_PORT}`)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'))
  }

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  return mainWindow
}
