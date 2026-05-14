import { useState, useEffect } from 'react'
import { useProjectStore } from '../stores/project-store'

declare global { interface Window { crawldesk: any } }

interface Schedule {
  id: string
  project_id: string
  start_url: string
  cron_expression: string
  enabled: number
  last_run_at?: string | null
  next_run_at?: string | null
  created_at: string
}

export default function SchedulesScreen() {
  const { selectedProjectId } = useProjectStore()
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ startUrl: '', cronExpression: '' })
  const [saving, setSaving] = useState(false)

  async function loadSchedules() {
    if (!selectedProjectId) return
    setLoading(true)
    try {
      const list = await window.crawldesk.schedules.list(selectedProjectId)
      setSchedules(list || [])
    } catch (e: any) {
      console.error('[Schedules] Failed to load:', e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSchedules() }, [selectedProjectId])

  async function createSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedProjectId || !form.startUrl || !form.cronExpression) return
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
      loadSchedules()
    } catch (err: any) {
      console.error('[Schedules] Create failed:', err.message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    await window.crawldesk.schedules.update(id, { enabled })
    loadSchedules()
  }

  async function deleteSchedule(id: string) {
    await window.crawldesk.schedules.delete(id)
    loadSchedules()
  }

  return (
    <div>
      <h1 className="text-[30px] leading-none tracking-tight font-bold text-primary-text mb-2">Crawl Scheduling</h1>
      <p className="text-sm text-primary-muted mb-6">Set up recurring crawls with cron expressions. Compare results across runs to track SEO changes over time.</p>

      {/* New Schedule Form */}
      {!showForm ? (
        <button onClick={() => setShowForm(true)} className="btn-secondary !py-2 !px-4 text-sm mb-4">+ New Schedule</button>
      ) : (
        <form onSubmit={createSchedule} className="card p-4 mb-4 flex gap-3 items-end" style={{ borderRadius: '12px' }}>
          <div className="flex-1">
            <label className="block text-xs text-primary-muted uppercase tracking-wider mb-1">Start URL</label>
            <input value={form.startUrl} onChange={e => setForm(f => ({ ...f, startUrl: e.target.value }))} placeholder="https://example.com" className="input-field w-full !py-2 !text-sm" required />
          </div>
          <div className="w-48">
            <label className="block text-xs text-primary-muted uppercase tracking-wider mb-1">Cron Expression</label>
            <input value={form.cronExpression} onChange={e => setForm(f => ({ ...f, cronExpression: e.target.value }))} placeholder="0 2 * * *" className="input-field w-full !py-2 !text-sm" required />
          </div>
          <button type="submit" disabled={saving || !selectedProjectId} className="btn-primary !py-2 !px-4">{saving ? 'Saving...' : 'Save'}</button>
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

      {!loading && schedules.map(s => (
        <div key={s.id} className="card p-4 mb-3 flex items-start gap-4" style={{ borderRadius: '12px' }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <code className="font-mono text-teal-accent text-sm">{s.cron_expression}</code>
              <span className={`text-xs ${s.enabled ? 'text-emerald' : 'text-primary-muted'}`}>{s.enabled ? '● Active' : '○ Disabled'}</span>
            </div>
            <p className="text-sm text-primary-text truncate">{s.start_url}</p>
            <p className="text-xs text-primary-muted mt-1">
              Last run: {s.last_run_at ? new Date(s.last_run_at).toLocaleString() : 'Never'}
              {' · '}Next run: {s.next_run_at ? new Date(s.next_run_at).toLocaleString() : '—'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => toggleEnabled(s.id, !s.enabled)} className={`btn-secondary !py-1.5 !px-3 text-xs ${s.enabled ? '' : '!opacity-60'}`}>
              {s.enabled ? 'Disable' : 'Enable'}
            </button>
            <button onClick={() => deleteSchedule(s.id)} className="btn-secondary !py-1.5 !px-3 text-xs text-red-400 hover:text-red-300">Delete</button>
          </div>
        </div>
      ))}

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
  const [diffs, setDiffs] = useState<any[]>([])
  useEffect(() => {
    window.crawldesk.diff.listByProject(projectId).then(setDiffs).catch(() => {})
  }, [projectId])

  if (!diffs.length) return <p className="text-sm text-primary-muted">No diff data available yet — diffs appear after the second crawl on a project.</p>

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b border-row">
          <th className="py-2 px-3 text-left text-xs text-primary-muted uppercase tracking-wider font-medium">URL Count Δ</th>
          <th className="py-2 px-3 text-left text-xs text-primary-muted uppercase tracking-wider font-medium">New URLs</th>
          <th className="py-2 px-3 text-left text-xs text-primary-muted uppercase tracking-wider font-medium">Removed URLs</th>
          <th className="py-2 px-3 text-left text-xs text-primary-muted uppercase tracking-wider font-medium">Broken Links Δ</th>
          <th className="py-2 px-3 text-left text-xs text-primary-muted uppercase tracking-wider font-medium">Issues Δ</th>
          <th className="py-2 px-3 text-left text-xs text-primary-muted uppercase tracking-wider font-medium">Critical Δ</th>
          <th className="py-2 px-3 text-left text-xs text-primary-muted uppercase tracking-wider font-medium">Date</th>
        </tr>
      </thead>
      <tbody>
        {diffs.map((d: any) => (
          <tr key={d.id} className="border-b border-row hover:bg-[#0f1f2a] transition-colors">
            <td className={`py-2 px-3 ${d.url_count_delta >= 0 ? 'text-emerald' : 'text-red-400'}`}>{d.url_count_delta > 0 ? '+' : ''}{d.url_count_delta}</td>
            <td className="py-2 px-3 text-emerald">{d.new_urls_count}</td>
            <td className="py-2 px-3 text-red-400">{d.removed_urls_count}</td>
            <td className={`py-2 px-3 ${d.broken_links_delta <= 0 ? 'text-emerald' : 'text-red-400'}`}>{d.broken_links_delta > 0 ? '+' : ''}{d.broken_links_delta}</td>
            <td className={`py-2 px-3 ${d.issues_delta <= 0 ? 'text-emerald' : 'text-red-400'}`}>{d.issues_delta > 0 ? '+' : ''}{d.issues_delta}</td>
            <td className={`py-2 px-3 ${d.critical_issues_delta <= 0 ? 'text-emerald' : 'text-red-400 font-bold'}`}>{d.critical_issues_delta > 0 ? '+' : ''}{d.critical_issues_delta}</td>
            <td className="py-2 px-3 text-primary-muted text-xs">{new Date(d.created_at).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
