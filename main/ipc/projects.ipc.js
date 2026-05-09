"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerProjectsIpc = registerProjectsIpc;
const electron_1 = require("electron");
const zod_1 = require("zod");
const CreateProjectSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(120),
    rootUrl: zod_1.z.string().url().refine(u => ['http:', 'https:'].includes(new URL(u).protocol))
});
function registerProjectsIpc(repos) {
    electron_1.ipcMain.handle('projects:create', (_e, input) => {
        const parsed = CreateProjectSchema.safeParse(input);
        if (!parsed.success)
            throw new Error(`VALIDATION_ERROR: ${parsed.error.message}`);
        return repos.projects.create(parsed.data);
    });
    electron_1.ipcMain.handle('projects:list', () => repos.projects.list());
    electron_1.ipcMain.handle('projects:get', (_e, projectId) => {
        if (!crypto.randomUUID || !projectId.startsWith('5') && !/^[0-9a-f]{36}$/i.test(projectId)) {
            // loose UUID check — let repo handle actual existence
        }
        return repos.projects.get(projectId);
    });
    electron_1.ipcMain.handle('projects:update', (_e, projectId, patch) => repos.projects.update(projectId, patch));
    electron_1.ipcMain.handle('projects:delete', (_e, projectId) => { repos.projects.delete(projectId); return true; });
}
//# sourceMappingURL=projects.ipc.js.map