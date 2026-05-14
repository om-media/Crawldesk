import { useState, useEffect } from 'react'
import { useProjectStore } from '../stores/project-store'

declare global { interface Window { crawldesk: any } }

interface PsiRow {
  id: string; url: string; strategy: string
  performance_score: number | null; accessibility_score: number | null
  best_practices_score: number | null; seo_score: number | null
  lcp_ms: number | null; fid_ms: number | null; cls: number | null
  fcp_ms: number | null; ttfb_ms: number | null; speed_index: number | null
  fetched_at: string
}

interface PsiSummary {
  avgPerformance: number | null; avgAccessibility: number | null
  avgBestPractices: number | null; avgSeo: number | null
  avgLcpMs: number | null; avgCls: number | null
  totalUrlsWithPsi: number
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
  const { activeCrawlId } = useProjectStore()
  const [results, setResults] = useState<PsiRow[]>([])
  const [summary, setSummary] = useState<PsiSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [filterText, setFilterText] = useState('')

  useEffect(() => { loadData() }, [activeCrawlId])

  async function loadData() {
    if (!activeCrawlId) return
    setLoading(true)
    try {
      const [rows, summ] = await Promise.all([
        window.crawldesk.psi.listByCrawl(activeCrawlId),
        window.crawldesk.psi.summarize(activeCrawlId),
      ])
      setResults(rows || [])
      setSummary(summ || null)
    } catch (e) { console.error('[Performance] Failed to load:', e); setResults([]); setSummary(null) }
    finally { setLoading(false) }
  }

  const filtered = results.filter(r => !filterText || r.url.toLowerCase().includes(filterText.toLowerCase()))

  if (!activeCrawlId) return (
    <div className="card py-16 text-center">
      <p className="text-lg font-semibold text-primary-muted">No performance data yet.</p>
      <p className="text-sm text-primary-muted mt-2">Enable PageSpeed Insights in crawl settings and run a crawl first.</p>
    </div>
  )

  return (
    <div>
      <h1 className="text-[30px] leading-none tracking-tight font-bold text-primary-text mb-6">PageSpeed Insights</h1>

      {/* Summary cards */}
      {summary && summary.totalUrlsWithPsi > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Performance', value: summary.avgPerformance },
            { label: 'Accessibility', value: summary.avgAccessibility },
            { label: 'Best Practices', value: summary.avgBestPractices },
            { label: 'SEO Score', value: summary.avgSeo },
          ].map(c => (
            <div key={c.label} className="kpi-card">
              <p className="text-xs text-primary-muted uppercase">{c.label}</p>
              <p className={`text-2xl font-bold ${scoreColor(c.value ?? 0)}`}>{c.value != null ? c.value : '—'}</p>
            </div>
          ))}
        </div>
      )}

      {/* CWV averages */}
      {summary && summary.totalUrlsWithPsi > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
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
        <div className="flex items-center gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-accent/15 text-teal-accent">⚡</span>
          <div>
            <p className="text-xs text-primary-muted uppercase">URLs Analyzed</p>
            <p className="text-2xl font-bold text-primary-text">{summary?.totalUrlsWithPsi || results.length}</p>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Filter by URL..."
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          className="w-full max-w-sm px-3 py-2 rounded-lg bg-sidebar border border-lumen text-sm text-primary-text focus:outline-none focus:border-teal-accent"
        />
      </div>

      {loading ? (
        <p className="text-primary-muted">Loading PSI data...</p>
      ) : filtered.length === 0 ? (
        <p className="text-primary-muted">No PageSpeed Insights data available.</p>
      ) : (
        <div className="overflow-x-auto card rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-lumen/50">
                {['URL', 'Perf', 'A11y', 'BP', 'SEO', 'LCP', 'CLS'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-primary-muted uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-lumen/30 hover:bg-midnight/30 transition-colors">
                  <td className="px-4 py-2 max-w-[360px] truncate text-primary-text" title={r.url}>{r.url}</td>
                  <td className={`px-4 py-2 font-bold ${scoreColor(r.performance_score ?? 0)}`}>{r.performance_score != null ? r.performance_score : '—'}</td>
                  <td className={`px-4 py-2 font-bold ${scoreColor(r.accessibility_score ?? 0)}`}>{r.accessibility_score != null ? r.accessibility_score : '—'}</td>
                  <td className={`px-4 py-2 font-bold ${scoreColor(r.best_practices_score ?? 0)}`}>{r.best_practices_score != null ? r.best_practices_score : '—'}</td>
                  <td className={`px-4 py-2 font-bold ${scoreColor(r.seo_score ?? 0)}`}>{r.seo_score != null ? r.seo_score : '—'}</td>
                  <td className={`px-4 py-2 ${cwvStatus(r.lcp_ms, 2500, 4000)}`}>{r.lcp_ms != null ? `${Math.round(r.lcp_ms)}ms` : '—'}</td>
                  <td className={`px-4 py-2 ${cwvStatus(r.cls, 0.1, 0.25)}`}>{r.cls != null ? r.cls.toFixed(3) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
