"use strict";
// Pure utility to generate valid XML sitemaps from crawl results.
// No external dependencies — works in main process, renderer, and worker threads.
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSitemap = generateSitemap;
const MAX_URLS_PER_FILE = 50_000;
const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const IMAGE_NS = 'http://www.google.com/schemas/sitemap-image/1.1';
/** Escape XML special characters */
function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
/** Format Date or ISO string as YYYY-MM-DD for <lastmod> */
function formatDate(raw) {
    if (!raw)
        return '';
    try {
        const d = new Date(raw);
        if (isNaN(d.getTime()))
            return '';
        return d.toISOString().slice(0, 10); // YYYY-MM-DD
    }
    catch {
        return '';
    }
}
/** Parse images_with_alt_json field into image entries */
function parseImagesField(rawJson) {
    if (!rawJson)
        return [];
    try {
        const parsed = JSON.parse(rawJson);
        return parsed
            .map((img) => ({ loc: String(img.src ?? img.loc ?? '') }))
            .filter((img) => img.loc);
    }
    catch {
        return [];
    }
}
/** Generate a single URL block XML string */
function urlBlock(urlRow, includeImages) {
    let xml = `    <url>\n      <loc>${esc(urlRow.url)}</loc>`;
    const lastmod = formatDate(urlRow.updated_at);
    if (lastmod) {
        xml += `\n      <lastmod>${lastmod}</lastmod>`;
    }
    xml += '\n    </url>';
    // Image sitemap extension
    if (includeImages) {
        const images = parseImagesField(urlRow.images_with_alt_json);
        for (const img of images) {
            xml += `\n    <image:image>\n      <image:loc>${esc(img.loc)}</image:loc>\n    </image:image>`;
        }
    }
    return xml;
}
function generateSitemap(input) {
    const onlyHttp200 = input.onlyHttp200 !== false;
    const onlyIndexable = input.onlyIndexable !== false;
    const includeImages = !!input.includeImages;
    const maxPerFile = input.maxUrlsPerFile ?? MAX_URLS_PER_FILE;
    // Filter URLs
    const filtered = input.urls.filter((row) => {
        if (onlyHttp200 && (row.status_code == null || row.status_code < 200 || row.status_code >= 300))
            return false;
        if (onlyIndexable && row.indexability !== 'indexable')
            return false;
        return true;
    });
    // Build namespace declarations
    const nsAttr = `xmlns="${SITEMAP_NS}"` + (includeImages ? ` xmlns:image="${IMAGE_NS}"` : '');
    if (filtered.length <= maxPerFile) {
        // Single file output
        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset ${nsAttr}>\n`;
        for (const row of filtered) {
            xml += urlBlock(row, includeImages) + '\n';
        }
        xml += '</urlset>';
        return { kind: 'urlset', xml, urlCount: filtered.length };
    }
    // Split into multiple files with a sitemap index
    const parts = {};
    const indexChildren = [];
    const now = new Date().toISOString().slice(0, 10);
    let chunkIdx = 0;
    let i = 0;
    while (i < filtered.length) {
        const chunk = filtered.slice(i, i + maxPerFile);
        const filename = chunkIdx === 0 ? 'sitemap.xml' : `sitemap-${chunkIdx}.xml`;
        let partXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset ${nsAttr}>\n`;
        for (const row of chunk) {
            partXml += urlBlock(row, includeImages) + '\n';
        }
        partXml += '</urlset>';
        parts[filename] = partXml;
        indexChildren.push(`  <sitemap>\n    <loc>${esc(filename)}</loc>\n    <lastmod>${now}</lastmod>\n  </sitemap>`);
        chunkIdx++;
        i += maxPerFile;
    }
    // Build index file
    let indexXml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="${SITEMAP_NS}">\n`;
    indexXml += indexChildren.join('\n') + '\n</sitemapindex>';
    return {
        kind: 'sitemapindex',
        xml: indexXml,
        parts,
        urlCount: filtered.length,
    };
}
//# sourceMappingURL=xml-sitemap-generator.js.map