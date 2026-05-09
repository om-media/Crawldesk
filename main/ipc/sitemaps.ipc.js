"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSitemapsIpc = registerSitemapsIpc;
const electron_1 = require("electron");
const xml_sitemap_generator_1 = require("../../shared/utils/xml-sitemap-generator");
function registerSitemapsIpc(db) {
    electron_1.ipcMain.handle('sitemaps:generate', async (_e, input) => {
        const { crawlId, onlyHttp200, onlyIndexable, includeImages, maxUrlsPerFile } = input;
        // Build query with filters
        const clauses = ['crawl_id = ?'];
        const params = [crawlId];
        if (onlyHttp200 !== false) {
            clauses.push('status_code >= 200 AND status_code < 300');
        }
        if (onlyIndexable !== false) {
            clauses.push("indexability = 'indexable'");
        }
        const rows = db.prepare(`
        SELECT url, updated_at, title, status_code, indexability, images_with_alt_json
        FROM urls WHERE ${clauses.join(' AND ')} ORDER BY url ASC
      `).all(...params);
        return (0, xml_sitemap_generator_1.generateSitemap)({
            urls: rows,
            onlyHttp200,
            onlyIndexable,
            includeImages: !!includeImages,
            maxUrlsPerFile,
        });
    });
}
//# sourceMappingURL=sitemaps.ipc.js.map