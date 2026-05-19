import { Fragment, useState, useEffect } from 'react'
import { useProjectStore } from '../stores/project-store'
import ErrorBanner from '../components/ErrorBanner'


interface Schedule {
  id: string
  project_id: string
  start_url: string
  crawl_settings_json?: string
  cron_expression: string
  enabled: number
  last_run_at?: string | null
  next_run_at?: string | null
  created_at: string
}

interface CrawlDiff {
  id: string
  crawl_a_id?: string
  crawl_b_id?: string
  url_count_delta: number
  new_urls_count: number
  removed_urls_count: number
  broken_links_delta: number
  issues_delta: number
  critical_issues_delta: number
  created_at: string
}

interface CrawlDiffUrlChange {
  url: string
  oldStatusCode?: number | null
  newStatusCode?: number | null
  oldTitle?: string | null
  newTitle?: string | null
  oldIndexability?: string | null
  newIndexability?: string | null
}

interface CrawlDiffIssueChange {
  issueType?: string
  issue_type?: string
  severity: string
  category: string
  url: string
  message: string
}

interface CrawlDiffBrokenLinkChange {
  sourceUrl?: string
  source_url?: string
  targetUrl?: string
  target_url?: string
  statusCode?: number | null
  status_code?: number | null
}

interface CrawlDiffDetail {
  summary: CrawlDiff
  newUrls: CrawlDiffUrlChange[]
  removedUrls: CrawlDiffUrlChange[]
  changedUrls: CrawlDiffUrlChange[]
  newIssues: CrawlDiffIssueChange[]
  resolvedIssues: CrawlDiffIssueChange[]
  newBrokenLinks: CrawlDiffBrokenLinkChange[]
  resolvedBrokenLinks: CrawlDiffBrokenLinkChange[]
  sampleLimit: number
}

export default function SchedulesScreen() {
  const { selectedProjectId } = useProjectStore()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ startUrl: '', cronExpression: '' })
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ startUrl: '', cronExpression: '' })
  const [saving, setSaving] = useState(false)
  const [updatingScheduleId, setUpdatingScheduleId] = useState<string | null>(null)
  const [runningScheduleId, setRunningScheduleId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // Human-readable cron descriptions
  const cronPresets = [
    { label: 'Every day at 2:00 AM', expr: '0 2 * * *' },
    { label: 'Every Monday at 3:00 AM', expr: '0 3 * * 1' },
    { label: 'Every hour', expr: '0 * * * *' },
    { label: 'Every 6 hours', expr: '0 */6 * * *' },
    { label: 'Every month on the 1st', expr: '0 2 1 * *' },
  ]

  function describeCron(expr: string): string {
    if (!expr) return ''
    const parts = expr.trim().split(/\s+/)
    if (parts.length < 5) return expr
    const [min, hour, dayOfMonth, month, dayOfWeek] = parts
    if (dayOfMonth === '*' && month === '*') {
      if (min === '0' && hour === '*') return 'Every hour'
      if (min === '0' && hour.startsWith('*/')) return `Every ${hour.slice(2)} hours`
      if (dayOfWeek === '*') return `Daily at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      return `Every ${days[parseInt(dayOfWeek)] || 'day'} at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`
    }
    return expr
  }

  async function loadSchedules() {
    if (!selectedProjectId) return
    setLoading(true)
    try {
      const list = await window.crawldesk.schedules.list(selectedProjectId)
      setSchedules(list || [])
      setError('')
    } catch (e: any) {
      console.error('[Schedules] Failed to load:', e.message)
      setError(e?.message || 'Failed to load schedules')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSchedules() }, [selectedProjectId])

  async function createSchedule(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    if (!validateScheduleForm(form, 'creating')) return
    setSaving(true)
    try {
      await window.crawldesk.schedules.create({
        projectId: selectedProjectId,
        startUrl: form.startUrl,
        crawlSettingsJson: '{}',
        cronExpression: form.cronExpression
      })
      setForm({ startUrl: '', cronExpression: '' })
      setShowForm(false)
      setNotice('Schedule created.')
      await loadSchedules()
    } catch (err: any) {
      console.error('[Schedules] Create failed:', err.message)
      setError(err?.message || 'Failed to create schedule')
    } finally {
      setSaving(false)
    }
  }

  function validateScheduleForm(values: { startUrl: string, cronExpression: string }, action: 'creating' | 'updating') {
    if (!selectedProjectId) { setError(`Select a project before ${action} a schedule.`); return false }
    if (!values.startUrl.trim()) { setError('Start URL is required.'); return false }
    if (!values.cronExpression.trim()) { setError('Cron expression is required.'); return false }
    try { new URL(values.startUrl) } catch { setError('Start URL must be a valid URL.'); return false }
    return true
  }

  function startEditing(schedule: Schedule) {
    setError('')
    setNotice('')
    setShowForm(false)
    setEditingScheduleId(schedule.id)
    setEditForm({ startUrl: schedule.start_url, cronExpression: schedule.cron_expression })
  }

  function cancelEditing() {
    setEditingScheduleId(null)
    setEditForm({ startUrl: '', cronExpression: '' })
  }

  async function saveScheduleEdit(schedule: Schedule) {
    setError('')
    setNotice('')
    if (!validateScheduleForm(editForm, 'updating')) return
    setUpdatingScheduleId(schedule.id)
    try {
      await window.crawldesk.schedules.update(schedule.id, {
        startUrl: editForm.startUrl,
        crawlSettingsJson: schedule.crawl_settings_json || '{}',
        cronExpression: editForm.cronExpression,
      })
      setEditingScheduleId(null)
      setNotice('Schedule updated.')
      await loadSchedules()
    } catch (err: any) {
      console.error('[Schedules] Edit failed:', err.message)
      setError(err?.message || 'Failed to update schedule')
    } finally {
      setUpdatingScheduleId(null)
    }
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    setError('')
    setNotice('')
    try {
      await window.crawldesk.schedules.update(id, { enabled })
      await loadSchedules()
    } catch (err: any) {
      console.error('[Schedules] Update failed:', err.message)
      setError(err?.message || 'Failed to update schedule')
    }
  }

  async function deleteSchedule(id: string) {
    setError('')
    setNotice('')
    try {
      await window.crawldesk.schedules.delete(id)
      setNotice('Schedule deleted.')
      await loadSchedules()
    } catch (err: any) {
      console.error('[Schedules] Delete failed:', err.message)
      setError(err?.message || 'Failed to delete schedule')
    }
  }

  async function runScheduleNow(id: string) {
    setError('')
    setNotice('')
    setRunningScheduleId(id)
    try {
      const run = await window.crawldesk.schedules.runNow(id)
      setNotice(`Started scheduled crawl #${run.crawlId || run.crawl_id}.`)
      await loadSchedules()
    } catch (err: any) {
      console.error('[Schedules] Manual run failed:', err.message)
      setError(err?.message || 'Failed to start scheduled crawl')
    } finally {
      setRunningScheduleId(null)
    }
  }

  return (
    <div>
      <h1 className="text-[30px] leading-none tracking-tight font-bold text-primary-text mb-2">Crawl Scheduling</h1>
      <p className="text-sm text-primary-muted mb-6">Set up recurring crawls with cron expressions. Compare results across runs to track SEO changes over time.</p>
      {error && <ErrorBanner message={error} onRetry={error.startsWith('Failed') ? loadSchedules : undefined} />}
      {notice && <div className="mb-4 text-sm text-emerald bg-emerald/10 border border-emerald/30 rounded px-3 py-2">{notice}</div>}

      {/* New Schedule Form */}
      {!showForm ? (
        <button onClick={() => { setError(''); setShowForm(true) }} className="btn-secondary !py-2 !px-4 text-sm mb-4">+ New Schedule</button>
      ) : (
        <form onSubmit={createSchedule} className="card p-4 mb-4 grid grid-cols-1 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,220px)_minmax(180px,220px)_auto_auto] gap-3 items-end" style={{ borderRadius: '12px' }}>
          <div>
            <label className="block text-xs text-primary-muted uppercase tracking-wider mb-1">Start URL</label>
            <input value={form.startUrl} onChange={e => setForm(f => ({ ...f, startUrl: e.target.value }))} placeholder="https://example.com" className="input-field w-full !py-2 !text-sm" required />
          </div>
          <div>
            <label className="block text-xs text-primary-muted uppercase tracking-wider mb-1">Cron Expression</label>
            <input value={form.cronExpression} onChange={e => setForm(f => ({ ...f, cronExpression: e.target.value }))} placeholder="0 2 * * *" className="input-field w-full !py-2 !text-sm" required />
            {form.cronExpression && <p className="text-xs text-teal-accent mt-1">{describeCron(form.cronExpression)}</p>}
          </div>
          <div>
            <label className="block text-xs text-primary-muted uppercase tracking-wider mb-1">Quick Presets</label>
            <select onChange={e => { if (e.target.value) setForm(f => ({ ...f, cronExpression: e.target.value })) }} className="input-field w-full !py-2 !text-sm" defaultValue="">
              <option value="">Choose...</option>
              {cronPresets.map(p => <option key={p.expr} value={p.expr}>{p.label}</option>)}
            </select>
          </div>
          <button type="submit" disabled={saving || !selectedProjectId} className="btn-primary !py-2 !px-4 whitespace-nowrap">{saving ? 'Saving...' : 'Save'}</button>
          <button type="button" onClick={() => setShowForm(false)} className="btn-secondary !py-2 !px-3">Cancel</button>
        </form>
      )}

      {/* Schedules List */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin h-8 w-8 border-2 border-teal-accent border-t-transparent rounded-full mr-3"></div>
          <span className="text-primary-muted">Loading schedules...</span>
        </div>
      )}

      {!loading && schedules.length === 0 && (
        <div className="card py-10 text-center">
          <p className="text-primary-text">No scheduled crawls yet.</p>
          <p className="text-xs text-primary-muted mt-1">Common cron examples: <code className="bg-midnight px-1.5 py-0.5 rounded">0 2 * * *</code> = daily at 2 AM, <code className="bg-midnight px-1.5 py-0.5 rounded">0 */12 * * *</code> = every 12 hours</p>
        </div>
      )}

      {!loading && schedules.map(s => {
        const isEditing = editingScheduleId === s.id
        return (
        <div key={s.id} className="card p-4 mb-3 flex flex-col lg:flex-row lg:items-start gap-4" style={{ borderRadius: '12px' }}>
          {isEditing ? (
            <div className="flex-1 min-w-0 grid grid-cols-1 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,220px)] gap-3">
              <div>
                <label className="block text-xs text-primary-muted uppercase tracking-wider mb-1">Start URL</label>
                <input value={editForm.startUrl} onChange={e => setEditForm(f => ({ ...f, startUrl: e.target.value }))} className="input-field w-full !py-2 !text-sm" required />
              </div>
              <div>
                <label className="block text-xs text-primary-muted uppercase tracking-wider mb-1">Cron Expression</label>
                <input value={editForm.cronExpression} onChange={e => setEditForm(f => ({ ...f, cronExpression: e.target.value }))} className="input-field w-full !py-2 !text-sm" required />
                {editForm.cronExpression && <p className="text-xs text-teal-accent mt-1">{describeCron(editForm.cronExpression)}</p>}
              </div>
            </div>
          ) : (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <code className="font-mono text-teal-accent text-sm">{s.cron_expression}</code>
                <span className="text-xs text-primary-muted ml-1">{describeCron(s.cron_expression)}</span>
                <span className={`text-xs ${s.enabled ? 'text-emerald' : 'text-primary-muted'}`}>{s.enabled ? '● Active' : '○ Disabled'}</span>
              </div>
              <p className="text-sm text-primary-text truncate">{s.start_url}</p>
              <p className="text-xs text-primary-muted mt-1">
                Last run: {s.last_run_at ? new Date(s.last_run_at).toLocaleString('en-US') : 'Never'}
                {' · '}Next run: {s.next_run_at ? new Date(s.next_run_at).toLocaleString('en-US') : '—'}
              </p>
            </div>
          )}
          <div className="flex items-center gap-2 shrink-0">
            {isEditing ? (
              <>
                <button onClick={() => saveScheduleEdit(s)} disabled={updatingScheduleId === s.id} className="btn-primary !py-1.5 !px-3 text-xs">
                  {updatingScheduleId === s.id ? 'Saving...' : 'Save changes'}
                </button>
                <button onClick={cancelEditing} className="btn-secondary !py-1.5 !px-3 text-xs">Cancel</button>
              </>
            ) : (
              <>
                <button onClick={() => runScheduleNow(s.id)} disabled={runningScheduleId === s.id} className="btn-primary !py-1.5 !px-3 text-xs">
                  {runningScheduleId === s.id ? 'Starting...' : 'Run now'}
                </button>
                <button onClick={() => startEditing(s)} className="btn-secondary !py-1.5 !px-3 text-xs">Edit</button>
                <button onClick={() => toggleEnabled(s.id, !s.enabled)} className={`btn-secondary !py-1.5 !px-3 text-xs ${s.enabled ? '' : '!opacity-60'}`}>
                  {s.enabled ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => deleteSchedule(s.id)} className="btn-secondary !py-1.5 !px-3 text-xs text-red-400 hover:text-red-300">Delete</button>
              </>
            )}
          </div>
        </div>
        )
      })}

      {/* Diff Comparison Section */}
      {selectedProjectId && (
        <>
          <h2 className="text-xl font-bold text-primary-text tracking-tight mb-3 mt-8">Crawl History & Diffs</h2>
          <DiffViewer projectId={selectedProjectId} />
        </>
      )}
    </div>
  )
}

function DiffViewer({ projectId }: { projectId: string }) {
  const [diffs, setDiffs] = useState<CrawlDiff[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailsById, setDetailsById] = useState<Record<string, CrawlDiffDetail>>({})
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null)
  const [detailError, setDetailError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setExpandedId(null)
    setDetailsById({})
    setDetailError('')
    window.crawldesk.diff.listByProject(projectId)
      .then((rows: CrawlDiff[]) => {
        if (!cancelled) setDiffs(rows || [])
      })
      .catch((err: any) => {
        if (!cancelled) {
          console.error('[Schedules] Failed to load crawl diffs:', err)
          setError(err?.message || 'Failed to load crawl diffs')
          setDiffs([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [projectId])

  async function toggleDetails(diffId: string) {
    setDetailError('')
    if (expandedId === diffId) {
      setExpandedId(null)
      return
    }

    setExpandedId(diffId)
    if (detailsById[diffId]) return

    setDetailLoadingId(diffId)
    try {
      const detail = await window.crawldesk.diff.get(projectId, diffId)
      if (!detail) throw new Error('Diff detail not found')
      setDetailsById(current => ({ ...current, [diffId]: normalizeDiffDetail(detail) }))
    } catch (err: any) {
      console.error('[Schedules] Failed to load crawl diff details:', err)
      setDetailError(err?.message || 'Failed to load crawl diff details')
    } finally {
      setDetailLoadingId(null)
    }
  }

  if (loading) return <p className="text-sm text-primary-muted">Loading crawl diffs...</p>
  if (error) return <ErrorBanner message={error} onRetry={() => {
    setLoading(true)
    setError('')
    window.crawldesk.diff.listByProject(projectId)
      .then((rows: CrawlDiff[]) => setDiffs(rows || []))
      .catch((err: any) => {
        console.error('[Schedules] Failed to load crawl diffs:', err)
        setError(err?.message || 'Failed to load crawl diffs')
        setDiffs([])
      })
      .finally(() => setLoading(false))
  }} />
  if (!diffs.length) return <p className="text-sm text-primary-muted">No diff data available yet — diffs appear after the second crawl on a project.</p>

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b border-row">
          <th className="py-2 px-3 text-left text-xs text-primary-muted uppercase tracking-wider font-medium">Run Pair</th>
          <th className="py-2 px-3 text-left text-xs text-primary-muted uppercase tracking-wider font-medium">URL Count Δ</th>
          <th className="py-2 px-3 text-left text-xs text-primary-muted uppercase tracking-wider font-medium">New URLs</th>
          <th className="py-2 px-3 text-left text-xs text-primary-muted uppercase tracking-wider font-medium">Removed URLs</th>
          <th className="py-2 px-3 text-left text-xs text-primary-muted uppercase tracking-wider font-medium">Broken Links Δ</th>
          <th className="py-2 px-3 text-left text-xs text-primary-muted uppercase tracking-wider font-medium">Issues Δ</th>
          <th className="py-2 px-3 text-left text-xs text-primary-muted uppercase tracking-wider font-medium">Critical Δ</th>
          <th className="py-2 px-3 text-left text-xs text-primary-muted uppercase tracking-wider font-medium">Date</th>
          <th className="py-2 px-3 text-left text-xs text-primary-muted uppercase tracking-wider font-medium">Details</th>
        </tr>
      </thead>
      <tbody>
        {diffs.map((d) => (
          <Fragment key={d.id}>
            <tr className="border-b border-row hover:bg-[#0f1f2a] transition-colors">
              <td className="py-2 px-3 text-primary-muted text-xs whitespace-nowrap">#{d.crawl_a_id || d.id.split(':')[0]} → #{d.crawl_b_id || d.id.split(':')[1]}</td>
              <td className={`py-2 px-3 ${d.url_count_delta >= 0 ? 'text-emerald' : 'text-red-400'}`}>{d.url_count_delta > 0 ? '+' : ''}{d.url_count_delta}</td>
              <td className="py-2 px-3 text-emerald">{d.new_urls_count}</td>
              <td className="py-2 px-3 text-red-400">{d.removed_urls_count}</td>
              <td className={`py-2 px-3 ${d.broken_links_delta <= 0 ? 'text-emerald' : 'text-red-400'}`}>{d.broken_links_delta > 0 ? '+' : ''}{d.broken_links_delta}</td>
              <td className={`py-2 px-3 ${d.issues_delta <= 0 ? 'text-emerald' : 'text-red-400'}`}>{d.issues_delta > 0 ? '+' : ''}{d.issues_delta}</td>
              <td className={`py-2 px-3 ${d.critical_issues_delta <= 0 ? 'text-emerald' : 'text-red-400 font-bold'}`}>{d.critical_issues_delta > 0 ? '+' : ''}{d.critical_issues_delta}</td>
              <td className="py-2 px-3 text-primary-muted text-xs">{new Date(d.created_at).toLocaleDateString('en-US')}</td>
              <td className="py-2 px-3">
                <button onClick={() => toggleDetails(d.id)} className="btn-secondary !py-1 !px-2 text-xs">
                  {expandedId === d.id ? 'Hide' : 'Details'}
                </button>
              </td>
            </tr>
            {expandedId === d.id && (
              <tr className="border-b border-row">
                <td colSpan={9} className="py-3 px-3 bg-[#07131b]">
                  {detailLoadingId === d.id ? (
                    <p className="text-sm text-primary-muted">Loading diff details...</p>
                  ) : detailError ? (
                    <ErrorBanner message={detailError} onRetry={() => toggleDetails(d.id)} />
                  ) : detailsById[d.id] ? (
                    <DiffDetailPanel detail={detailsById[d.id]} />
                  ) : null}
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  )
}

function normalizeDiffDetail(detail: any): CrawlDiffDetail {
  return {
    summary: detail.summary,
    newUrls: detail.newUrls || detail.new_urls || [],
    removedUrls: detail.removedUrls || detail.removed_urls || [],
    changedUrls: detail.changedUrls || detail.changed_urls || [],
    newIssues: detail.newIssues || detail.new_issues || [],
    resolvedIssues: detail.resolvedIssues || detail.resolved_issues || [],
    newBrokenLinks: detail.newBrokenLinks || detail.new_broken_links || [],
    resolvedBrokenLinks: detail.resolvedBrokenLinks || detail.resolved_broken_links || [],
    sampleLimit: Number(detail.sampleLimit ?? detail.sample_limit ?? 25),
  }
}

function DiffDetailPanel({ detail }: { detail: CrawlDiffDetail }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <UrlChangeList title="New URLs" tone="good" rows={detail.newUrls} />
        <UrlChangeList title="Removed URLs" tone="bad" rows={detail.removedUrls} />
        <UrlChangeList title="Changed URLs" tone="warn" rows={detail.changedUrls} changed />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <IssueChangeList title="New Issues" rows={detail.newIssues} tone="bad" />
        <IssueChangeList title="Resolved Issues" rows={detail.resolvedIssues} tone="good" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <BrokenLinkChangeList title="New Broken Links" rows={detail.newBrokenLinks} tone="bad" />
        <BrokenLinkChangeList title="Resolved Broken Links" rows={detail.resolvedBrokenLinks} tone="good" />
      </div>
      <p className="text-[11px] text-primary-muted">Showing up to {detail.sampleLimit} rows per section.</p>
    </div>
  )
}

function UrlChangeList({ title, rows, tone, changed = false }: { title: string, rows: CrawlDiffUrlChange[], tone: 'good' | 'bad' | 'warn', changed?: boolean }) {
  return (
    <div className="rounded border border-row bg-midnight/40 p-3 min-w-0">
      <h3 className={`text-xs uppercase tracking-wider font-semibold mb-2 ${toneClass(tone)}`}>{title} ({rows.length})</h3>
      {!rows.length ? <p className="text-xs text-primary-muted">No rows in this sample.</p> : (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={`${row.url}-${index}`} className="min-w-0">
              <p className="text-xs text-primary-text truncate" title={row.url}>{row.url}</p>
              {changed ? (
                <p className="text-[11px] text-primary-muted truncate">
                  Status {displayValue(row.oldStatusCode)} → {displayValue(row.newStatusCode)}
                  {' · '}Title {displayValue(row.oldTitle)} → {displayValue(row.newTitle)}
                </p>
              ) : (
                <p className="text-[11px] text-primary-muted">
                  Status {displayValue(row.newStatusCode ?? row.oldStatusCode)}
                  {' · '}Indexability {displayValue(row.newIndexability ?? row.oldIndexability)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function IssueChangeList({ title, rows, tone }: { title: string, rows: CrawlDiffIssueChange[], tone: 'good' | 'bad' }) {
  return (
    <div className="rounded border border-row bg-midnight/40 p-3 min-w-0">
      <h3 className={`text-xs uppercase tracking-wider font-semibold mb-2 ${toneClass(tone)}`}>{title} ({rows.length})</h3>
      {!rows.length ? <p className="text-xs text-primary-muted">No rows in this sample.</p> : (
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={`${row.url}-${row.message}-${index}`} className="min-w-0">
              <p className="text-xs text-primary-text truncate" title={row.url}>{row.url}</p>
              <p className="text-[11px] text-primary-muted truncate">
                <span className={severityClass(row.severity)}>{row.severity}</span>
                {' · '}{labelize(row.issueType || row.issue_type || '')}
                {' · '}{row.message}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BrokenLinkChangeList({ title, rows, tone }: { title: string, rows: CrawlDiffBrokenLinkChange[], tone: 'good' | 'bad' }) {
  return (
    <div className="rounded border border-row bg-midnight/40 p-3 min-w-0">
      <h3 className={`text-xs uppercase tracking-wider font-semibold mb-2 ${toneClass(tone)}`}>{title} ({rows.length})</h3>
      {!rows.length ? <p className="text-xs text-primary-muted">No rows in this sample.</p> : (
        <div className="space-y-2">
          {rows.map((row, index) => {
            const source = row.sourceUrl || row.source_url || ''
            const target = row.targetUrl || row.target_url || ''
            return (
              <div key={`${source}-${target}-${index}`} className="min-w-0">
                <p className="text-xs text-primary-text truncate" title={target}>{target}</p>
                <p className="text-[11px] text-primary-muted truncate" title={source}>
                  {displayValue(row.statusCode ?? row.status_code)} from {source}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function toneClass(tone: 'good' | 'bad' | 'warn') {
  if (tone === 'good') return 'text-emerald'
  if (tone === 'bad') return 'text-red-400'
  return 'text-amber-300'
}

function severityClass(severity: string) {
  return severity === 'critical' ? 'text-red-400 font-semibold' : severity === 'warning' ? 'text-amber-300' : 'text-primary-muted'
}

function labelize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function displayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}
