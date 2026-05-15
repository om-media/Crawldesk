/**
 * Issue definitions screen — lists all known SEO issue types from the registry
 * with severity badges, category chips, and detailed recommendations.
 */
import { useEffect, useState } from 'react'
import { useProjectStore } from '../stores/project-store'
import ErrorBanner from '../components/ErrorBanner'
import type { IssueCategory, IssueDefinition, IssueRecord, IssueSummary as IssueType, Severity } from '@shared/types/issue'


type SeverityFilter = 'all' | Severity
type CategoryFilter = 'all' | IssueCategory

export default function IssuesScreen() {
  const { activeCrawlId } = useProjectStore()
  const [issues, setIssues] = useState<IssueType[]>([])
  const [definitions, setDefinitions] = useState<Record<string, IssueDefinition>>({})
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [affectedUrls, setAffectedUrls] = useState<IssueRecord[]>([])
  const [affectedTotal, setAffectedTotal] = useState(0)
  const [affectedPage, setAffectedPage] = useState(0)
  const [affectedLoading, setAffectedLoading] = useState(false)
  const [selectedIssueDetail, setSelectedIssueDetail] = useState<IssueRecord | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadIssues() }, [activeCrawlId])

  async function loadIssues() {
    if (!activeCrawlId) return
    setLoading(true)
    setLoadError(null)
    setSelectedType(null)
    try {
      const [data, registry] = await Promise.all([
        window.crawldesk.issues.summarize(activeCrawlId),
        window.crawldesk.issues.definitions?.() ?? Promise.resolve([]),
      ])
      const registryById = Object.fromEntries((registry || []).map((definition: IssueDefinition) => [definition.id, definition]))
      setDefinitions(registryById)
      setIssues((data || []).map((issue: IssueType) => {
        const definition = registryById[issue.issue_type]
        return {
          ...issue,
          label: issue.label ?? definition?.label ?? issue.issue_type,
          explanation: issue.explanation ?? definition?.explanation ?? null,
          recommendation: issue.recommendation ?? definition?.recommendation ?? null,
        }
      }))
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
        filters: {
          issueType,
          severity: severityFilter === 'all' ? undefined : severityFilter,
          category: categoryFilter === 'all' ? undefined : categoryFilter,
          search: searchTerm.trim() || undefined,
        }
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
      setSelectedIssueDetail(null)
    } else {
      setSelectedType(issueType)
      setSelectedIssueDetail(null)
      loadAffectedUrls(issueType)
    }
  }

  function retry() { setLoadError(null); loadIssues() }

  async function openIssueDetail(issue: IssueRecord) {
    setSelectedIssueDetail(issue)
    setDetailLoading(true)
    setDetailError(null)
    try {
      const detail = await window.crawldesk.issues.get?.(issue.id)
      if (detail) setSelectedIssueDetail(detail)
    } catch (e: any) {
      setDetailError(e?.message || 'Failed to load issue details')
    } finally {
      setDetailLoading(false)
    }
  }

  function parseDetails(issue: IssueRecord | null): Record<string, unknown> {
    if (!issue?.details_json) return {}
    try {
      const parsed = JSON.parse(issue.details_json)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  async function exportVisibleIssues() {
    if (!activeCrawlId) return
    setExportMessage(null)
    try {
      const result = await window.crawldesk.exports.exportIssues({
        crawlId: activeCrawlId,
        filters: {
          issueType: selectedType ?? undefined,
          severity: severityFilter === 'all' ? undefined : severityFilter,
          category: categoryFilter === 'all' ? undefined : categoryFilter,
          search: searchTerm.trim() || undefined,
        },
      })
      setExportMessage(`Exported ${result.rowCount} issues to ${result.filePath}`)
    } catch (e: any) {
      setExportMessage(e?.message || 'Failed to export issues')
    }
  }

  const counts: Record<Severity, number> = { critical: 0, warning: 0, info: 0 }
  for (const i of issues) counts[i.severity as keyof typeof counts] += i.count

  const categories: IssueCategory[] = Array.from(
    new Set(issues.map((issue) => issue.category).filter((category): category is IssueCategory => Boolean(category)))
  ).sort()
  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredIssues = issues.filter(i => {
    const severityMatches = severityFilter === 'all' || i.severity === severityFilter
    const categoryMatches = categoryFilter === 'all' || i.category === categoryFilter
    const searchableText = [
      i.issue_type,
      i.category,
      i.label,
      i.explanation,
      i.recommendation,
    ].filter(Boolean).join(' ').toLowerCase()
    const searchMatches = !normalizedSearch || searchableText.includes(normalizedSearch)
    return severityMatches && categoryMatches && searchMatches
  })

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
      <ErrorBanner message={loadError} onRetry={retry} />
    </div>
  )

  const severityConfig = [
    { k: 'critical' as const, label: 'Critical', color: '#ef4444' },
    { k: 'warning' as const, label: 'Warning', color: '#f59e0b' },
    { k: 'info' as const, label: 'Info', color: '#3b82f6' },
  ]

  return (
    <div>
      <h1 className="text-[30px] font-bold text-primary-text tracking-tight leading-none mb-6">Issues Dashboard</h1>

      {/* Severity Cards — clickable filters */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {severityConfig.map(s => (
          <button
            key={s.k}
            onClick={() => setSeverityFilter(severityFilter === s.k ? 'all' : s.k)}
            className={`kpi-card text-left transition-all ${severityFilter === s.k ? 'ring-2 ring-offset-1 ring-offset-[#0d1117]' : ''}`}
            style={severityFilter === s.k ? { outline: `2px solid ${s.color}`, outlineOffset: '1px' } : undefined}
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

      <div className="flex items-center gap-3 mb-6">
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search issues"
          className="bg-[#0d1117] border border-lumen rounded px-3 py-2 text-sm text-primary-text min-w-[220px]"
        />
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}
          className="bg-[#0d1117] border border-lumen rounded px-3 py-2 text-sm text-primary-text"
        >
          <option value="all">All categories</option>
          {categories.map(category => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
        <button
          onClick={exportVisibleIssues}
          className="btn-secondary text-sm ml-auto"
        >
          Export visible CSV
        </button>
        {(severityFilter !== 'all' || categoryFilter !== 'all' || searchTerm) && (
          <button
            onClick={() => {
              setSeverityFilter('all')
              setCategoryFilter('all')
              setSearchTerm('')
            }}
            className="btn-secondary text-sm"
          >
            Clear filters
          </button>
        )}
      </div>

      {exportMessage && <div className="text-xs text-primary-muted mb-4">{exportMessage}</div>}

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
              <button
                type="button"
                onClick={() => handleIssueClick(i.issue_type)}
                className="flex w-full items-center gap-4 px-4 py-3 cursor-pointer hover:bg-[#0f1f2a] focus:bg-[#0f1f2a] focus:outline-none focus-visible:ring-1 focus-visible:ring-teal-accent transition-colors text-left"
                aria-expanded={selectedType === i.issue_type}
              >
                <span className={`${i.severity === 'critical' ? 'pill-error' : i.severity === 'warning' ? 'pill-warning' : 'pill-neutral'}`}>
                  {i.severity.toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-primary-text">{i.label || definitions[i.issue_type]?.label || i.issue_type}</div>
                  {i.explanation && <div className="text-xs text-primary-muted mt-0.5 truncate">{i.explanation}</div>}
                </div>
                <span className="text-lg font-bold text-primary-tabular">{i.count}</span>
                <svg className={`w-4 h-4 text-primary-muted transition-transform ${selectedType === i.issue_type ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>

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
                        {affectedUrls.map((u: IssueRecord, idx: number) => (
                          <button
                            key={u.id || idx}
                            type="button"
                            onClick={() => openIssueDetail(u)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#0f1f2a] text-xs text-left"
                          >
                            <span className={`${u.severity === 'critical' ? 'text-red-400' : u.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'} font-mono`}>
                              {u.severity?.charAt(0).toUpperCase() || '-'}
                            </span>
                            <span className="text-teal-text truncate flex-1 font-mono">{u.url}</span>
                            {u.message && <span className="text-primary-muted truncate max-w-[200px]">{u.message}</span>}
                          </button>
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

      {selectedIssueDetail && (
        <IssueDetailDrawer
          issue={selectedIssueDetail}
          definition={definitions[selectedIssueDetail.issue_type]}
          details={parseDetails(selectedIssueDetail)}
          loading={detailLoading}
          error={detailError}
          onClose={() => setSelectedIssueDetail(null)}
        />
      )}

    </div>
  )
}

function IssueDetailDrawer({
  issue,
  definition,
  details,
  loading,
  error,
  onClose,
}: {
  issue: IssueRecord
  definition?: IssueDefinition
  details: Record<string, unknown>
  loading: boolean
  error: string | null
  onClose: () => void
}) {
  const recommendation =
    issue.recommendation ||
    (typeof details.recommendation === 'string' ? details.recommendation : '') ||
    definition?.recommendation ||
    ''
  const detailEntries = Object.entries(details).filter(([key]) => key !== 'recommendation')

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close issue details"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 h-full w-full max-w-[460px] bg-[#0a1018] border-l border-lumen shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-lumen flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-primary-muted uppercase">{issue.category}</div>
            <h2 className="text-lg font-semibold text-primary-text truncate">
              {issue.label || definition?.label || issue.issue_type}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Close</button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {loading && <div className="text-sm text-primary-muted">Loading details...</div>}
          {error && <ErrorBanner message={error} />}

          <div>
            <div className="text-xs text-primary-muted mb-1">URL</div>
            <div className="text-sm text-teal-text font-mono break-all">{issue.url}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-primary-muted mb-1">Severity</div>
              <span className={`${issue.severity === 'critical' ? 'pill-error' : issue.severity === 'warning' ? 'pill-warning' : 'pill-neutral'}`}>
                {issue.severity.toUpperCase()}
              </span>
            </div>
            <div>
              <div className="text-xs text-primary-muted mb-1">Issue type</div>
              <div className="text-sm text-primary-text font-mono break-all">{issue.issue_type}</div>
            </div>
          </div>

          <div>
            <div className="text-xs text-primary-muted mb-1">Message</div>
            <p className="text-sm text-primary-text">{issue.message}</p>
          </div>

          {(issue.explanation || definition?.explanation) && (
            <div>
              <div className="text-xs text-primary-muted mb-1">Explanation</div>
              <p className="text-sm text-primary-text">{issue.explanation || definition?.explanation}</p>
            </div>
          )}

          {recommendation && (
            <div>
              <div className="text-xs text-primary-muted mb-1">Recommendation</div>
              <p className="text-sm text-primary-text">{recommendation}</p>
            </div>
          )}

          {detailEntries.length > 0 && (
            <div>
              <div className="text-xs text-primary-muted mb-2">Details</div>
              <div className="space-y-2">
                {detailEntries.map(([key, value]) => (
                  <div key={key} className="border border-lumen rounded p-2">
                    <div className="text-xs text-primary-muted font-mono">{key}</div>
                    <pre className="text-xs text-primary-text whitespace-pre-wrap break-all mt-1">
                      {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
