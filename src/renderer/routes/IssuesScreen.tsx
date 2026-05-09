import { useState, useEffect } from 'react'
import { useProjectStore } from '../stores/project-store'
import type { IssueSummary as IssueType } from '@shared/types/issue'

declare global { interface Window { crawldesk: any } }

export default function IssuesScreen() {
  const { activeCrawlId } = useProjectStore()
  const [issues, setIssues] = useState<IssueType[]>([])
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadIssues() }, [activeCrawlId])

  async function loadIssues() {
    if (!activeCrawlId) return
    setLoading(true)
    setLoadError(null)
    try { const data = await window.crawldesk.issues.summarize(activeCrawlId); setIssues(data || []) } catch (e: any) { setLoadError(e?.message || 'Failed to load issues') } finally { setLoading(false) }
  }

  async function retry() { setLoadError(null); loadIssues() }

  const counts = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const i of issues) counts[i.severity as keyof typeof counts] += i.count

  if (!activeCrawlId) return <div className="card py-16 text-center"><p className="text-lg font-semibold text-primary-text">No issues yet.</p><p className="text-sm text-primary-muted mt-2">Start a crawl to detect SEO issues.</p></div>

  const severityConfig = [
    { k: 'critical', label: 'Critical', color: '#ef4444' },
    { k: 'high', label: 'High', color: '#f59e0b' },
    { k: 'medium', label: 'Medium', color: '#f59e0b' },
    { k: 'low', label: 'Low', color: '#3b82f6' },
  ]

  if (loading && !loadError) return <div className="flex items-center justify-center py-20"><div className="animate-spin h-8 w-8 border-2 border-teal-accent border-t-transparent rounded-full"></div></div>

  if (loadError) return (
    <div>
      <h1 className="text-[30px] font-bold text-primary-text tracking-tight leading-none mb-6">Issues Dashboard</h1>
      <div className="card bg-[#3b171b] border-red-900 flex items-center justify-between">
        <span className="text-red-400 text-sm">⚠ {loadError}</span>
        <button onClick={retry} className="btn-secondary !py-1.5 !px-3 text-xs ml-4">Retry</button>
      </div>
    </div>
  )

  return (
    <div>
      <h1 className="text-[30px] font-bold text-primary-text tracking-tight leading-none mb-6">Issues Dashboard</h1>
      {/* Severity Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {severityConfig.map(s => (
          <div key={s.k} className="kpi-card">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-[20px] h-[20px] rounded-full flex-shrink-0" style={{ backgroundColor: s.color + '20' }}>
                <span className="block w-full h-full rounded-full opacity-70" style={{ backgroundColor: s.color }} />
              </span>
              <p className="text-xs text-primary-muted font-semibold">{s.label}</p>
            </div>
            <p className="text-[28px] font-bold text-primary-text leading-none">{counts[s.k as keyof typeof counts]}</p>
          </div>
        ))}
      </div>

      {/* Issue Groups Table */}
      {issues.length === 0 ? (
        <div className="card py-12 text-center"><p className="text-primary-muted">No issues detected. Great job!</p></div>
      ) : (
        <table className="w-full text-sm text-left border border-lumen rounded-lg bg-panel-dark overflow-hidden">
          <thead><tr className="border-b border-row"><th className="px-4 py-2.5 font-medium text-primary-muted">Severity</th><th className="px-4 py-2.5 font-medium text-primary-muted">Issue</th><th className="px-4 py-2.5 font-medium text-primary-muted w-20">Count</th><th className="px-4 py-2.5 font-medium text-primary-muted">Recommendation</th></tr></thead>
          <tbody>{issues.map(i => (
            <tr key={i.issue_type} onClick={() => setSelectedType(selectedType === i.issue_type ? null : i.issue_type)} className={`border-b border-row cursor-pointer transition-colors ${selectedType === i.issue_type ? 'bg-[#0f1f2a]' : 'hover:bg-[#0f1f2a]'}`}>
              <td className="px-4 py-3"><span className={`${i.severity === 'critical' ? 'pill-error' : i.severity === 'high' ? 'pill-warning' : i.severity === 'medium' ? 'pill-warning' : 'pill-neutral'}`}>{i.severity.toUpperCase()}</span></td>
              <td className="px-4 py-3"><div className="font-medium text-primary-text">{i.label || i.issue_type}</div><div className="text-xs text-primary-muted mt-0.5">{i.explanation}</div></td>
              <td className="px-4 py-3 font-semibold text-primary-text">{i.count}</td>
              <td className="px-4 py-3 text-xs text-primary-muted max-w-sm truncate">{i.recommendation}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  )
}
