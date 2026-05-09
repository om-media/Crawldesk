"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const database_1 = require("./db/database");
const repositories_1 = require("./db/repositories");
const export_service_1 = require("./export/export-service");
const crawl_job_manager_1 = require("./crawl/crawl-job-manager");
const windows_1 = require("./windows");
const projects_ipc_1 = require("./ipc/projects.ipc");
const crawls_ipc_1 = require("./ipc/crawls.ipc");
const urls_ipc_1 = require("./ipc/urls.ipc");
const issues_ipc_1 = require("./ipc/issues.ipc");
const links_ipc_1 = require("./ipc/links.ipc");
const exports_ipc_1 = require("./ipc/exports.ipc");
const app_ipc_1 = require("./ipc/app.ipc");
electron_1.app.setName('CrawlDesk');
let jobManager = null;
process.on('uncaughtException', (err) => { console.error('[MAIN UNCAUGHT]', err.stack || err); });
process.on('unhandledRejection', (reason) => { console.error('[MAIN REJECTION]', reason); });
electron_1.app.whenReady().then(() => {
    try {
        const db = (0, database_1.initDatabase)();
        const repos = new repositories_1.Repositories(db);
        const exportSvc = new export_service_1.ExportService(db, electron_1.app.getPath('userData'));
        const win = (0, windows_1.createMainWindow)();
        jobManager = new crawl_job_manager_1.CrawlJobManager(repos, () => (0, windows_1.getMainWindow)());
        (0, projects_ipc_1.registerProjectsIpc)(repos);
        (0, crawls_ipc_1.registerCrawlsIpc)(repos, jobManager);
        (0, urls_ipc_1.registerUrlsIpc)(repos);
        (0, issues_ipc_1.registerIssuesIpc)(repos);
        (0, links_ipc_1.registerLinksIpc)(repos);
        (0, exports_ipc_1.registerExportsIpc)(exportSvc);
        (0, app_ipc_1.registerAppIpc)();
    }
    catch (e) {
        console.error('[MAIN FATAL]', e);
    }
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            (0, windows_1.createMainWindow)();
    });
});
electron_1.app.on('window-all-closed', () => {
    (0, database_1.closeDatabase)();
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
//# sourceMappingURL=main.js.map