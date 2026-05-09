"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
const crawl_engine_1 = require("./engine/crawl-engine");
if (!worker_threads_1.parentPort)
    throw new Error('Worker must be started with a parent port');
let engine = null;
const BATCH_SIZE = 25;
const batchBuffer = [];
function flushBatch() {
    if (batchBuffer.length === 0)
        return;
    worker_threads_1.parentPort.postMessage({
        type: 'crawl:pageResultBatch',
        results: [...batchBuffer],
    });
    batchBuffer.length = 0; // clear
}
worker_threads_1.parentPort.on('message', (msg) => {
    console.log('[WORKER] Received message:', msg.type, msg.crawlId ? `crawlId=${msg.crawlId}` : '');
    switch (msg.type) {
        case 'crawl:start': {
            const m = msg;
            console.log('[WORKER] Starting CrawlEngine. startUrl:', m.startUrl, 'maxUrls:', m.settings.maxUrls);
            try {
                engine = new crawl_engine_1.CrawlEngine(m.settings, m.rootHostname, m.startUrl, {
                    onProgress(progress) {
                        worker_threads_1.parentPort.postMessage({
                            type: 'crawl:progress',
                            progress: { ...progress, crawlId: m.crawlId }
                        });
                    },
                    onPageResultBatch(results) {
                        for (const r of results) {
                            r.crawlId = m.crawlId;
                            batchBuffer.push(r);
                        }
                        if (batchBuffer.length >= BATCH_SIZE) {
                            flushBatch();
                        }
                    },
                    onCompleted() {
                        flushBatch(); // final flush
                        console.log('[WORKER] Crawl completed');
                        worker_threads_1.parentPort.postMessage({
                            type: 'crawl:completed',
                            summary: {}
                        });
                    },
                    onFailed(error) {
                        console.error('[WORKER] Crawl failed:', error);
                        worker_threads_1.parentPort.postMessage({
                            type: 'crawl:failed',
                            error
                        });
                    },
                });
                worker_threads_1.parentPort.postMessage({ type: 'crawl:started', crawlId: m.crawlId });
                void engine.start().catch(err => {
                    console.error('[WORKER] engine.start() threw:', err?.message || err);
                    worker_threads_1.parentPort.postMessage({ type: 'crawl:failed', error: { code: 'ENGINE_ERROR', message: String(err) } });
                });
            }
            catch (err) {
                console.error('[WORKER] Failed to create/start engine:', err?.message || err, err.stack);
                worker_threads_1.parentPort.postMessage({ type: 'crawl:failed', error: { code: 'ENGINE_ERROR', message: String(err) } });
            }
            break;
        }
        case 'crawl:pause':
            engine?.pause();
            break;
        case 'crawl:resume':
            engine?.resume();
            break;
        case 'crawl:stop':
            engine?.stop();
            break;
    }
});
//# sourceMappingURL=crawler-worker.js.map