import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useProjectStore } from '../stores/project-store'
import ErrorBanner from '../components/ErrorBanner'
import type { UrlRecord } from '@shared/types/url'


// ── Types ───────────────────────────────────────────────────────────

interface UrlFilters {
  search: string
  statusCategory: '' | '2xx' | '3xx' | '4xx' | '5xx'
  indexability: '' | 'indexable' | 'non_indexable' | 'unknown'
}

type SortDir = 'asc' | 'desc'

// ── Helpers ──────────────────────────────────────────────────────────

function parseJson(value: unknown) {
  if (typeof value !== 'string') return null
  try { return JSON.parse(value) } catch { return null }
}

function normalizeUrlRecord(record: any): UrlRecord {
  // Prefer dedicated columns (populated by Rust backend via serde camelCase)
  // Fall back to JSON blobs only for fields not yet in dedicated columns
  const fetch = parseJson(record.fetchResultJson ?? record.fetch_result_json) ?? {}
  const seo = parseJson(record.seoDataJson ?? record.seo_data_json) ?? {}
  return {
    ...record,
    id: String(record.id),
    crawl_id: String(record.crawlId ?? record.crawl_id ?? ''),
    // Dedicated columns take priority over JSON blobs
    normalized_url: record.normalizedUrl ?? record.normalized_url ?? record.url ?? '',
    final_url: record.finalUrl ?? record.final_url ?? fetch.finalUrl ?? fetch.final_url ?? null,
    status_code: record.statusCode ?? record.status_code ?? fetch.statusCode ?? fetch.status_code ?? null,
    content_type: record.contentType ?? record.content_type ?? fetch.contentType ?? fetch.content_type ?? null,
    content_length: record.sizeBytes ?? record.size_bytes ?? record.contentLength ?? record.content_length ?? fetch.contentLength ?? fetch.content_length ?? null,
    response_time_ms: record.responseTimeMs ?? record.response_time_ms ?? fetch.responseTimeMs ?? fetch.response_time_ms ?? null,
    title: record.title ?? seo.title ?? null,
    title_length: record.titleLength ?? record.title_length ?? seo.titleLength ?? seo.title_length ?? null,
    meta_description: record.metaDescription ?? record.meta_description ?? seo.metaDescription ?? seo.meta_description ?? null,
    meta_description_length: record.metaDescriptionLength ?? record.meta_description_length ?? seo.metaDescriptionLength ?? seo.meta_description_length ?? null,
    h1: record.h1 ?? seo.h1Text ?? seo.h1_text ?? seo.h1 ?? null,
    h1_count: record.h1Count ?? record.h1_count ?? seo.h1Count ?? seo.h1_count ?? null,
    canonical: record.canonicalUrl ?? record.canonical_url ?? seo.canonicalUrl ?? seo.canonical_url ?? null,
    robots_meta: record.metaRobots ?? record.meta_robots ?? seo.robotsMeta ?? seo.robots_meta ?? null,
    word_count: record.wordCount ?? record.word_count ?? seo.wordCount ?? seo.word_count ?? null,
    size_bytes: record.sizeBytes ?? record.size_bytes ?? null,
    language: record.language ?? null,
    inlinks_count: record.inlinksCount ?? record.inlinks_count ?? null,
    outlinks_count: record.outlinksCount ?? record.outlinks_count ?? null,
    indexability: record.indexability || 'unknown',
    depth: record.depth ?? 0,
    is_internal: record.isInternal ?? record.is_internal ?? false,
    is_crawlable: record.isCrawlable ?? record.is_crawlable ?? (record.indexability === 'indexable'),
    created_at: record.discoveredAt ?? record.discovered_at ?? '',
    updated_at: record.fetchedAt ?? record.fetched_at ?? '',
  }
}

function statusBadge(code?: number | null) {
  if (!code) return <span className="text-primary-muted bg-panel-dark rounded px-2 py-0.5 text-xs font-medium">N/A</span>
  if (code >= 200 && code < 300) return <span className="pill-success">{code}</span>
  if (code >= 300 && code < 400) return <span className="pill-warning">{code}</span>
  return <span className="pill-error">{code}</span>
}

// ── Constants ────────────────────────────────────────────────────────

const PAGE_SIZE = 100
const DEBOUNCE_MS = 300

const COLUMNS: { key: keyof UrlRecord | string; label: string; sortable: boolean; width: string }[] = [
  { key: 'url', label: 'URL', sortable: true, width: 'minmax(200px, 1fr)' },
  { key: 'status_code', label: 'Status', sortable: true, width: '80px' },
  { key: 'indexability', label: 'Indexability', sortable: true, width: '110px' },
  { key: 'title', label: 'Title', sortable: true, width: 'minmax(120px, 200px)' },
  { key: 'depth', label: 'Depth', sortable: true, width: '60px' },
  { key: 'response_time_ms', label: 'Resp.', sortable: true, width: '70px' },
]

// ── Component ────────────────────────────────────────────────────────

export default function ResultsScreen() {
  const { selectedProjectId, activeCrawlId } = useProjectStore()
  const [urls, setUrls] = useState<UrlRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filters, setFilters] = useState<UrlFilters>({ search: '', statusCategory: '', indexability: '' })
  const [sortField, setSortField] = useState<string>('url')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [selectedUrl, setSelectedUrl] = useState<UrlRecord | null>(null)
  const [drawerTab, setDrawerTab] = useState<'Details' | 'Inlinks' | 'Outlinks'>('Details')
  const [drawerInlinks, setDrawerInlinks] = useState<any[]>([])
  const [drawerOutlinks, setDrawerOutlinks] = useState<any[]>([])
  const [drawerLoading, setDrawerLoading] = useState(false)

  // Debounced search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [searchInput, setSearchInput] = useState('')

  // Virtual scroll refs
  const tableBodyRef = useRef<HTMLDivElement>(null)
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 })
  const ROW_HEIGHT = 36

  // Total pages
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // ── URL fetching ──────────────────────────────────

  const loadUrls = useCallback(async () => {
    if (!activeCrawlId || !selectedProjectId) return
    setLoading(true)
    setLoadError(null)
    try {
      const result = await window.crawldesk.urls.list({
        projectId: selectedProjectId,
        crawlId: activeCrawlId,
        page,
        pageSize: PAGE_SIZE,
        sort: { field: sortField, direction: sortDir },
        filters: Object.fromEntries(
          Object.entries(filters).filter(([_, v]) => v !== '')
        ),
      })
      const items = (result.items || []).map(normalizeUrlRecord)
      setUrls(items)
      setTotal(result.total || 0)
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load URLs. Check connection and retry.')
    } finally {
      setLoading(false)
    }
  }, [activeCrawlId, selectedProjectId, page, sortField, sortDir, filters])

  useEffect(() => { loadUrls() }, [loadUrls])

  // Reset page when filters change
  useEffect(() => { setPage(0) }, [filters])

  // ── Drawer: inlinks/outlinks ──────────────────────

  useEffect(() => {
    if (!selectedUrl || !activeCrawlId) {
      setDrawerInlinks([])
      setDrawerOutlinks([])
      return
    }
    if (drawerTab === 'Details') return
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

  // Reset tab on URL change
  useEffect(() => {
    setDrawerTab('Details')
    setDrawerInlinks([])
    setDrawerOutlinks([])
  }, [selectedUrl?.id])

  // ── Virtual scroll ────────────────────────────────

  useEffect(() => {
    const el = tableBodyRef.current
    if (!el) return
    const handleScroll = () => {
      const scrollTop = el.scrollTop
      const viewportHeight = el.clientHeight
      const start = Math.floor(scrollTop / ROW_HEIGHT)
      const end = Math.min(start + Math.ceil(viewportHeight / ROW_HEIGHT) + 5, urls.length)
      setVisibleRange({ start: Math.max(0, start - 2), end })
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => el.removeEventListener('scroll', handleScroll)
  }, [urls.length])

  // ── Handlers ──────────────────────────────────────

  function toggleSort(field: string) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  function handleSearchChange(value: string) {
    setSearchInput(value)
    if (searchTimer.current !== null) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setFilters(f => ({ ...f, search: value }))
    }, DEBOUNCE_MS)
  }

  async function retry() { setLoadError(null); loadUrls() }

  async function exportCurrentView() {
    if (!activeCrawlId) return
    await window.crawldesk.exports.exportUrls({ crawlId: activeCrawlId, filtered: true, filters })
  }

  // ── Render ────────────────────────────────────────

  if (!activeCrawlId) return (
    <div className="bg-panel-dark border border-lumen rounded-lg py-16 text-center">
      <p className="text-lg font-semibold text-primary-text">No results yet.</p>
      <p className="text-sm text-primary-muted mt-2">Start a crawl to see your URLs here.</p>
    </div>
  )

  const virtualRows = useMemo(() => {
    return urls.slice(visibleRange.start, visibleRange.end)
  }, [urls, visibleRange])

  return (
    <div className="flex flex-col h-full">
      <h1 className="text-[30px] font-bold text-primary-text tracking-tight mb-4">Results ({total.toLocaleString()} URLs)</h1>

      {loadError && (
        <ErrorBanner message={loadError} onRetry={retry} />
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          value={searchInput}
          onChange={e => handleSearchChange(e.target.value)}
          placeholder="Search URL / title / meta..."
          className="!w-64 input-field"
          type="text"
        />
        <select
          value={filters.statusCategory}
          onChange={e => { setFilters(f => ({ ...f, statusCategory: e.target.value as any })); setPage(0) }}
          className="input-field !w-32"
        >
          <option value="">All Status</option>
          <option value="2xx">2xx</option>
          <option value="3xx">3xx</option>
          <option value="4xx">4xx</option>
          <option value="5xx">5xx</option>
        </select>
        <select
          value={filters.indexability}
          onChange={e => { setFilters(f => ({ ...f, indexability: e.target.value as any })); setPage(0) }}
          className="input-field !w-36"
        >
          <option value="">All Indexability</option>
          <option value="indexable">Indexable</option>
          <option value="non_indexable">Non-indexable</option>
          <option value="unknown">Unknown</option>
        </select>
        <button onClick={exportCurrentView} className="btn-secondary ml-auto">Export CSV</button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden border border-lumen rounded-lg bg-panel-dark flex flex-col min-h-0">
        {/* Header */}
        <div className="flex items-center bg-midnight border-b border-row shrink-0" style={{ height: ROW_HEIGHT }}>
          {COLUMNS.map(col => (
            <div
              key={col.key}
              className={`px-4 py-2 text-xs font-medium text-primary-muted select-none ${col.sortable ? 'cursor-pointer hover:bg-[#112a38]' : ''}`}
              style={{ width: col.width, minWidth: col.width, maxWidth: col.width === 'minmax(200px, 1fr)' ? undefined : col.width, flex: col.width.includes('minmax') ? 1 : undefined }}
              onClick={col.sortable ? () => toggleSort(col.key) : undefined}
            >
              {col.label}
              {col.sortable && sortField === col.key && (
                <span className="ml-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
              )}
            </div>
          ))}
        </div>

        {/* Virtual-scrolled body */}
        <div
          ref={tableBodyRef}
          className="flex-1 overflow-y-auto overflow-x-auto relative"
          style={{ contain: 'strict' }}
        >
          {loading && urls.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin h-6 w-6 border-2 border-teal-accent border-t-transparent rounded-full"></div>
            </div>
          ) : (
            <div style={{ height: urls.length * ROW_HEIGHT, position: 'relative' }}>
              {virtualRows.map((u) => {
                const idx = visibleRange.start + virtualRows.indexOf(u)
                const top = idx * ROW_HEIGHT
                return (
                  <button
                    type="button"
                    key={u.id}
                    className="absolute left-0 right-0 flex items-center border-b border-row hover:bg-[#0f1f2a] focus:bg-[#0f1f2a] focus:outline-none focus-visible:ring-1 focus-visible:ring-teal-accent cursor-pointer transition-colors text-left"
                    style={{ top, height: ROW_HEIGHT }}
                    onClick={() => setSelectedUrl(u)}
                    aria-label={`Open URL details for ${u.url}`}
                  >
                    <div className="px-4 truncate text-primary-text text-sm" style={{ flex: 1, minWidth: 200 }}>
                      {u.url}
                    </div>
                    <div className="px-4 text-sm" style={{ width: 80, minWidth: 80 }}>{statusBadge(u.status_code)}</div>
                    <div className="px-4 text-sm" style={{ width: 110, minWidth: 110 }}>
                      <span className={`pill ${u.indexability === 'indexable' ? 'pill-success' : u.indexability === 'non_indexable' ? 'pill-error' : ''}`}>
                        {u.indexability || 'unknown'}
                      </span>
                    </div>
                    <div className="px-4 truncate text-primary-muted text-sm" style={{ width: 200, minWidth: 120, flex: 1 }}>
                      {u.title || '-'}
                    </div>
                    <div className="px-4 text-primary-text text-sm" style={{ width: 60, minWidth: 60, textAlign: 'right' }}>{u.depth}</div>
                    <div className="px-4 text-primary-muted text-sm" style={{ width: 70, minWidth: 70, textAlign: 'right' }}>
                      {u.response_time_ms != null ? `${u.response_time_ms}ms` : '-'}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-3 gap-2">
          <button
            disabled={page === 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}
            className="btn-secondary !py-1.5 !px-3 text-xs"
          >
            Previous
          </button>
          <div className="flex items-center gap-1 text-sm text-primary-muted">
            <span>Page</span>
            <input
              type="text"
              inputMode="numeric"
              className="input-field !w-12 !py-1 text-center text-sm"
              value={page + 1}
              onChange={e => {
                const val = parseInt(e.target.value, 10)
                if (!isNaN(val) && val >= 1 && val <= totalPages) {
                  setPage(val - 1)
                }
              }}
            />
            <span>of {totalPages}</span>
            <span className="mx-2">|</span>
            <span>{total.toLocaleString()} URLs</span>
          </div>
          <button
            disabled={page + 1 >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="btn-secondary !py-1.5 !px-3 text-xs"
          >
            Next
          </button>
        </div>
      )}

      {/* URL Detail Drawer */}
      {selectedUrl && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex justify-end" onClick={() => setSelectedUrl(null)}>
          <div className="w-full max-w-lg bg-panel-dark h-full overflow-y-auto shadow-xl border-l border-lumen" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-panel-dark border-b border-lumen px-6 py-4 flex items-start justify-between">
              <h2 className="text-lg font-semibold text-primary-text break-all pr-2 leading-tight">{selectedUrl.url}</h2>
              <button onClick={() => setSelectedUrl(null)} className="text-primary-muted hover:text-primary-text text-xl leading-none ml-2 shrink-0">&times;</button>
            </div>

            {/* Detail tabs */}
            <div className="px-6 pt-3">
              <div className="flex gap-1 mb-4 border-b border-lumen">
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
                      {link.anchor_text && <span className="text-primary-muted truncate max-w-[120px]">&ldquo;{link.anchor_text}&rdquo;</span>}
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
                      {link.anchor_text && <span className="text-primary-muted truncate max-w-[120px]">&ldquo;{link.anchor_text}&rdquo;</span>}
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
