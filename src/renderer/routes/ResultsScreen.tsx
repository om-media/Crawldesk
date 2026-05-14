import { useState, useEffect, useCallback } from 'react'
import { useProjectStore } from '../stores/project-store'
import type { UrlRecord } from '@shared/types/url'

declare global { interface Window { crawldesk: any } }

export default function ResultsScreen() {
  const { selectedProjectId, activeCrawlId } = useProjectStore()
  const [urls, setUrls] = useState<UrlRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const pageSize = 50
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filters, setFilters] = useState({ search: '', statusCategory: '' as '' | '2xx' | '3xx' | '4xx' | '5xx', indexability: '' as '' | 'indexable' | 'non_indexable' | 'unknown' })
  const [sortField, setSortField] = useState('url')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [selectedUrl, setSelectedUrl] = useState<UrlRecord | null>(null)
  const [drawerTab, setDrawerTab] = useState<'Details' | 'Inlinks' | 'Outlinks'>('Details')
  const [drawerInlinks, setDrawerInlinks] = useState<any[]>([])
  const [drawerOutlinks, setDrawerOutlinks] = useState<any[]>([])
  const [drawerLoading, setDrawerLoading] = useState(false)

  // Load inlinks/outlinks when a URL is selected and tab changes
  useEffect(() => {
    if (!selectedUrl || !activeCrawlId) {
      setDrawerInlinks([])
      setDrawerOutlinks([])
      return
    }
    if (drawerTab === 'Details') return // no need to load
    setDrawerLoading(true)
    const load = async () => {
      try {
        if (drawerTab === 'Inlinks') {
          const result = await window.crawldesk.links.list({ crawlId: activeCrawlId, page: 0, pageSize: 50, filters: { targetUrl: selectedUrl.url } })
          setDrawerInlinks((result.items || []).map((l: any) => ({
            source_url: l.source_url || l.sourceUrl || '',
            target_url: l.target_url || l.targetUrl || '',
            anchor_text: l.anchor_text || l.anchorText || '',
            link_type: l.link_relation || l.link_type || 'link',
            is_internal: l.is_internal ?? false,
          })))
        } else if (drawerTab === 'Outlinks') {
          const result = await window.crawldesk.links.list({ crawlId: activeCrawlId, page: 0, pageSize: 50, filters: { sourceUrl: selectedUrl.url } })
          setDrawerOutlinks((result.items || []).map((l: any) => ({
            source_url: l.source_url || l.sourceUrl || '',
            target_url: l.target_url || l.targetUrl || '',
            anchor_text: l.anchor_text || l.anchorText || '',
            link_type: l.link_relation || l.link_type || 'link',
            is_internal: l.is_internal ?? false,
          })))
        }
      } catch (e) {
        console.error('[Results] Failed to load links:', e)
      } finally {
        setDrawerLoading(false)
      }
    }
    load()
  }, [selectedUrl, drawerTab, activeCrawlId])

  // Reset tab when URL changes
  useEffect(() => {
    setDrawerTab('Details')
    setDrawerInlinks([])
    setDrawerOutlinks([])
  }, [selectedUrl?.id])

  const loadUrls = useCallback(async () => {
    if (!activeCrawlId || !selectedProjectId) return
    setLoading(true)
    setLoadError(null)
    try {
      const result = await window.crawldesk.urls.list({ projectId: selectedProjectId, crawlId: activeCrawlId, page, pageSize, sort: { field: sortField, direction: sortDir }, filters: Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== '')) })
      setUrls((result.items || []).map(normalizeUrlRecord))
      setTotal(result.total || 0)
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load URLs. Check connection and retry.')
    } finally { setLoading(false) }
  }, [activeCrawlId, selectedProjectId, page, pageSize, sortField, sortDir, filters])

  useEffect(() => { loadUrls() }, [loadUrls])

  function toggleSort(field: string) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  async function retry() { setLoadError(null); loadUrls() }

  function statusBadge(code?: number | null) {
    if (!code) return <span className="text-primary-muted bg-panel-dark rounded px-2 py-0.5 text-xs font-medium">N/A</span>
    if (code >= 200 && code < 300) return <span className="pill-success">{code}</span>
    if (code >= 300 && code < 400) return <span className="pill-warning">{code}</span>
    return <span className="pill-error">{code}</span>
  }

  async function exportCurrentView() {
    if (!activeCrawlId) return
    await window.crawldesk.exports.exportUrls({ crawlId: activeCrawlId, filtered: true, filters })
  }

  if (!activeCrawlId) return <div className="bg-panel-dark border border-lumen rounded-lg py-16 text-center"><p className="text-lg font-semibold text-primary-text">No results yet.</p><p className="text-sm text-primary-muted mt-2">Start a crawl to see your URLs here.</p></div>

  return (
    <div>
      <h1 className="text-[30px] font-bold text-primary-text tracking-tight mb-6">Results ({total} URLs)</h1>
      {loadError && (
        <div className="mb-4 rounded-xl p-3 bg-[#3b171b] border border-red-900 text-red-400 text-sm flex items-center justify-between">
          <span>⚠ {loadError}</span>
          <button onClick={retry} className="btn-secondary !py-1.5 !px-3 text-xs ml-4">Retry</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input value={filters.search} onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(0) }} placeholder="Search URL / title / meta..." className="!w-64 input-field" />
        <select value={filters.statusCategory} onChange={e => { setFilters(f => ({ ...f, statusCategory: e.target.value as any })); setPage(0) }} className="input-field !w-32">
          <option value="">All Status</option><option value="2xx">2xx</option><option value="3xx">3xx</option><option value="4xx">4xx</option><option value="5xx">5xx</option>
        </select>
        <select value={filters.indexability} onChange={e => { setFilters(f => ({ ...f, indexability: e.target.value as any })); setPage(0) }} className="input-field !w-36">
          <option value="">All Indexability</option><option value="indexable">Indexable</option><option value="non_indexable">Non-indexable</option><option value="unknown">Unknown</option>
        </select>
        <button onClick={exportCurrentView} className="btn-secondary ml-auto">Export CSV</button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-lumen rounded-lg bg-panel-dark">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead>
            <tr className="bg-midnight border-b border-row">
              {[['url', 'URL'], ['status_code', 'Status'], ['indexability', 'Indexability'], ['title', 'Title'], ['depth', 'Depth'], ['response_time_ms', 'Response']].map(([field, label]) => (
                <th key={field} className="px-4 py-2.5 font-medium text-primary-muted cursor-pointer hover:bg-[#112a38]" onClick={() => toggleSort(field)}>
                  {label} {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-primary-muted"><div className="animate-spin h-5 w-5 border-2 border-teal-accent border-t-transparent rounded-full mx-auto"></div></td></tr>}
            {!loading && urls.map(u => (
              <tr key={u.id} className="border-b border-row hover:bg-[#0f1f2a] cursor-pointer transition-colors" onClick={() => setSelectedUrl(u)}>
                <td className="px-4 py-2 max-w-xs truncate text-primary-text">{u.url}</td>
                <td className="px-4 py-2">{statusBadge(u.status_code)}</td>
                <td className="px-4 py-2"><span className={`pill ${u.indexability === 'indexable' ? 'pill-success' : u.indexability === 'non_indexable' ? 'pill-error' : ''}`}>{u.indexability || 'unknown'}</span></td>
                <td className="px-4 py-2 max-w-xs truncate text-primary-text">{u.title || '-'}</td>
                <td className="px-4 py-2 text-primary-text">{u.depth}</td>
                <td className="px-4 py-2 text-primary-text">{u.response_time_ms ?? '-'}ms</td>
              </tr>
            ))}
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
          <div className="w-full max-w-lg bg-panel-dark h-full overflow-y-auto shadow-xl border-l border-lumen" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-panel-dark border-b border-lumen px-6 py-4 flex items-start justify-between">
              <h2 className="text-lg font-semibold text-primary-text break-all pr-2 leading-tight">{selectedUrl.url}</h2>
              <button onClick={() => setSelectedUrl(null)} className="text-primary-muted hover:text-primary-text text-xl leading-none ml-2 shrink-0">&times;</button>
            </div>

            {/* Detail tabs */}
            <div className="px-6 pt-3">
              <div className="flex gap-1 mb-4 border-b border-luen">
                {(['Details', 'Inlinks', 'Outlinks'] as const).map(tab => (
                  <button key={tab} onClick={() => setDrawerTab(tab)} className={`px-3 py-2 text-sm font-medium transition-colors border-b-2 ${drawerTab === tab ? 'text-teal-accent border-teal-accent' : 'text-primary-muted border-transparent hover:text-primary-text'}`}>{tab}</button>
                ))}
              </div>
            </div>

            <div className="px-6 pb-6">
              {drawerTab === 'Details' && (
                <dl className="space-y-3 text-sm">
                  <div className="border-b border-row pb-2"><dt className="text-xs text-primary-muted uppercase tracking-wider">Status</dt><dd className="font-medium mt-0.5">{statusBadge(selectedUrl.status_code)}</dd></div>
                  {[['Indexability', selectedUrl.indexability || 'unknown'], ['Title', selectedUrl.title || '-'], ['Meta Description', selectedUrl.meta_description || '-'], ['H1', selectedUrl.h1 || '-'], ['Canonical', selectedUrl.canonical || '-'], ['Word Count', selectedUrl.word_count ? String(selectedUrl.word_count) : '-'], ['Depth', String(selectedUrl.depth)], ['Response Time', `${selectedUrl.response_time_ms ?? '-'}ms`], ['Content Type', selectedUrl.content_type || '-'], ['Content Length', selectedUrl.content_length ? `${(selectedUrl.content_length / 1024).toFixed(1)} KB` : '-']].map(([label, value]) => (
                    <div key={String(label)} className="border-b border-row pb-2"><dt className="text-xs text-primary-muted uppercase tracking-wider">{label}</dt><dd className="font-medium mt-0.5 break-all text-primary-text">{value}</dd></div>
                  ))}
                </dl>
              )}

              {drawerTab === 'Inlinks' && (
                <div>
                  {(drawerInlinks.length === 0 && !drawerLoading) && <p className="text-sm text-primary-muted py-4">No inlinks found for this URL.</p>}
                  {drawerInlinks.map((link, i) => (
                    <div key={i} className="flex items-center gap-2 py-2 border-b border-row text-xs">
                      <span className="pill-success shrink-0">{link.link_type || 'link'}</span>
                      <span className="text-teal-text truncate font-mono">{link.source_url}</span>
                      {link.anchor_text && <span className="text-primary-muted truncate max-w-[120px]">"{link.anchor_text}"</span>}
                    </div>
                  ))}
                  {drawerLoading && <div className="py-4 text-center"><div className="animate-spin h-5 w-5 border-2 border-teal-accent border-t-transparent rounded-full mx-auto"></div></div>}
                </div>
              )}

              {drawerTab === 'Outlinks' && (
                <div>
                  {(drawerOutlinks.length === 0 && !drawerLoading) && <p className="text-sm text-primary-muted py-4">No outlinks found for this URL.</p>}
                  {drawerOutlinks.map((link, i) => (
                    <div key={i} className="flex items-center gap-2 py-2 border-b border-row text-xs">
                      <span className={`${link.is_internal ? 'pill-success' : 'pill-warning'} shrink-0`}>{link.is_internal ? 'internal' : 'external'}</span>
                      <span className="text-teal-text truncate font-mono">{link.target_url}</span>
                      {link.anchor_text && <span className="text-primary-muted truncate max-w-[120px]">"{link.anchor_text}"</span>}
                    </div>
                  ))}
                  {drawerLoading && <div className="py-4 text-center"><div className="animate-spin h-5 w-5 border-2 border-teal-accent border-t-transparent rounded-full mx-auto"></div></div>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function parseJson(value: unknown) {
  if (typeof value !== 'string') return null
  try { return JSON.parse(value) } catch { return null }
}

function normalizeUrlRecord(record: any): UrlRecord {
  const fetch = parseJson(record.fetchResultJson ?? record.fetch_result_json) ?? {}
  const seo = parseJson(record.seoDataJson ?? record.seo_data_json) ?? {}
  return {
    ...record,
    id: String(record.id),
    crawl_id: String(record.crawlId ?? record.crawl_id ?? ''),
    status_code: fetch.statusCode ?? fetch.status_code ?? null,
    content_type: fetch.contentType ?? fetch.content_type ?? null,
    content_length: fetch.contentLength ?? fetch.content_length ?? null,
    response_time_ms: fetch.responseTimeMs ?? fetch.response_time_ms ?? null,
    final_url: fetch.finalUrl ?? fetch.final_url ?? null,
    title: seo.title ?? null,
    meta_description: seo.metaDescription ?? seo.meta_description ?? null,
    h1: seo.h1Text ?? seo.h1_text ?? null,
    canonical: seo.canonicalUrl ?? seo.canonical_url ?? null,
    robots_meta: seo.robotsMeta ?? seo.robots_meta ?? null,
    word_count: seo.wordCount ?? seo.word_count ?? null,
    depth: record.depth ?? 0,
    is_internal: record.isInternal ?? record.is_internal ?? false,
    is_crawlable: record.isCrawlable ?? record.is_crawlable ?? (record.indexability === 'indexable'),
    normalized_url: record.url,
    created_at: record.discoveredAt ?? record.discovered_at ?? '',
    updated_at: record.fetchedAt ?? record.fetched_at ?? '',
  }
}
