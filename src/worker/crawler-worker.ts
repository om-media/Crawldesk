import { parentPort } from 'worker_threads'
import type { PageResult } from '../shared/types/url'
import { CrawlEngine } from './engine/crawl-engine'
import type { CrawlSettingsInput } from '../shared/types/crawl'

if (!parentPort) throw new Error('Worker must be started with a parent port')

interface StartMessage {
  type: 'crawl:start'
  crawlId: string
  startUrl: string
  settings: CrawlSettingsInput
  rootHostname: string
}

let engine: CrawlEngine | null = null

const BATCH_SIZE = 25
const batchBuffer: PageResult[] = []

function flushBatch(): void {
  if (batchBuffer.length === 0) return
  parentPort!.postMessage({
    type: 'crawl:pageResultBatch',
    results: [...batchBuffer],
  })
  batchBuffer.length = 0 // clear
}

parentPort.on('message', (msg: any) => {
  console.log('[WORKER] Received message:', msg.type, msg.crawlId ? `crawlId=${msg.crawlId}` : '')
  switch (msg.type) {
    case 'crawl:start': {
      const m = msg as StartMessage
      console.log('[WORKER] Starting CrawlEngine. startUrl:', m.startUrl, 'maxUrls:', m.settings.maxUrls)
      try {
        engine = new CrawlEngine(
          m.settings,
          m.rootHostname,
          m.startUrl,
          {
            onProgress(progress) {
              parentPort!.postMessage({
                type: 'crawl:progress',
                progress: { ...progress, crawlId: m.crawlId }
              })
            },
            onPageResultBatch(results) {
              for (const r of results) {
                r.crawlId = m.crawlId
                batchBuffer.push(r)
              }
              if (batchBuffer.length >= BATCH_SIZE) {
                flushBatch()
              }
            },
            onCompleted() {
              flushBatch() // final flush
              console.log('[WORKER] Crawl completed')
              parentPort!.postMessage({
                type: 'crawl:completed',
                summary: {}
              })
            },
            onFailed(error) {
              console.error('[WORKER] Crawl failed:', error)
              parentPort!.postMessage({
                type: 'crawl:failed',
                error
              })
            },
          }
        )

        parentPort!.postMessage({ type: 'crawl:started', crawlId: m.crawlId })
        void engine.start().catch(err => {
          console.error('[WORKER] engine.start() threw:', err?.message || err)
          parentPort!.postMessage({ type: 'crawl:failed', error: { code: 'ENGINE_ERROR', message: String(err) } })
        })
      } catch (err: any) {
        console.error('[WORKER] Failed to create/start engine:', err?.message || err, err.stack)
        parentPort!.postMessage({ type: 'crawl:failed', error: { code: 'ENGINE_ERROR', message: String(err) } })
      }
      break
    }
    case 'crawl:pause':
      engine?.pause()
      break
    case 'crawl:resume':
      engine?.resume()
      break
    case 'crawl:stop':
      engine?.stop()
      break
  }
})
