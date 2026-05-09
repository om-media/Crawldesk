"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('crawldesk', {
    projects: {
        create: (input) => electron_1.ipcRenderer.invoke('projects:create', input),
        list: () => electron_1.ipcRenderer.invoke('projects:list'),
        get: (id) => electron_1.ipcRenderer.invoke('projects:get', id),
        update: (id, patch) => electron_1.ipcRenderer.invoke('projects:update', id, patch),
        delete: (id) => electron_1.ipcRenderer.invoke('projects:delete', id),
    },
    crawls: {
        create: (projectId, settings) => electron_1.ipcRenderer.invoke('crawls:create', { projectId, startUrl: settings.startUrl, settings }),
        start: (crawlId) => electron_1.ipcRenderer.invoke('crawls:start', crawlId),
        pause: (crawlId) => electron_1.ipcRenderer.invoke('crawls:pause', crawlId),
        resume: (crawlId) => electron_1.ipcRenderer.invoke('crawls:resume', crawlId),
        stop: (crawlId) => electron_1.ipcRenderer.invoke('crawls:stop', crawlId),
        get: (crawlId) => electron_1.ipcRenderer.invoke('crawls:get', crawlId),
        listByProject: (projectId) => electron_1.ipcRenderer.invoke('crawls:listByProject', projectId),
        onProgress: (cb) => {
            const sub = (_e, data) => cb(data);
            electron_1.ipcRenderer.on('crawls:progress', sub);
            return () => electron_1.ipcRenderer.removeListener('crawls:progress', sub);
        },
        onStatus: (cb) => {
            const sub = (_e, data) => cb(data);
            electron_1.ipcRenderer.on('crawls:status', sub);
            return () => electron_1.ipcRenderer.removeListener('crawls:status', sub);
        }
    },
    urls: {
        list: (input) => electron_1.ipcRenderer.invoke('urls:list', input),
        get: (urlId) => electron_1.ipcRenderer.invoke('urls:get', urlId),
        summarize: (crawlId) => electron_1.ipcRenderer.invoke('urls:summarize', crawlId),
    },
    issues: {
        summarize: (crawlId) => electron_1.ipcRenderer.invoke('issues:summarize', crawlId),
        list: (input) => electron_1.ipcRenderer.invoke('issues:list', input),
    },
    links: {
        list: (input) => electron_1.ipcRenderer.invoke('links:list', input),
        summarize: (crawlId) => electron_1.ipcRenderer.invoke('links:summarize', crawlId),
    },
    exports: {
        exportUrls: (input) => electron_1.ipcRenderer.invoke('exports:urls', input),
        exportIssues: (input) => electron_1.ipcRenderer.invoke('exports:issues', input),
        exportLinks: (input) => electron_1.ipcRenderer.invoke('exports:links', input),
    },
    app: {
        getVersion: () => electron_1.ipcRenderer.invoke('app:getVersion'),
        getDataPath: () => electron_1.ipcRenderer.invoke('app:getDataPath'),
        openExternalUrl: (url) => electron_1.ipcRenderer.invoke('app:openExternalUrl', url),
        openPath: (pathStr) => electron_1.ipcRenderer.invoke('app:openPath', pathStr),
    }
});
//# sourceMappingURL=preload.js.map