import { useState, useEffect } from 'react'
import ErrorBanner from '../components/ErrorBanner'
import { useResolvedCrawl } from '../hooks/use-resolved-crawl'


interface PsiRow {
  id: string; url: string; strategy: string
  performance_score: number | null; accessibility_score: number | null
  best_practices_score: number | null; seo_score: number | null
  lcp_ms: number | null; fid_ms: number | null; cls: number | null
  fcp_ms: number | null; ttfb_ms: number | null; speed_index: number | null
  size_bytes?: number | null; sizeBytes?: number | null
  carbon_footprint_grams?: number | null; carbonFootprintGrams?: number | null
  fetched_at: string
}

interface PsiSummary {
  avgPerformance: number | null; avgAccessibility: number | null
  avgBestPractices: number | null; avgSeo: number | null
  avgLcpMs: number | null; avgCls: number | null; avgTtfbMs?: number | null; avgSizeBytes?: number | null
  avgCarbonGrams?: number | null; totalCarbonGrams?: number | null
  totalUrlsWithPsi: number
  slowPages?: number
  largePages?: number
}

function scoreColor(score: number): string {
  if (score >= 90) return 'text-green-400'
  if (score >= 50) return 'text-yellow-400'
  return 'text-red-400'
}

function cwvStatus(value: number | null, thresholdGood: number, thresholdPoor: number, lowerIsBetter = true): string {
  if (value == null) return ''
  const good = lowerIsBetter ? value <= thresholdGood : value >= thresholdGood
  const poor = lowerIsBetter ? value > thresholdPoor : value < thresholdPoor
  if (good) return 'text-green-400'
  if (poor) return 'text-red-400'
  return 'text-yellow-400'
}

export default function PerformanceScreen() {
  const { activeCrawlId, resolvingCrawl, resolveError } = useResolvedCrawl()
  const [results, setResults] = useState<PsiRow[]>([])
  const [summary, setSummary] = useState<PsiSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [filterText, setFilterText] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'slow' | 'large'>('all')
  const [sortMode, setSortMode] = useState<'slowest' | 'largest' | 'worstScore' | 'url'>('slowest')
  const [exporting, setExporting] = useState(false)
  const [exportStatus, setExportStatus] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { loadData() }, [activeCrawlId])

  async function loadData() {
    if (!activeCrawlId) return
    setLoading(true)
    setError('')
    try {
      const [rows, summ] = await Promise.all([
        window.crawldesk.psi.listByCrawl(activeCrawlId),
        window.crawldesk.psi.summarize(activeCrawlId),
      ])
      setResults((rows || []).map(normalizePerformanceRow))
      setSummary(summ || null)
    } catch (e: any) {
      console.error('[Performance] Failed to load:', e)
      setError(e?.message || 'Failed to load performance data')
      setResults([])
      setSummary(null)
    }
    finally { setLoading(false) }
  }

  const filtered = results
    .filter(r => !filterText || r.url.toLowerCase().includes(filterText.toLowerCase()))
    .filter(r => {
      if (filterMode === 'slow') return Number(r.ttfb_ms ?? 0) > 1000
      if (filterMode === 'large') return Number(r.size_bytes ?? r.sizeBytes ?? 0) > 1_000_000
      return true
    })
    .sort((a, b) => sortPerformanceRows(a, b, sortMode))

  async function exportPerformance() {
    if (!activeCrawlId) return
    setError('')
    setExportStatus('')
    setExporting(true)
    try {
      const result = await window.crawldesk.exports.exportPerformance({
        crawlId: activeCrawlId,
        filters: { mode: filterMode, search: filterText },
        sort: { mode: sortMode },
      })
      setExportStatus(`Exported ${result.rowCount} performance rows to ${result.filePath}`)
    } catch (e: any) {
      console.error('[Performance] Export failed:', e)
      setError(e?.message || 'Failed to export performance rows')
    } finally {
      setExporting(false)
    }
  }

  if (!activeCrawlId) return (
    <div className="card py-16 text-center">
      <p className="text-lg font-semibold text-primary-muted">{resolvingCrawl ? 'Loading latest crawl...' : 'No performance data yet.'}</p>
      <p className="text-sm text-primary-muted mt-2">{resolveError || (resolvingCrawl ? 'Finding the most recent crawl with performance data.' : 'Run a crawl first to collect response timing and page size metrics.')}</p>
    </div>
  )

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[30px] leading-none tracking-tight font-bold text-primary-text">Performance</h1>
          <p className="mt-2 text-sm text-primary-muted">Response timing, payload size, and estimated page weight impact for crawled URLs.</p>
        </div>
        <button type="button" onClick={loadData} className="btn-secondary text-sm" disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      {error && <ErrorBanner message={error} onRetry={loadData} />}
      {exportStatus && <div className="mb-4 text-sm text-emerald bg-emerald/10 border border-emerald/30 rounded px-3 py-2">{exportStatus}</div>}

      {/* Summary cards */}
      {summary && summary.totalUrlsWithPsi > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Performance', value: summary.avgPerformance },
            { label: 'Accessibility', value: summary.avgAccessibility },
            { label: 'Avg TTFB', value: summary.avgTtfbMs != null ? Math.round(summary.avgTtfbMs) : null },
            { label: 'Est. CO2', value: summary.totalCarbonGrams ?? null },
          ].map(c => (
            <div key={c.label} className="kpi-card">
              <p className="text-xs text-primary-muted uppercase">{c.label}</p>
              <p className={`text-2xl font-bold ${c.label === 'Avg TTFB' && typeof c.value === 'number' ? cwvStatus(c.value, 500, 1000) : c.label === 'Est. CO2' ? 'text-teal-accent' : scoreColor(c.value ?? 0)}`}>
                {c.value != null ? (c.label === 'Avg TTFB' ? `${c.value}ms` : c.label === 'Est. CO2' ? formatCarbon(c.value) : c.value) : '—'}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* CWV averages */}
      {summary && summary.totalUrlsWithPsi > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="card p-4 flex items-center gap-3">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-accent/15 text-teal-accent text-sm font-bold">L</span>
            <div>
              <p className="text-xs text-primary-muted uppercase">Avg LCP</p>
              <p className={`text-lg font-bold ${cwvStatus(summary.avgLcpMs, 2500, 4000)}`}>
                {summary.avgLcpMs != null ? `${Math.round(summary.avgLcpMs)}ms` : '—'}
              </p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-accent/15 text-teal-accent text-sm font-bold">F</span>
            <div>
              <p className="text-xs text-primary-muted uppercase">Avg FID</p>
              <p className={`text-lg font-bold ${cwvStatus(null, 100, 300)}`}>—</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-accent/15 text-teal-accent text-sm font-bold">C</span>
            <div>
              <p className="text-xs text-primary-muted uppercase">Avg CLS</p>
              <p className={`text-lg font-bold ${cwvStatus(summary.avgCls, 0.1, 0.25)}`}>
                {summary.avgCls != null ? summary.avgCls.toFixed(3) : '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="kpi-card mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-accent/15 text-teal-accent">P</span>
            <div>
              <p className="text-xs text-primary-muted uppercase">URLs Analyzed</p>
              <p className="text-2xl font-bold text-primary-text">{summary?.totalUrlsWithPsi || results.length}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-primary-muted uppercase">Slow Pages</p>
            <p className="text-2xl font-bold text-primary-text">{summary?.slowPages ?? 0}</p>
          </div>
          <div>
            <p className="text-xs text-primary-muted uppercase">Large Pages</p>
            <p className="text-2xl font-bold text-primary-text">{summary?.largePages ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="mb-4 flex flex-col xl:flex-row xl:items-end gap-3">
        <input
          type="text"
          placeholder="Filter by URL..."
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          className="input-field !w-full max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'all', label: 'All Pages' },
            { key: 'slow', label: 'Slow Pages' },
            { key: 'large', label: 'Large Pages' },
          ].map(option => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilterMode(option.key as typeof filterMode)}
              className={`btn-secondary !py-2 !px-3 text-xs ${filterMode === option.key ? 'border-teal-accent text-teal-accent' : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-xs text-primary-muted uppercase tracking-wider mb-1">Sort</label>
          <select value={sortMode} onChange={e => setSortMode(e.target.value as typeof sortMode)} className="input-field !py-2 !text-sm">
            <option value="slowest">Slowest first</option>
            <option value="largest">Largest first</option>
            <option value="worstScore">Worst score first</option>
            <option value="url">URL A-Z</option>
          </select>
        </div>
        <button type="button" onClick={exportPerformance} disabled={exporting || loading || filtered.length === 0} className="btn-primary !py-2 !px-4 text-sm">
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>
      <p className="text-xs text-primary-muted mb-3">Showing {filtered.length} of {results.length} performance rows.</p>

      {loading ? (
        <p className="text-primary-muted">Loading performance data...</p>
      ) : filtered.length === 0 ? (
        <p className="text-primary-muted">No crawl performance data available.</p>
      ) : (
        <div className="overflow-x-auto card rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-lumen/50">
                {['URL', 'Perf', 'TTFB', 'Size', 'CO2', 'Fetched'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-primary-muted uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-lumen/30 hover:bg-midnight/30 transition-colors">
                  <td className="px-4 py-2 max-w-[360px] truncate text-primary-text" title={r.url}>{r.url}</td>
                  <td className={`px-4 py-2 font-bold ${scoreColor(r.performance_score ?? 0)}`}>{r.performance_score != null ? r.performance_score : '—'}</td>
                  <td className={`px-4 py-2 ${cwvStatus(r.ttfb_ms, 500, 1000)}`}>{r.ttfb_ms != null ? `${Math.round(r.ttfb_ms)}ms` : '—'}</td>
                  <td className="px-4 py-2 text-primary-muted">{formatBytes((r as any).size_bytes ?? (r as any).sizeBytes)}</td>
                  <td className="px-4 py-2 text-primary-muted">{formatCarbon(r.carbon_footprint_grams ?? r.carbonFootprintGrams)}</td>
                  <td className="px-4 py-2 text-primary-muted">{r.fetched_at ? new Date(r.fetched_at).toLocaleString('en-US') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function normalizePerformanceRow(row: any): PsiRow {
  return {
    ...row,
    performance_score: row.performance_score ?? row.performanceScore ?? null,
    accessibility_score: row.accessibility_score ?? row.accessibilityScore ?? null,
    best_practices_score: row.best_practices_score ?? row.bestPracticesScore ?? null,
    seo_score: row.seo_score ?? row.seoScore ?? null,
    lcp_ms: row.lcp_ms ?? row.lcpMs ?? null,
    fid_ms: row.fid_ms ?? row.fidMs ?? null,
    cls: row.cls ?? null,
    fcp_ms: row.fcp_ms ?? row.fcpMs ?? null,
    ttfb_ms: row.ttfb_ms ?? row.ttfbMs ?? null,
    speed_index: row.speed_index ?? row.speedIndex ?? null,
    size_bytes: row.size_bytes ?? row.sizeBytes ?? null,
    sizeBytes: row.sizeBytes ?? row.size_bytes ?? null,
    carbon_footprint_grams: row.carbon_footprint_grams ?? row.carbonFootprintGrams ?? null,
    carbonFootprintGrams: row.carbonFootprintGrams ?? row.carbon_footprint_grams ?? null,
    fetched_at: row.fetched_at ?? row.fetchedAt ?? '',
  }
}

function sortPerformanceRows(a: PsiRow, b: PsiRow, sortMode: 'slowest' | 'largest' | 'worstScore' | 'url') {
  if (sortMode === 'largest') {
    return Number(b.size_bytes ?? b.sizeBytes ?? 0) - Number(a.size_bytes ?? a.sizeBytes ?? 0)
  }
  if (sortMode === 'worstScore') {
    return Number(a.performance_score ?? 101) - Number(b.performance_score ?? 101)
  }
  if (sortMode === 'url') {
    return a.url.localeCompare(b.url)
  }
  return Number(b.ttfb_ms ?? 0) - Number(a.ttfb_ms ?? 0)
}

function formatBytes(value: unknown) {
  const bytes = Number(value ?? 0)
  if (!bytes) return '—'
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`
  return `${bytes} B`
}

function formatCarbon(value: unknown) {
  const grams = Number(value ?? 0)
  if (!grams) return '—'
  if (grams >= 1000) return `${(grams / 1000).toFixed(2)} kg`
  if (grams < 0.01) return '<0.01 g'
  return `${grams.toFixed(2)} g`
}
