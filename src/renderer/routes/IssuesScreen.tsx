import { useState, useEffect } from 'react'
import { useProjectStore } from '../stores/project-store'
import type { IssueSummary as IssueType } from '@shared/types/issue'

declare global { interface Window { crawldesk: any } }

type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low'

export default function IssuesScreen() {
  const { activeCrawlId } = useProjectStore()
  const [issues, setIssues] = useState<IssueType[]>([])
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [affectedUrls, setAffectedUrls] = useState<any[]>([])
  const [affectedTotal, setAffectedTotal] = useState(0)
  const [affectedPage, setAffectedPage] = useState(0)
  const [affectedLoading, setAffectedLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadIssues() }, [activeCrawlId])

  async function loadIssues() {
    if (!activeCrawlId) return
    setLoading(true)
    setLoadError(null)
    setSelectedType(null)
    try {
      const data = await window.crawldesk.issues.summarize(activeCrawlId)
      setIssues(data || [])
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load issues')
    } finally {
      setLoading(false)
    }
  }

  async function loadAffectedUrls(issueType: string, page: number = 0) {
    if (!activeCrawlId) return
    setAffectedLoading(true)
    try {
      const result = await window.crawldesk.issues.list({
        crawlId: activeCrawlId,
        page,
        pageSize: 20,
        filters: { issueType }
      })
      setAffectedUrls(result.items || [])
      setAffectedTotal(result.total || 0)
      setAffectedPage(page)
    } catch (e: any) {
      console.error('[Issues] Failed to load affected URLs:', e)
      setAffectedUrls([])
      setAffectedTotal(0)
    } finally {
      setAffectedLoading(false)
    }
  }

  function handleIssueClick(issueType: string) {
    if (selectedType === issueType) {
      setSelectedType(null)
      setAffectedUrls([])
      setAffectedTotal(0)
    } else {
      setSelectedType(issueType)
      loadAffectedUrls(issueType)
    }
  }

  function retry() { setLoadError(null); loadIssues() }

  const counts = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const i of issues) counts[i.severity as keyof typeof counts] += i.count

  const filteredIssues = severityFilter === 'all'
    ? issues
    : issues.filter(i => i.severity === severityFilter)

  if (!activeCrawlId) return (
    <div className="card py-16 text-center">
      <p className="text-lg font-semibold text-primary-text">No issues yet.</p>
      <p className="text-sm text-primary-muted mt-2">Start a crawl to detect SEO issues.</p>
    </div>
  )

  if (loading && !loadError) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin h-8 w-8 border-2 border-teal-accent border-t-transparent rounded-full"></div>
    </div>
  )

  if (loadError) return (
    <div>
      <h1 className="text-[30px] font-bold text-primary-text tracking-tight leading-none mb-6">Issues Dashboard</h1>
      <div className="card bg-[#3b171b] border-red-900 flex items-center justify-between">
        <span className="text-red-400 text-sm">⚠ {loadError}</span>
        <button onClick={retry} className="btn-secondary !py-1.5 !px-3 text-xs ml-4">Retry</button>
      </div>
    </div>
  )

  const severityConfig = [
    { k: 'critical' as const, label: 'Critical', color: '#ef4444' },
    { k: 'high' as const, label: 'High', color: '#f59e0b' },
    { k: 'medium' as const, label: 'Medium', color: '#fb923c' },
    { k: 'low' as const, label: 'Low', color: '#3b82f6' },
  ]

  const selectedIssue = issues.find(i => i.issue_type === selectedType)

  return (
    <div>
      <h1 className="text-[30px] font-bold text-primary-text tracking-tight leading-none mb-6">Issues Dashboard</h1>

      {/* Severity Cards — clickable filters */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {severityConfig.map(s => (
          <button
            key={s.k}
            onClick={() => setSeverityFilter(severityFilter === s.k ? 'all' : s.k)}
            className={`kpi-card text-left transition-all ${severityFilter === s.k ? 'ring-2 ring-offset-1 ring-offset-[#0d1117]' : ''}`}
            style={severityFilter === s.k ? { ringColor: s.color } : {}}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="w-[20px] h-[20px] rounded-full flex-shrink-0" style={{ backgroundColor: s.color + '20' }}>
                <span className="block w-full h-full rounded-full opacity-70" style={{ backgroundColor: s.color }} />
              </span>
              <p className="text-xs text-primary-muted font-semibold">{s.label}</p>
            </div>
            <p className="text-[28px] font-bold text-primary-text leading-none">{counts[s.k]}</p>
          </button>
        ))}
      </div>

      {/* Issue Groups Table */}
      {filteredIssues.length === 0 ? (
        <div className="card py-12 text-center">
          <p className="text-primary-muted">
            {severityFilter !== 'all' ? `No ${severityFilter} issues detected.` : 'No issues detected. Great job!'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredIssues.map(i => (
            <div key={i.issue_type} className={`card overflow-hidden transition-all ${selectedType === i.issue_type ? 'ring-1 ring-teal-accent/50' : ''}`}>
              <div
                onClick={() => handleIssueClick(i.issue_type)}
                className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-[#0f1f2a] transition-colors"
              >
                <span className={`${i.severity === 'critical' ? 'pill-error' : i.severity === 'high' ? 'pill-warning' : i.severity === 'medium' ? 'pill-warning' : 'pill-neutral'}`}>
                  {i.severity.toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-primary-text">{i.label || i.issue_type}</div>
                  {i.explanation && <div className="text-xs text-primary-muted mt-0.5 truncate">{i.explanation}</div>}
                </div>
                <span className="text-lg font-bold text-primary-tabular">{i.count}</span>
                <svg className={`w-4 h-4 text-primary-muted transition-transform ${selectedType === i.issue_type ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>

              {/* Expanded detail */}
              {selectedType === i.issue_type && (
                <div className="border-t border-lumen bg-[#0a1018] px-4 pb-4">
                  {i.recommendation && (
                    <div className="py-2 border-b border-lumen mb-3">
                      <span className="text-xs font-semibold text-primary-muted">Recommendation:</span>
                      <span className="text-xs text-primary-text ml-2">{i.recommendation}</span>
                    </div>
                  )}

                  {/* Affected URLs */}
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-primary-muted">Affected URLs ({affectedTotal})</span>
                      {affectedLoading && <div className="animate-spin h-3 w-3 border border-teal-accent border-t-transparent rounded-full"></div>}
                    </div>
                    {affectedUrls.length === 0 && !affectedLoading ? (
                      <p className="text-xs text-primary-muted py-2">Click to load affected URLs</p>
                    ) : (
                      <div className="max-h-[240px] overflow-y-auto space-y-1">
                        {affectedUrls.map((u, idx) => (
                          <div key={u.id || idx} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#0f1f2a] text-xs">
                            <span className={`${u.severity === 'critical' ? 'text-red-400' : u.severity === 'high' ? 'text-amber-400' : u.severity === 'medium' ? 'text-orange-400' : 'text-blue-400'} font-mono`}>
                              {u.severity?.charAt(0).toUpperCase() || '-'}
                            </span>
                            <span className="text-teal-text truncate flex-1 font-mono">{u.url}</span>
                            {u.message && <span className="text-primary-muted truncate max-w-[200px]">{u.message}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {affectedTotal > 20 && (
                      <p className="text-xs text-primary-muted mt-1">Showing {affectedUrls.length} of {affectedTotal} affected URLs</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {severityFilter !== 'all' && (
        <button onClick={() => setSeverityFilter('all')} className="btn-secondary mt-4 text-sm">
          Show all issues
        </button>
      )}
    </div>
  )
}