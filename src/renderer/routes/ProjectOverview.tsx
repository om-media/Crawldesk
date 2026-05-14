import { useState, useEffect } from 'react'
import { useProjectStore } from '../stores/project-store'
import type { Crawl as CrawlType } from '@shared/types/crawl'

interface Props { crawlId?: string | null; onNavigate?: (route: 'setup') => void }

declare global { interface Window { crawldesk: any } }

export default function ProjectOverview({ crawlId, onNavigate }: Props) {
  const { selectedProjectId } = useProjectStore()
  const [crawls, setCrawls] = useState<CrawlType[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [issueSummary, setIssueSummary] = useState<any[]>([])
  const [recentUrls, setRecentUrls] = useState<any[]>([])
  const [depthDist, setDepthDist] = useState<Record<number, number>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const activeCrawl = crawls.find(c => c.id === crawlId && (c.status === 'running' || c.status === 'paused'))
  const lastCrawl = crawls[0]

  useEffect(() => {
    if (!selectedProjectId) return
    loadCrawls()
  }, [selectedProjectId])

  async function loadCrawls() {
    if (!selectedProjectId) return
    setLoadError(null)
    try {
      const list = await window.crawldesk.crawls.listByProject(selectedProjectId)
      setCrawls(list || [])
      if (list?.length > 0) {
        let s: any = null
        try { s = await window.crawldesk.urls.summarize(list[0].id); setSummary(s) } catch (e) { console.error('[Overview] Failed to load URL summary:', e) }
        try { setIssueSummary((await window.crawldesk.issues.summarize(list[0].id)) || []) } catch (e) { console.error('[Overview] Failed to load issue summary:', e) }
        // Fetch recent URLs for the table
        try {
          const urlsResult = await window.crawldesk.urls.list({ crawlId: list[0].id, page: 0, pageSize: 8 })
          setRecentUrls(urlsResult.items || [])
        } catch (e) { console.error('[Overview] Failed to load recent URLs:', e) }
        // Build depth distribution from summary or URL data
        try {
          const depthData: Record<number, number> = {}
          if (s?.depthDistribution) {
            Object.entries(s.depthDistribution).forEach(([k, v]) => { depthData[parseInt(k)] = Number(v) })
          } else {
            const allForChart = await window.crawldesk.urls.list({ crawlId: list[0].id, page: 0, pageSize: 200 })
            ;(allForChart.items || []).forEach((u: any) => { depthData[u.depth] = (depthData[u.depth] || 0) + 1 })
          }
          setDepthDist(depthData)
        } catch (e) { console.error('[Overview] Failed to build depth distribution:', e) }
      }
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load project data')
    }
  }

  function retryLoad() { setLoadError(null); loadCrawls() }

  // Compute KPIs from data
  const totalUrls = summary?.total ?? 0
  const indexableCount = summary?.indexableCount ?? 0
  const criticalIssues = issueSummary.filter(i => i.severity === 'critical').reduce((a, b) => a + b.count, 0)
  const highIssues = issueSummary.filter(i => i.severity === 'high').reduce((a, b) => a + b.count, 0)
  const avgResponseTime = summary?.avgResponseTimeMs ?? 0
  const healthScore = Math.max(0, Math.min(100, 100 - criticalIssues * 2 - highIssues))

  // Status distribution from URL summary
  const statusDist: Record<string, number> = summary?.statusCodeDistribution ? summary.statusCodeDistribution : {}

  if (!lastCrawl && !activeCrawl) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <div className="w-16 h-16 rounded-full bg-teal-bg/50 flex items-center justify-center mb-4">
          <span className="text-3xl text-teal-accent">⌂</span>
        </div>
        <h2 className="text-xl font-bold text-primary-text mb-2">Welcome to CrawlDesk</h2>
        <p className="text-sm text-primary-muted max-w-md text-center mb-6">Start crawling websites locally with enterprise-grade SEO analysis. Create your first project to get started.</p>
        <button onClick={() => onNavigate?.('setup')} className="btn-primary py-3 px-6 text-base">Start New Crawl</button>
      </div>
    )
  }

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}m ${s.toString().padStart(2, '0')}s`
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[30px] font-bold text-primary-text tracking-tight leading-none">
            {(() => { try { return lastCrawl?.startUrl ? new URL(lastCrawl.startUrl).hostname : selectedProjectId } catch { return selectedProjectId } })()}
          </h1>
          <p className="text-sm text-primary-muted mt-1 font-normal">Technical health and crawl intelligence</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald" />
            <span className="text-xs font-semibold text-emerald">Completed</span>
          </div>
          <span className="text-xs text-primary-muted">{lastCrawl?.startedAt ? new Date(lastCrawl.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' at ' + new Date(lastCrawl.startedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '-'}</span>
          <button onClick={() => onNavigate?.('setup')} className="btn-secondary py-2 px-3 rounded-lg text-xs">▶ Run Crawl</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: 'Total URLs', value: totalUrls.toLocaleString(), icon: '#3b82f6', trend: '', up: true },
          { label: 'Indexable Pages', value: indexableCount.toLocaleString(), icon: '#10b981', trend: '', up: true },
          { label: 'Critical Issues', value: criticalIssues.toString(), icon: '#ef4444', trend: '', up: false },
          { label: 'Avg Response Time', value: avgResponseTime ? `${avgResponseTime} ms` : '-', icon: '#3b82f6', trend: '', up: true },
          { label: 'Health Score', value: `${healthScore}/100`, icon: '#10b981', trend: '', up: healthScore > 80 }
        ].map(kpi => (
          <div key={kpi.label} className="kpi-card">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-[20px] h-[20px] rounded-full flex-shrink-0" style={{ backgroundColor: kpi.icon + '20' }}>
                <span className="block w-full h-full rounded-full opacity-70" style={{ backgroundColor: kpi.icon }} />
              </span>
              <p className="text-xs text-primary-muted font-semibold">{kpi.label}</p>
            </div>
            <p className="text-[28px] font-bold text-primary-text leading-none">{kpi.value}</p>
            {kpi.trend && (
              <p className={`text-xs mt-2 ${kpi.up ? 'text-emerald' : 'text-red-500'} font-medium`}>
                {kpi.up ? '↑' : '↓'} {kpi.trend} vs. previous crawl
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_390px] gap-4">
        {/* Left column - Chart card + URL table */}
        <div className="space-y-4">
          {/* Crawl Activity chart placeholder */}
          {lastCrawl?.startedAt && lastCrawl?.finishedAt && (
            <div className="card p-5" style={{ borderRadius: '12px' }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-primary-text">Crawl Activity</h3>
                <span className="text-xs text-primary-muted font-medium">URLs crawled</span>
              </div>
              <div className="flex items-end gap-6">
                <div>
                  <p className="text-[22px] font-bold leading-none" style={{ color: '#14B8A6' }}>{totalUrls.toLocaleString()}</p>
                  <p className="text-xs text-primary-muted mt-1.5 font-medium">Duration</p>
                  <p className="text-base font-medium text-primary-text">{formatTime(Math.round((new Date(lastCrawl.finishedAt || Date.now()).getTime() - new Date(lastCrawl.startedAt).getTime()) / 1000))}</p>
                </div>
                {/* Real depth distribution bar chart */}
                <div className="flex-1 flex items-end gap-[3px]" style={{ height: '60px' }}>
                  {Object.keys(depthDist).length > 0 ? Object.entries(depthDist).sort(([a], [b]) => Number(a) - Number(b)).map(([depth, count]: any) => {
                    const maxVal = Math.max(...Object.values(depthDist))
                    const h = Math.max(6, (Number(count) / maxVal) * 60)
                    return <div key={depth} className="flex-1 rounded-sm group relative" style={{ height: `${h}px`, backgroundColor: '#14B8A6', opacity: 0.5 + (Number(count) / maxVal) * 0.5 }} title={`Depth ${depth}: ${count} URLs`}>
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-primary-muted font-medium opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none">{count} @ d{depth}</div>
                    </div>
                  }) : (
                    <div className="flex items-center justify-center w-full text-xs text-primary-muted py-2">No depth data available</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Recent Crawls Table */}
          <div className="card p-5" style={{ borderRadius: '12px' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-primary-text">Recent Crawled URLs</h3>
              <button onClick={() => onNavigate?.('results')} className="btn-secondary !py-1.5 !px-3 text-xs">View All →</button>
            </div>
            {!lastCrawl ? (
              <p className="text-sm text-primary-muted py-4 text-center">No crawls yet. Set up your first crawl to begin.</p>
            ) : recentUrls.length === 0 ? (
              <div className="flex items-center gap-2 justify-center py-8 text-sm text-primary-muted">
                <div className="animate-spin h-4 w-4 border-2 border-teal-accent border-t-transparent rounded-full"></div> Loading URLs...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-row">
                      {['URL', 'Status', 'Indexability', 'Title', 'Depth'].map(h => (
                        <th key={h} className="px-3 py-2 font-medium text-primary-muted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentUrls.map((u: any) => {
                      const code = u.status_code ?? 0
                      return (
                        <tr key={u.id} className="border-b border-row hover:bg-[#0f1f2a] transition-colors cursor-pointer" onClick={() => onNavigate?.('results')}>
                          <td className="px-3 py-2 max-w-[280px] truncate text-teal-text">{u.url}</td>
                          <td className="px-3 py-2">
                            {code >= 200 && code < 300 ? <span className="pill-success">{code}</span> : code >= 300 && code < 400 ? <span className="pill-warning">{code}</span> : code > 0 ? <span className="pill-error">{code}</span> : <span className="text-primary-muted">-</span>}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`pill ${u.indexability === 'indexable' ? 'pill-success' : u.indexability === 'non_indexable' ? 'pill-error' : 'pill-neutral'}`}>{u.indexability || 'unknown'}</span>
                          </td>
                          <td className="px-3 py-2 max-w-[200px] truncate text-primary-text">{u.title || '-'}</td>
                          <td className="px-3 py-2 text-primary-text font-medium">{u.depth ?? '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right column - Panels */}
        <div className="space-y-4">
          {/* Top Issues panel */}
          <div className="card p-5" style={{ borderRadius: '12px' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-primary-text">Top Issues</h3>
              <button onClick={() => onNavigate?.('issues')} className="text-xs font-medium" style={{ color: '#3B82F6' }}>View all →</button>
            </div>
            {issueSummary.length === 0 ? (
              <p className="text-sm text-primary-muted py-3">No issues detected. Great job!</p>
            ) : (
              <div className="space-y-2">
                {issueSummary.slice(0, 6).map((item: any) => (
                  <div key={item.issue_type} className="flex items-center gap-2 py-2 border-b border-row last:border-b-0">
                    <span className={`w-[20px] h-[20px] rounded-full flex-shrink-0 ${item.severity === 'critical' || item.severity === 'high' ? 'bg-red-500/20' : 'bg-amber/20'} flex items-center justify-center`}>
                      <span className="text-[9px] font-bold" style={{ color: item.severity === 'critical' ? '#ef4444' : item.severity === 'high' ? '#f59e0b' : '#10b981' }}>!</span>
                    </span>
                    <span className="text-xs text-primary-text truncate flex-1">{item.label || item.issue_type}</span>
                    <span className="text-xs text-primary-text font-medium ml-auto">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Health Score panel with circular gauge */}
          <div className="card p-5 flex flex-col items-center" style={{ borderRadius: '12px', height: 'auto' }}>
            <h3 className="text-sm font-semibold text-primary-text mb-3 self-start">Health Score</h3>
            <svg viewBox="0 0 120 120" className="w-24 h-24">
              <circle cx="60" cy="60" r="50" fill="none" stroke="#1f3640" strokeWidth="8" />
              <circle cx="60" cy="60" r="50" fill="none" strokeLinecap="round" strokeWidth="8"
                style={{
                  stroke: healthScore >= 80 ? '#10B981' : healthScore >= 50 ? '#F59E0B' : '#EF4444',
                  strokeDasharray: `${(healthScore / 100) * 314.16} 314.16`,
                  transform: 'rotate(-90deg)',
                  transformOrigin: 'center',
                  transition: 'stroke-dasharray 0.6s ease'
                }} />
              <text x="60" y="56" textAnchor="middle" dominantBaseline="central" fontSize="22" fontWeight="bold" fill="#e6f6f4">{healthScore}</text>
              <text x="60" y="74" textAnchor="middle" dominantBaseline="central" fontSize="10" fill="#89a4aa">/100</text>
            </svg>
            <p className="text-xs text-primary-muted mt-3 font-medium text-center">{criticalIssues > 0 ? `${criticalIssues} critical issues found` : 'No critical issues — looking good!'}</p>
          </div>

          {/* Status Distribution panel */}
          <div className="card p-5" style={{ borderRadius: '12px', height: 'auto' }}>
            <h3 className="text-sm font-semibold text-primary-text mb-3">Status Distribution</h3>
            {Object.keys(statusDist).length === 0 ? (
              <p className="text-sm text-primary-muted py-3">Run a crawl to see status code distribution.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(statusDist).sort((a, b) => Number(b[1]) - Number(a[1])).map(([code, count]: any) => {
                  const color = parseInt(code) < 300 ? '#10b981' : parseInt(code) < 400 ? '#f59e0b' : parseInt(code) < 500 ? '#ef4444' : '#89a4aa'
                  return (
                    <div key={code} className="flex items-center gap-2">
                      <span className="w-[8px] h-[8px] rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-xs text-primary-muted flex-1">{code}</span>
                      <span className="text-xs text-primary-text font-medium">{(count as number).toLocaleString()}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer bar */}
      <div className="card p-4 flex items-center justify-between" style={{ borderRadius: '14px', height: 'auto' }}>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald flex items-center justify-center">
              <span className="text-white text-xs font-bold">✓</span>
            </span>
            <span className="text-sm font-semibold text-emerald">Crawl Completed Successfully</span>
          </div>
          <div className="h-5 w-px bg-lumen" />
          <span className="text-xs text-primary-muted">Total URLs</span>
          <span className="text-sm text-primary-text font-semibold">{totalUrls.toLocaleString()}</span>
          <div className="h-5 w-px bg-lumen" />
          <span className="text-xs text-primary-muted">Duration</span>
          <span className="text-sm text-primary-text font-semibold">{lastCrawl?.startedAt && lastCrawl?.finishedAt ? formatTime(Math.round((new Date(lastCrawl.finishedAt).getTime() - new Date(lastCrawl.startedAt).getTime()) / 1000)) : '-'}</span>
          <div className="h-5 w-px bg-lumen" />
        </div>
      </div>
    </div>
  )
}
