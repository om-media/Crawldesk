"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCrawlsIpc = registerCrawlsIpc;
const electron_1 = require("electron");
const zod_1 = require("zod");
const CreateCrawlSchema = zod_1.z.object({
    projectId: zod_1.z.string().min(1),
    startUrl: zod_1.z.string().url(),
    settings: zod_1.z.object({
        maxUrls: zod_1.z.coerce.number().min(1).max(500000),
        maxDepth: zod_1.z.coerce.number().min(0).max(20),
        concurrency: zod_1.z.coerce.number().min(1).max(20),
        requestTimeoutMs: zod_1.z.coerce.number().min(1000).max(60000),
        respectRobotsTxt: zod_1.z.coerce.boolean(),
        crawlSubdomains: zod_1.z.coerce.boolean(),
        checkExternalLinks: zod_1.z.coerce.boolean(),
        crawlExternalLinks: zod_1.z.coerce.boolean(),
        userAgent: zod_1.z.string().min(1),
        includePatterns: zod_1.z.any().transform(v => { if (Array.isArray(v))
            return v; if (typeof v === 'string')
            return v.split('\n').filter(Boolean); return []; }),
        excludePatterns: zod_1.z.any().transform(v => { if (Array.isArray(v))
            return v; if (typeof v === 'string')
            return v.split('\n').filter(Boolean); return []; })
    })
});
function registerCrawlsIpc(repos, jobManager) {
    electron_1.ipcMain.handle('crawls:create', async (_e, input) => {
        console.log('[IPC] crawls:create type:', typeof input, 'keys:', Object.keys(input || {}), 'projectId:', input?.projectId, 'startUrl:', input?.startUrl);
        const parsed = CreateCrawlSchema.safeParse(input);
        if (!parsed.success) {
            const errStr = parsed.error.errors.map(e => `${e.path.join('.')}(${typeof input?.[e.path[e.path.length - 1]]}: "${input?.[e.path[e.path.length - 1]]}"): ${e.message}`).join('; ');
            console.error('[IPC] crawls:create validation failed:', errStr);
            throw new Error(`VALIDATION_ERROR: ${errStr}`);
        }
        const result = repos.crawls.create({ projectId: parsed.data.projectId, startUrl: parsed.data.startUrl }, parsed.data.settings);
        console.log('[IPC] crawls:create success:', result.id);
        return result;
    });
    electron_1.ipcMain.handle('crawls:start', async (_e, crawlId) => {
        console.log('[IPC] crawls:start called for:', crawlId);
        try {
            await jobManager.start(crawlId);
            console.log('[IPC] crawls:start success');
        }
        catch (err) {
            console.error('[IPC] crawls:start failed:', err?.message || err);
            throw err;
        }
    });
    electron_1.ipcMain.handle('crawls:pause', async (_e, crawlId) => {
        jobManager.pause(crawlId);
    });
    electron_1.ipcMain.handle('crawls:resume', async (_e, crawlId) => {
        jobManager.resume(crawlId);
    });
    electron_1.ipcMain.handle('crawls:stop', async (_e, crawlId) => {
        jobManager.stop(crawlId);
    });
    electron_1.ipcMain.handle('crawls:get', (_e, crawlId) => repos.crawls.get(crawlId));
    electron_1.ipcMain.handle('crawls:listByProject', (_e, projectId) => repos.crawls.listByProject(projectId));
}
//# sourceMappingURL=crawls.ipc.js.map