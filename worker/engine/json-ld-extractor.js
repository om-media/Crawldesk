"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractJsonLd = extractJsonLd;
exports.getSchemaTypes = getSchemaTypes;
/**
 * Feature 3.3 — Extract JSON-LD structured data blocks from HTML.
 */
function extractJsonLd(html) {
    const blocks = [];
    // Match <script type="application/ld+json">...</script> tags
    const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
        const jsonStr = match[1].trim();
        if (!jsonStr)
            continue;
        try {
            const parsed = JSON.parse(jsonStr);
            if (Array.isArray(parsed)) {
                for (const item of parsed) {
                    if (typeof item === 'object' && item !== null) {
                        blocks.push(item);
                    }
                }
            }
            else if (typeof parsed === 'object') {
                blocks.push(parsed);
            }
        }
        catch {
            // Invalid JSON — skip silently; will be flagged as issue in detector
        }
    }
    return blocks;
}
/** Get all @type values from a set of JSON-LD blocks */
function getSchemaTypes(blocks) {
    const types = [];
    for (const block of blocks) {
        const typeVal = block['@type'];
        if (typeof typeVal === 'string') {
            types.push(typeVal);
        }
        else if (Array.isArray(typeVal)) {
            for (const t of typeVal) {
                if (typeof t === 'string')
                    types.push(t);
            }
        }
    }
    return [...new Set(types)];
}
//# sourceMappingURL=json-ld-extractor.js.map