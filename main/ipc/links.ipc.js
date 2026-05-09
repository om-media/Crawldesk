"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerLinksIpc = registerLinksIpc;
const electron_1 = require("electron");
function registerLinksIpc(repos) {
    electron_1.ipcMain.handle('links:list', (_e, input) => repos.links.list(input));
    electron_1.ipcMain.handle('links:summarize', (_e, crawlId) => repos.links.summarize(crawlId));
}
//# sourceMappingURL=links.ipc.js.map