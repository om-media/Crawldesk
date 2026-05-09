"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UrlFrontier = void 0;
class UrlFrontier {
    queue = [];
    seen = new Set();
    visited = new Set();
    _maxUrls;
    constructor(maxUrls) {
        this._maxUrls = maxUrls;
    }
    add(url, depth, discoveredFrom) {
        // Normalize for dedup (simple lowercase + no trailing slash except root)
        let norm = url.toLowerCase();
        if (!norm.includes('?')) {
            norm = norm.replace(/\/+$/, '') || '/';
        }
        if (this.hasSeen(norm))
            return false;
        const total = this.seen.size + this.visited.size;
        if (total >= this._maxUrls)
            return false;
        // URL length check
        if (url.length > 2048)
            return false;
        // Query param count check
        try {
            const parsed = new URL(url);
            if ([...parsed.searchParams.keys()].length > 10)
                return false;
        }
        catch { }
        this.queue.push({ url, normalizedUrl: norm, depth, discoveredFrom });
        this.seen.add(norm);
        return true;
    }
    next() {
        return this.queue.shift() ?? null;
    }
    take(count) {
        const batch = [];
        for (let i = 0; i < count && this.queue.length > 0; i++) {
            const item = this.queue.shift();
            if (item)
                batch.push(item);
        }
        return batch;
    }
    markVisited(normalizedUrl) {
        const norm = normalizedUrl.toLowerCase().replace(/\/+$/, '') || '/';
        this.seen.delete(norm);
        this.visited.add(norm);
    }
    hasSeen(normalizedUrl) {
        const norm = normalizedUrl.toLowerCase().replace(/\/+$/, '') || '/';
        return this.seen.has(norm) || this.visited.has(norm);
    }
    size() {
        return this.queue.length;
    }
    visitedCount() {
        return this.visited.size + this.seen.size - this.queue.length;
    }
    totalProcessed() {
        return this.visited.size;
    }
}
exports.UrlFrontier = UrlFrontier;
//# sourceMappingURL=url-frontier.js.map