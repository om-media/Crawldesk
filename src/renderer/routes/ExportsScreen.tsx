import { useState } from 'react'
import { useResolvedCrawl } from '../hooks/use-resolved-crawl'

type ExportKind = 'urls' | 'issues' | 'links' | 'keywords' | 'contentAudit' | 'clusters' | 'performance'

type ExportStatus = {
  state: 'idle' | 'running' | 'success' | 'error'
  message: string
}

const initialStatuses: Record<ExportKind, ExportStatus> = {
  urls: { state: 'idle', message: '' },
  issues: { state: 'idle', message: '' },
  links: { state: 'idle', message: '' },
  keywords: { state: 'idle', message: '' },
  contentAudit: { state: 'idle', message: '' },
  clusters: { state: 'idle', message: '' },
  performance: { state: 'idle', message: '' },
}

export default function ExportsScreen() {
  const { activeCrawlId, resolvingCrawl, resolveError } = useResolvedCrawl()
  const [statuses, setStatuses] = useState<Record<ExportKind, ExportStatus>>(initialStatuses)

  async function runExport(kind: ExportKind, label: string, action: () => Promise<any>) {
    if (!activeCrawlId) return
    setStatuses(current => ({ ...current, [kind]: { state: 'running', message: 'Exporting...' } }))
    try {
      const result = await action()
      setStatuses(current => ({
        ...current,
        [kind]: {
          state: 'success',
          message: `Exported ${result.rowCount} ${label} to ${result.filePath}`,
        },
      }))
    } catch (err: any) {
      setStatuses(current => ({
        ...current,
        [kind]: { state: 'error', message: err?.message || `Failed to export ${label}` },
      }))
    }
  }

  const exportItems = [
    {
      kind: 'urls' as const,
      label: 'All URLs CSV',
      entity: 'URLs',
      desc: 'Export all crawled URLs with SEO metadata.',
      action: () => window.crawldesk.exports.exportUrls({ crawlId: activeCrawlId }),
    },
    {
      kind: 'issues' as const,
      label: 'Issues CSV',
      entity: 'issues',
      desc: 'Export detected issues grouped by severity.',
      action: () => window.crawldesk.exports.exportIssues({ crawlId: activeCrawlId }),
    },
    {
      kind: 'links' as const,
      label: 'Links CSV',
      entity: 'links',
      desc: 'Export all internal and external links found.',
      action: () => window.crawldesk.exports.exportLinks({ crawlId: activeCrawlId }),
    },
    {
      kind: 'keywords' as const,
      label: 'Keywords CSV',
      entity: 'keywords',
      desc: 'Export crawl keyword frequencies for spreadsheet analysis.',
      action: () => window.crawldesk.exports.exportKeywords({ crawlId: activeCrawlId, gramType: 'unigrams' }),
    },
    {
      kind: 'contentAudit' as const,
      label: 'Content Audit CSV',
      entity: 'content audit rows',
      desc: 'Export readability, word count, and reading-level metrics.',
      action: () => window.crawldesk.exports.exportContentAudit({ crawlId: activeCrawlId }),
    },
    {
      kind: 'clusters' as const,
      label: 'Clusters CSV',
      entity: 'cluster rows',
      desc: 'Export content clusters with member URLs and similarity scores.',
      action: () => window.crawldesk.exports.exportClusters({ crawlId: activeCrawlId }),
    },
    {
      kind: 'performance' as const,
      label: 'Performance CSV',
      entity: 'performance rows',
      desc: 'Export crawl timing, size, score, and carbon estimate data.',
      action: () => window.crawldesk.exports.exportPerformance({
        crawlId: activeCrawlId,
        filters: { mode: 'all', search: '' },
        sort: { mode: 'slowest' },
      }),
    },
  ]

  if (!activeCrawlId) return (
    <div className="card py-16 text-center">
      <p className="text-lg font-semibold text-primary-text">{resolvingCrawl ? 'Loading latest crawl...' : 'No data to export.'}</p>
      <p className="text-sm text-primary-muted mt-2">{resolveError || (resolvingCrawl ? 'Finding the most recent crawl for this project.' : 'Complete a crawl first, then export results here.')}</p>
    </div>
  )

  return (
    <div>
      <h1 className="text-[30px] leading-none tracking-tight font-bold text-primary-text mb-6">Exports</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {exportItems.map(item => {
          const status = statuses[item.kind]
          const isRunning = status.state === 'running'
          return (
          <div key={item.label} className="card flex flex-col">
            <h3 className="font-semibold text-primary-text">{item.label}</h3>
            <p className="text-sm text-primary-muted mt-1">{item.desc}</p>
            <button
              onClick={() => runExport(item.kind, item.entity, item.action)}
              disabled={isRunning}
              className="btn-primary mt-auto pt-6 !py-3 disabled:opacity-60"
            >
              {isRunning ? 'Exporting...' : item.label}
            </button>
            {status.message && (
              <div className={`mt-3 rounded-lg p-2 text-xs border ${
                status.state === 'success'
                  ? 'bg-emerald/10 border-emerald/30 text-emerald'
                  : status.state === 'error'
                    ? 'bg-red-500/10 border-red-900 text-red-400'
                    : 'bg-midnight/40 border-lumen text-primary-muted'
              }`}>
                {status.message}
              </div>
            )}
          </div>
        )})}
      </div>
    </div>
  )
}
