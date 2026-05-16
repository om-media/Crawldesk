import { useState, useEffect, useCallback } from 'react'
import { useResolvedCrawl } from '../hooks/use-resolved-crawl'
import type { UrlRecord } from '@shared/types/url'


type StatusCodeFilter = '' | '403' | '404' | '410' | 'other'

function normalizeUrl(record: any): UrlRecord {
  return {
    ...record,
    id: String(record.id),
    crawl_id: String(record.crawlId ?? record.crawl_id ?? ''),
    status_code: record.statusCode ?? record.status_code ?? null,
    content_type: record.contentType ?? record.content_type ?? null,
    title: record.title ?? null,
    indexability: record.indexability ?? 'unknown',
    inlinks_count: record.inlinksCount ?? record.inlinks_count ?? record.inlink_count ?? null,
    inlink_count: record.inlink_count ?? record.inlinksCount ?? record.inlinks_count ?? null,
  }
}

export default function ClientErrorsScreen() {
  const { activeCrawlId, resolvingCrawl, resolveError } = useResolvedCrawl()
  const [urls, setUrls] = useState<UrlRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const pageSize = 50
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusCodeFilter>('')
  const [sortByPriority, setSortByPriority] = useState(true)
  const [selectedUrl, setSelectedUrl] = useState<UrlRecord | null>(null)

  const loadUrls = useCallback(async () => {
    if (!activeCrawlId) return
    setLoading(true)
    setLoadError(null)
    try {
      const filters: Record<string, unknown> = { statusCategory: '4xx' }
      if (statusFilter === 'other') filters.excludedStatusCodes = [403, 404, 410]
      else if (statusFilter) filters.statusCode = Number(statusFilter)

      const sortField = sortByPriority ? 'inlinks_count' : 'url'
      const result = await window.crawldesk.urls.list({
        crawlId: activeCrawlId,
        page,
        pageSize,
        sort: { field: sortField, direction: 'desc' },
        filters
      })
      setUrls((result.items || []).map(normalizeUrl))
      setTotal(result.total || 0)
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load URLs.')
    } finally { setLoading(false) }
  }, [activeCrawlId, page, pageSize, sortByPriority, statusFilter])

  useEffect(() => { loadUrls() }, [loadUrls])

  async function exportCurrentView() {
    if (!activeCrawlId) return
    let f: Record<string, unknown> = { statusCategory: '4xx' }
    if (statusFilter && statusFilter !== 'other') f.statusCode = Number(statusFilter)
    if (statusFilter === 'other') f.excludedStatusCodes = [403, 404, 410]
    await window.crawldesk.exports.exportUrls({ crawlId: activeCrawlId, filtered: true, filters: f })
  }

  function priorityLabel(inlinks?: number | null): { label: string; className: string } {
    const count = inlinks ?? 0
    if (count >= 5) return { label: 'High', className: 'pill-error' }
    if (count >= 1) return { label: 'Medium', className: 'pill-warning' }
    return { label: 'Low', className: '' }
  }

  if (!activeCrawlId) return <div className="bg-panel-dark border border-lumen rounded-lg py-16 text-center"><p className="text-lg font-semibold text-primary-text">{resolvingCrawl ? 'Loading latest crawl...' : 'No results yet.'}</p><p className="text-sm text-primary-muted mt-2">{resolveError || (resolvingCrawl ? 'Finding the most recent crawl with client errors.' : 'Start a crawl to see client errors here.')}</p></div>

  // Filter tabs
  const tabs: { key: StatusCodeFilter; label: string }[] = [
    { key: '', label: `All (${total})` },
    { key: '403', label: '403 Forbidden' },
    { key: '404', label: '404 Not Found' },
    { key: '410', label: '410 Gone' },
    { key: 'other', label: 'Other 4xx' },
  ]

  return (
    <div>
      <h1 className="text-[30px] font-bold text-primary-text tracking-tight mb-2">Client Errors</h1>
      <p className="text-sm text-primary-muted mb-6">Pages returning 4xx status codes — sorted by priority based on inlink count.</p>

      {loadError && (
        <div className="mb-4 rounded-xl p-3 bg-[#3b171b] border border-red-900 text-red-400 text-sm flex items-center justify-between">
          <span>{loadError}</span>
          <button onClick={loadUrls} className="btn-secondary !py-1.5 !px-3 text-xs ml-4">Retry</button>
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => { setStatusFilter(tab.key); setPage(0) }} className={`!px-4 !py-1.5 rounded-full text-sm transition-colors ${statusFilter === tab.key ? 'bg-teal-bg border border-lumen text-teal-accent' : 'bg-panel-dark text-primary-muted hover:text-primary-text'}`}>
            {tab.label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-primary-muted cursor-pointer select-none">
          <input type="checkbox" checked={sortByPriority} onChange={e => setSortByPriority(e.target.checked)} className="accent-teal-accent" />
          Sort by priority
        </label>
        <button onClick={exportCurrentView} className="btn-secondary !py-1.5 !px-3 text-xs">Export CSV</button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-lumen rounded-lg bg-panel-dark">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead>
            <tr className="bg-midnight border-b border-row">
              <th className="px-4 py-2.5 font-medium text-primary-muted">URL</th>
              <th className="px-4 py-2.5 font-medium text-primary-muted">Status</th>
              <th className="px-4 py-2.5 font-medium text-primary-muted">Inlinks</th>
              <th className="px-4 py-2.5 font-medium text-primary-muted">Priority</th>
              <th className="px-4 py-2.5 font-medium text-primary-muted">Content Type</th>
              <th className="px-4 py-2.5 font-medium text-primary-muted">Title</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-primary-muted"><div className="animate-spin h-5 w-5 border-2 border-teal-accent border-t-transparent rounded-full mx-auto"></div></td></tr>}
            {!loading && urls.length === 0 && !loadError && <tr><td colSpan={6} className="px-4 py-8 text-center text-primary-muted">No client errors found.</td></tr>}
            {!loading && urls.map(u => {
              const inlinks = u.inlinks_count ?? u.inlink_count
              const p = priorityLabel(inlinks)
              return (
                <tr key={u.id} className="border-b border-row hover:bg-[#0f1f2a] cursor-pointer transition-colors" onClick={() => setSelectedUrl(u)}>
                  <td className="px-4 py-2 max-w-xs truncate text-primary-text">{u.url}</td>
                  <td className="px-4 py-2"><span className="pill-error">{u.status_code}</span></td>
                  <td className="px-4 py-2 text-primary-text">{inlinks ?? 0}</td>
                  <td className="px-4 py-2"><span className={`${p.className || 'text-primary-muted'} font-medium`}>{p.label}</span></td>
                  <td className="px-4 py-2 text-primary-muted">{u.content_type || '-'}</td>
                  <td className="px-4 py-2 max-w-xs truncate text-primary-text">{u.title || '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between mt-4">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="btn-secondary !py-1.5 !px-3 text-xs">Previous</button>
          <span className="text-sm text-primary-muted">Page {page + 1} of {Math.ceil(total / pageSize)}</span>
          <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)} className="btn-secondary !py-1.5 !px-3 text-xs">Next</button>
        </div>
      )}

      {/* URL Detail Drawer */}
      {selectedUrl && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-end" onClick={() => setSelectedUrl(null)}>
          <div className="w-full max-w-md bg-panel-dark h-full overflow-y-auto shadow-xl border-l border-lumen p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4"><h2 className="text-lg font-semibold text-primary-text break-all pr-2">{selectedUrl.url}</h2><button onClick={() => setSelectedUrl(null)} className="text-primary-muted hover:text-primary-text text-xl leading-none">&times;</button></div>
            <dl className="space-y-3 text-sm">
              <div className="border-b border-row pb-2"><dt className="text-xs text-primary-muted uppercase tracking-wider">Status</dt><dd className="font-medium mt-0.5"><span className="pill-error">{selectedUrl.status_code}</span></dd></div>
              {[['Inlinks', String(selectedUrl.inlinks_count ?? selectedUrl.inlink_count ?? 0)], ['Priority', priorityLabel(selectedUrl.inlinks_count ?? selectedUrl.inlink_count).label], ['Indexability', selectedUrl.indexability || 'unknown'], ['Title', selectedUrl.title || '-'], ['Content Type', selectedUrl.content_type || '-']].map(([label, value]) => (
                <div key={String(label)} className="border-b border-row pb-2"><dt className="text-xs text-primary-muted uppercase tracking-wider">{label}</dt><dd className="font-medium mt-0.5 text-primary-text">{typeof value === 'string' ? value : null}</dd></div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  )
}
