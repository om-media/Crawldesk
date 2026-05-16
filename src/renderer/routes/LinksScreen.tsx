import { useState, useEffect } from 'react'
import ErrorBanner from '../components/ErrorBanner'
import { useResolvedCrawl } from '../hooks/use-resolved-crawl'


export default function LinksScreen() {
  const { activeCrawlId, resolvingCrawl, resolveError } = useResolvedCrawl()
  const [links, setLinks] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [filterInternal, setFilterInternal] = useState<boolean | null>(null)
  const [page, setPage] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const pageSize = 50

  useEffect(() => { loadLinks(); loadSummary() }, [activeCrawlId, filterInternal, page])

  async function loadLinks() {
    if (!activeCrawlId) return
    setLoading(true)
    setLoadError(null)
    try {
      const result = await window.crawldesk.links.list({ crawlId: activeCrawlId, page, pageSize, filters: filterInternal !== null ? { isInternal: filterInternal } : {} })
      const items = result?.items ?? (Array.isArray(result) ? result[0] ?? [] : [])
      setLinks(Array.isArray(items) ? items : [])
    } catch (e: any) { console.error('[Links] loadLinks error:', e); setLoadError(e?.message || 'Failed to load links') } finally { setLoading(false) }
  }

  async function loadSummary() {
    if (!activeCrawlId) return
    try { const s = await window.crawldesk.links.summarize(activeCrawlId); setSummary(s) } catch (e) { console.error('[Links] Failed to load summary:', e) }
  }

  async function retry() { setLoadError(null); loadLinks() }

  if (!activeCrawlId) return (
    <div className="rounded-xl border border-lumen bg-panel-dark p-6 shadow-lg py-16 text-center">
      <p className="text-lg font-semibold text-primary-muted">{resolvingCrawl ? 'Loading latest crawl...' : 'No links yet.'}</p>
      <p className="text-sm text-primary-muted mt-2">{resolveError || (resolvingCrawl ? 'Finding the most recent crawl with link data.' : 'Start a crawl to discover links.')}</p>
    </div>
  )

  if (loading && !loadError) return (
    <div className="flex items-center justify-center py-20"><div className="animate-spin h-8 w-8 border-2 border-teal-accent border-t-transparent rounded-full"></div></div>
  )

  const hasData = summary && Object.values(summary).some(v => v != null && v !== 0)

  return (
    <div>
      {loadError && (
        <ErrorBanner message={loadError} onRetry={retry} />
      )}
      {!hasData && !loadError ? (
        <div className="card py-12 text-center"><p className="text-primary-muted">No links found in this crawl.</p></div>
      ) : (
        <>
          <h1 className="text-[30px] leading-none tracking-tight font-bold text-primary-text mb-6">Links</h1>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="kpi-card">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-accent/15 text-teal-accent"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></span>
                <div>
                  <p className="text-xs text-primary-muted uppercase">Internal Links</p>
                  <p className="text-2xl font-bold text-primary-text">{summary?.totalInternal ?? '-'}</p>
                </div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald/15 text-emerald"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></span>
                <div>
                  <p className="text-xs text-primary-muted uppercase">External Links</p>
                  <p className="text-2xl font-bold text-primary-text">{summary?.totalExternal ?? '-'}</p>
                </div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-500"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span>
                <div>
                  <p className="text-xs text-primary-muted uppercase">Broken Links</p>
                  <p className="text-2xl font-bold text-red-500">{summary?.brokenCount ?? '-'}</p>
                </div>
              </div>
            </div>
          </div>
          {/* Filters + Export */}
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setFilterInternal(null)} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${filterInternal === null ? 'bg-teal-accent text-white' : 'text-primary-muted hover:text-primary-text'}`}>All</button>
            <button onClick={() => setFilterInternal(true)} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${filterInternal === true ? 'bg-teal-accent text-white' : 'text-primary-muted hover:text-primary-text'}`}>Internal</button>
            <button onClick={() => setFilterInternal(false)} className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${filterInternal === false ? 'bg-teal-accent text-white' : 'text-primary-muted hover:text-primary-text'}`}>External</button>
            <button onClick={async () => { if (activeCrawlId) await window.crawldesk.exports.exportLinks({ crawlId: activeCrawlId }) }} className="btn-primary ml-auto">Export CSV</button>
          </div>
          {/* Table */}
          <table className="w-full text-sm text-left border border-lumen rounded-lg bg-panel-dark overflow-hidden">
            <thead><tr className="border-b border-lumen"><th className="px-4 py-2 font-medium text-primary-muted">Source URL</th><th className="px-4 py-2 font-medium text-primary-muted">Target URL</th><th className="px-4 py-2 font-medium text-primary-muted w-32">Anchor Text</th><th className="px-4 py-2 font-medium text-primary-muted w-24">Type</th><th className="px-4 py-2 font-medium text-primary-muted w-20">Internal</th></tr></thead>
            <tbody>{links.map(l => (
              <tr key={l.id} className="border-b border-lumen hover:bg-[#0c1820]">
                <td className="px-4 py-2 max-w-xs truncate text-primary-text">{l.source_url}</td>
                <td className="px-4 py-2 max-w-xs truncate text-primary-text">{l.target_url}</td>
                <td className="px-4 py-2 max-w-xs truncate text-primary-text">{l.anchor_text || '-'}</td>
                <td className="px-4 py-2"><span className="pill-neutral text-xs">{l.link_type}</span></td>
                <td className="px-4 py-2">{l.is_internal ? <span className="pill-success text-xs">Yes</span> : <span className="pill-warning text-xs">No</span>}</td>
              </tr>
            ))}</tbody>
          </table>
          {/* Pagination */}
          {(summary?.totalLinks ?? 0) > pageSize && (
            <div className="flex items-center justify-between mt-4">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="btn-secondary !py-1.5 !px-3 text-xs">Previous</button>
              <span className="text-sm text-primary-muted">Page {page + 1} of {Math.ceil((summary?.totalLinks ?? 0) / pageSize)}</span>
              <button disabled={(page + 1) * pageSize >= (summary?.totalLinks ?? 0)} onClick={() => setPage(p => p + 1)} className="btn-secondary !py-1.5 !px-3 text-xs">Next</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
