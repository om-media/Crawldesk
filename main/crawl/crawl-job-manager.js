"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrawlJobManager = void 0;
const worker_threads_1 = require("worker_threads");
const path_1 = __importDefault(require("path"));
class CrawlJobManager {
    repos;
    mainWindowGetter;
    activeCrawlId = null;
    worker = null;
    resumeResolve = null;
    isPaused = false;
    constructor(repos, mainWindowGetter) {
        this.repos = repos;
        this.mainWindowGetter = mainWindowGetter;
    }
    async start(crawlId) {
        console.log('[JOB] Starting crawl:', crawlId);
        if (this.activeCrawlId && this.activeCrawlId !== crawlId) {
            throw new Error('CRAWL_ALREADY_RUNNING');
        }
        const settings = this.repos.crawls.getSettings(crawlId);
        if (!settings)
            throw new Error('NOT_FOUND');
        const crawl = this.repos.crawls.get(crawlId);
        if (!crawl)
            throw new Error('NOT_FOUND');
        this.repos.crawls.updateStatus(crawlId, 'running');
        this.activeCrawlId = crawlId;
        this.isPaused = false;
        this.resumeResolve = null;
        // Start worker thread pointing to compiled JS
        // With outDir=".", __dirname resolves to main/crawl/ and worker/ is sibling of main/
        const workerPath = path_1.default.join(__dirname, '..', '..', 'worker', 'crawler-worker.js');
        console.log('[JOB] Worker path:', workerPath, '(exists:', require('fs').existsSync(workerPath), ')');
        this.worker = new worker_threads_1.Worker(workerPath);
        this.worker.postMessage({
            type: 'crawl:start',
            crawlId,
            startUrl: crawl.start_url,
            settings,
            rootHostname: (() => { try {
                return new URL(crawl.start_url).hostname.toLowerCase();
            }
            catch {
                return '';
            } })(),
        });
        this.worker.on('message', (msg) => this.handleWorkerMessage(msg));
        this.worker.on('error', (err) => {
            console.error('[JOB] Worker error:', err.message || err);
            this.repos.crawls.updateStatus(crawlId, 'failed', { error_code: 'WORKER_ERROR' });
            this.emitToRenderer('crawls:status', { crawlId, status: 'failed' });
            this.cleanup();
        });
        this.worker.on('exit', () => this.cleanup());
    }
    pause(crawlId) {
        if (this.activeCrawlId !== crawlId)
            return;
        this.isPaused = true;
        this.repos.crawls.updateStatus(crawlId, 'paused');
        this.worker?.postMessage({ type: 'crawl:pause' });
    }
    resume(crawlId) {
        if (this.activeCrawlId !== crawlId)
            return;
        this.isPaused = false;
        this.repos.crawls.updateStatus(crawlId, 'running');
        this.resumeResolve?.();
        this.resumeResolve = null;
        this.worker?.postMessage({ type: 'crawl:resume' });
    }
    stop(crawlId) {
        if (this.activeCrawlId !== crawlId)
            return;
        this.repos.crawls.updateStatus(crawlId, 'stopped');
        this.worker?.postMessage({ type: 'crawl:stop' });
        this.cleanup();
    }
    handleWorkerMessage(msg) {
        switch (msg.type) {
            case 'crawl:pageResultBatch':
                this.handlePageResultBatch(msg.results);
                break;
            case 'crawl:progress':
                this.emitToRenderer('crawls:progress', msg.progress);
                break;
            case 'crawl:completed':
                this.repos.crawls.updateStatus(this.activeCrawlId, 'completed');
                this.emitToRenderer('crawls:status', { crawlId: this.activeCrawlId, status: 'completed' });
                this.cleanup();
                break;
            case 'crawl:failed':
                this.repos.crawls.updateStatus(this.activeCrawlId, 'failed', {
                    error_code: msg.error?.code ?? 'UNKNOWN_ERROR',
                    error_message: msg.error?.message ?? 'Unknown worker error'
                });
                this.emitToRenderer('crawls:status', { crawlId: this.activeCrawlId, status: 'failed' });
                this.cleanup();
                break;
        }
    }
    handlePageResultBatch(results) {
        if (!results.length)
            return;
        // Bulk upsert into DB
        this.repos.urls.bulkUpsertUrls(results);
        // Update counters
        const completed = results.filter(r => r.fetchErrorCode == null && !r.skippedReason).length;
        const failed = results.filter(r => r.fetchErrorCode != null || (r.statusCode && r.statusCode >= 400)).length;
        const blocked = results.filter(r => r.blockedReason || r.skippedReason === 'robots_txt').length;
        const discovered = results.length - failed - blocked;
        if (this.activeCrawlId) {
            const current = this.repos.crawls.get(this.activeCrawlId);
            this.repos.crawls.updateCounters(this.activeCrawlId, {
                total_completed: current.total_completed + completed,
                total_failed: current.total_failed + failed,
                total_blocked: current.total_blocked + blocked,
                total_discovered: current.total_discovered + discovered,
            });
            // Emit progress to renderer
            this.emitToRenderer('crawls:progress', {
                crawlId: this.activeCrawlId,
                total_discovered: current.total_discovered + discovered,
                total_queued: 0,
                total_completed: current.total_completed + completed,
                total_failed: current.total_failed + failed,
                total_blocked: current.total_blocked + blocked,
                urlsPerMinute: 0,
                avgResponseTimeMs: 0,
                elapsedTimeSeconds: 0,
            });
        }
    }
    cleanup() {
        this.worker?.terminate().catch(() => { });
        this.worker = null;
        this.activeCrawlId = null;
        this.resumeResolve = null;
        this.isPaused = false;
    }
    emitToRenderer(channel, data) {
        const win = this.mainWindowGetter();
        if (win && !win.isDestroyed()) {
            win.webContents.send(channel, data);
        }
    }
}
exports.CrawlJobManager = CrawlJobManager;
//# sourceMappingURL=crawl-job-manager.js.map