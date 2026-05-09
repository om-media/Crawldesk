"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerExportsIpc = registerExportsIpc;
const electron_1 = require("electron");
function registerExportsIpc(exportSvc) {
    electron_1.ipcMain.handle('exports:urls', async (_e, input) => exportSvc.exportUrls(input));
    electron_1.ipcMain.handle('exports:issues', async (_e, input) => exportSvc.exportIssues(input));
    electron_1.ipcMain.handle('exports:links', async (_e, input) => exportSvc.exportLinks(input));
}
//# sourceMappingURL=exports.ipc.js.map