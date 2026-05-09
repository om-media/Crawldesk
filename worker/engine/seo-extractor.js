"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractSeo = extractSeo;
const cheerio = __importStar(require("cheerio"));
const crypto_1 = require("crypto");
function extractSeo(html, pageUrl) {
    const $ = cheerio.load(html);
    let title = $('title').first().text()?.trim().replace(/\s+/g, ' ') || null;
    const titleLength = title?.length ?? 0;
    void $('title').length;
    let metaDescription = $('meta[name="description"]').attr('content')?.trim().replace(/\s+/g, ' ') || null;
    const metaDescriptionLength = metaDescription?.length ?? 0;
    const h1Elements = $('h1');
    const h1Count = h1Elements.length;
    const h1 = h1Elements.first().text()?.trim().replace(/\s+/g, ' ') || null;
    const canonicalEls = $('link[rel~="canonical"]');
    const canonicalRaw = canonicalEls.first().attr('href')?.trim() || null;
    const canonical = resolveRelative(canonicalRaw, pageUrl);
    let robotsMeta = $('meta[name="robots"]').first().attr('content')?.trim() || null;
    if (!robotsMeta) {
        robotsMeta = $('meta[name="googlebot"]').first().attr('content')?.trim() || null;
    }
    let xRobotsTag = null;
    const robotsHeader = $('head meta[property="x-robots-tag" i]');
    if (robotsHeader.length > 0) {
        xRobotsTag = robotsHeader.first().attr('content')?.trim() || null;
    }
    $('script, style, noscript, svg').remove();
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;
    const contentHash = (0, crypto_1.createHash)('sha256').update(bodyText).digest('hex').slice(0, 16);
    const links = [];
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href)
            return;
        const anchorText = $(el).text()?.trim() || '';
        const rel = $(el).attr('rel');
        links.push({ targetUrl: href, anchorText, linkType: 'html_a', rel });
    });
    $('img[src]').each((_, el) => {
        const src = $(el).attr('src');
        if (src)
            links.push({ targetUrl: src, linkType: 'image' });
    });
    $('link[rel="stylesheet"], link[type="text/css"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href)
            links.push({ targetUrl: href, linkType: 'css' });
    });
    $('script[src]').each((_, el) => {
        const src = $(el).attr('src');
        if (src)
            links.push({ targetUrl: src, linkType: 'script' });
    });
    $('iframe[src]').each((_, el) => {
        const src = $(el).attr('src');
        if (src)
            links.push({ targetUrl: src, linkType: 'iframe' });
    });
    return { title, titleLength, metaDescription, metaDescriptionLength, h1, h1Count, canonical, robotsMeta, xRobotsTag, wordCount, contentHash, links };
}
function resolveRelative(href, base) {
    if (!href)
        return null;
    try {
        return new URL(href, base).href;
    }
    catch {
        return href;
    }
}
//# sourceMappingURL=seo-extractor.js.map