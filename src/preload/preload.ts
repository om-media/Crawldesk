import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('crawldesk', {
  projects: {
    create: (input: any) => ipcRenderer.invoke('projects:create', input),
    list: () => ipcRenderer.invoke('projects:list'),
    get: (id: string) => ipcRenderer.invoke('projects:get', id),
    update: (id: string, patch: any) => ipcRenderer.invoke('projects:update', id, patch),
    delete: (id: string) => ipcRenderer.invoke('projects:delete', id),
  },
  crawls: {
    create: (projectId: string, settings: any) => ipcRenderer.invoke('crawls:create', { projectId, startUrl: settings.startUrl, settings }),
    start: (crawlId: string) => ipcRenderer.invoke('crawls:start', crawlId),
    pause: (crawlId: string) => ipcRenderer.invoke('crawls:pause', crawlId),
    resume: (crawlId: string) => ipcRenderer.invoke('crawls:resume', crawlId),
    stop: (crawlId: string) => ipcRenderer.invoke('crawls:stop', crawlId),
    get: (crawlId: string) => ipcRenderer.invoke('crawls:get', crawlId),
    listByProject: (projectId: string) => ipcRenderer.invoke('crawls:listByProject', projectId),
    onProgress: (cb: (...args: any[]) => void) => {
      const sub = (_e: any, data: any) => cb(data)
      ipcRenderer.on('crawls:progress', sub)
      return () => ipcRenderer.removeListener('crawls:progress', sub)
    },
    onStatus: (cb: (...args: any[]) => void) => {
      const sub = (_e: any, data: any) => cb(data)
      ipcRenderer.on('crawls:status', sub)
      return () => ipcRenderer.removeListener('crawls:status', sub)
    }
  },
  urls: {
    list: (input: any) => ipcRenderer.invoke('urls:list', input),
    get: (urlId: string) => ipcRenderer.invoke('urls:get', urlId),
    summarize: (crawlId: string) => ipcRenderer.invoke('urls:summarize', crawlId),
  },
  issues: {
    summarize: (crawlId: string) => ipcRenderer.invoke('issues:summarize', crawlId),
    list: (input: any) => ipcRenderer.invoke('issues:list', input),
  },
  links: {
    list: (input: any) => ipcRenderer.invoke('links:list', input),
    summarize: (crawlId: string) => ipcRenderer.invoke('links:summarize', crawlId),
  },
  exports: {
    exportUrls: (input: any) => ipcRenderer.invoke('exports:urls', input),
    exportIssues: (input: any) => ipcRenderer.invoke('exports:issues', input),
    exportLinks: (input: any) => ipcRenderer.invoke('exports:links', input),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getDataPath: () => ipcRenderer.invoke('app:getDataPath'),
    openExternalUrl: (url: string) => ipcRenderer.invoke('app:openExternalUrl', url),
    openPath: (pathStr: string) => ipcRenderer.invoke('app:openPath', pathStr),
  }
})
