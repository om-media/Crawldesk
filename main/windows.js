"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMainWindow = getMainWindow;
exports.createMainWindow = createMainWindow;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
let mainWindow = null;
function getMainWindow() {
    return mainWindow;
}
const RENDERER_PORT = 5173;
function hasBuiltRenderer() {
    return fs_1.default.existsSync(path_1.default.join(__dirname, '..', 'dist', 'renderer', 'index.html'));
}
function createMainWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 960,
        minHeight: 600,
        titleBarStyle: 'default',
        webPreferences: {
            preload: path_1.default.join(__dirname, '..', 'preload', 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });
    // Auto-detect dev mode: use Vite if env says development AND no built renderer exists
    const isDev = !process.env.IS_TEST && process.env.NODE_ENV === 'development' && !hasBuiltRenderer();
    console.log('[WINDOWS] Dev mode:', isDev, 'hasBuiltRenderer:', hasBuiltRenderer());
    if (isDev) {
        mainWindow.loadURL(`http://localhost:${RENDERER_PORT}`);
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path_1.default.join(__dirname, '..', 'dist', 'renderer', 'index.html'));
    }
    // Open external links in system browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        electron_1.shell.openExternal(url);
        return { action: 'deny' };
    });
    return mainWindow;
}
//# sourceMappingURL=windows.js.map