"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSitemap = parseSitemap;
function parseSitemap(xml) {
    try {
        const urls = [];
        // Match <url><loc>...</loc></url> blocks
        const urlRegex = /<url[^>]*>([\s\S]*?)<\/url>/gi;
        let match;
        while ((match = urlRegex.exec(xml)) !== null) {
            const block = match[1];
            const locMatch = block.match(/<loc[^>]*>(.*?)<\/loc>/i);
            if (locMatch) {
                const priorityMatch = block.match(/<priority[^>]*>(.*?)<\/priority>/i);
                urls.push({
                    loc: locMatch[1].trim(),
                    priority: priorityMatch ? parseFloat(priorityMatch[1]) : undefined
                });
            }
        }
        return urls.length > 0 ? urls : null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=sitemap.js.map