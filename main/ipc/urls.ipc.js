"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerUrlsIpc = registerUrlsIpc;
const electron_1 = require("electron");
function registerUrlsIpc(repos) {
    electron_1.ipcMain.handle('urls:list', (_e, input) => repos.urls.list(input));
    electron_1.ipcMain.handle('urls:get', (_e, urlId) => repos.urls.get(urlId));
    electron_1.ipcMain.handle('urls:summarize', (_e, crawlId) => repos.urls.summarize(crawlId));
}
//# sourceMappingURL=urls.ipc.js.map