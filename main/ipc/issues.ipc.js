"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerIssuesIpc = registerIssuesIpc;
const electron_1 = require("electron");
const issue_1 = require("../../shared/types/issue");
function registerIssuesIpc(repos) {
    electron_1.ipcMain.handle('issues:summarize', (_e, crawlId) => {
        const raw = repos.issues.summarize(crawlId);
        return raw.map(r => {
            const def = issue_1.ISSUE_DEFINITIONS[r.issue_type] || {};
            return {
                issue_type: r.issue_type,
                severity: r.severity,
                count: r.count,
                label: def.label || r.issue_type,
                explanation: def.explanation || '',
                recommendation: def.recommendation || ''
            };
        });
    });
    electron_1.ipcMain.handle('issues:list', (_e, input) => repos.issues.list(input));
}
//# sourceMappingURL=issues.ipc.js.map