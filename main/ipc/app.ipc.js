"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAppIpc = registerAppIpc;
const electron_1 = require("electron");
function registerAppIpc() {
    electron_1.ipcMain.handle('app:getVersion', () => electron_1.app.getVersion());
    electron_1.ipcMain.handle('app:getDataPath', () => electron_1.app.getPath('userData'));
    electron_1.ipcMain.handle('app:openExternalUrl', async (_e, url) => {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol))
            return false;
        await electron_1.shell.openExternal(url);
        return true;
    });
    electron_1.ipcMain.handle('app:openPath', async (_e, fileSystemPath) => {
        await electron_1.shell.openPath(fileSystemPath);
        return true;
    });
}
//# sourceMappingURL=app.ipc.js.map