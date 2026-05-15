import { useState, useEffect } from 'react'
import { useProjectStore } from '../stores/project-store'
import { useCrawlStore } from '../stores/crawl-store'
import type { Route } from '@shared/types/route'

interface Props { onNavigate?: (route: Route) => void }


export default function ProjectsScreen({ onNavigate }: Props) {
  const { projects, setProjects, setSelectedProjectId, setActiveCrawlId, selectedProjectId } = useProjectStore()
  const resetCrawlProgress = useCrawlStore(s => s.reset)
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<any | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => { loadProjects() }, [])

  async function loadProjects() {
    try {
      if (!window.crawldesk) {
        console.error('[ProjectsScreen] window.crawldesk is not available!')
        setProjects([])
        return
      }
      const list = await window.crawldesk.projects.list()
      setProjects(list || [])
    } catch (err) {
      console.error('[ProjectsScreen] Failed to load projects:', err)
    } finally { setLoading(false) }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setUrlError('')
    if (!name.trim() || !url.trim()) return
    try {
      new URL(url.startsWith('http') ? url : `https://${url}`)
    } catch {
      setUrlError('Please enter a valid URL (e.g. https://example.com)')
      return
    }
    try {
      const project = await window.crawldesk.projects.create({ name: name.trim(), rootUrl: url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}` })
      if (project) { setSelectedProjectId(project.id); loadProjects(); setShowModal(false); setName(''); setUrl(''); setUrlError(''); if (onNavigate) onNavigate('overview') }
    } catch (err) {
      console.error('[Renderer] Failed to create project:', err)
      setUrlError(err instanceof Error ? err.message : String(err))
    }
  }

  async function openProject(id: string) { setSelectedProjectId(id); if (onNavigate) onNavigate('overview') }

  async function confirmDeleteProject() {
    if (!pendingDelete) return
    const id = pendingDelete.id
    setDeletingId(id)
    setDeleteError(null)
    try {
      await window.crawldesk.projects.delete(id)
      if (selectedProjectId === id) {
        setSelectedProjectId(null)
        setActiveCrawlId(null)
        resetCrawlProgress()
      }
      setPendingDelete(null)
      await loadProjects()
    } catch (e: any) {
      setDeleteError(e?.message || 'Failed to delete project')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin h-8 w-8 border-2 border-teal-accent border-t-transparent rounded-full"></div></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-[30px] font-bold text-primary-text tracking-tight leading-none">Projects</h1>
        <button onClick={() => setShowModal(true)} className="btn-primary">+ New Project</button>
      </div>

      {projects.length === 0 ? (
        <div className="card text-center py-20" style={{ borderRadius: '14px' }}>
          <p className="text-xl font-semibold text-primary-text">No projects yet.</p>
          <p className="text-sm text-primary-muted mt-2 max-w-md mx-auto">Create your first project and start crawling a website locally.</p>
          <button onClick={() => setShowModal(true)} className="btn-primary mt-6 px-6 py-3">Create First Project</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(p => (
            <div key={p.id} className={`card hover:border-teal-accent/50 transition-all cursor-pointer ${selectedProjectId === p.id ? '!border-teal-accent !bg-teal-bg/30' : ''}`} onClick={() => openProject(p.id)}>
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-primary-text">{p.name}</h3>
                <span className="pill-neutral text-[10px] font-medium">{selectedProjectId === p.id ? 'Selected' : 'Project'}</span>
              </div>
              <a href={p.root_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs font-medium truncate block mt-1" style={{ color: '#3B82F6' }}>{p.root_url}</a>
              <div className="flex items-center gap-3 mt-4 text-xs text-primary-muted border-t border-row pt-3">
                {p.lastCrawlUrlCount != null && <span>{p.lastCrawlUrlCount.toLocaleString()} URLs</span>}
                {p.lastCrawlIssueCount != null && <span>{p.lastCrawlIssueCount} issues</span>}
              </div>
              <div className="mt-3 flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => { setPendingDelete(p); setDeleteError(null) }} className="btn-danger !py-1.5 !px-3 !text-xs rounded-lg">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Project Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]" onClick={() => { setShowModal(false); setUrlError('') }}>
          <div className="bg-panel-dark border border-lumen rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()} style={{ borderRadius: '14px' }}>
            <h2 className="text-lg font-bold text-primary-text mb-5">New Project</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs text-primary-muted uppercase tracking-wider font-semibold mb-1.5">Project Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="My Website Audit" className="input-field" required autoFocus />
              </div>
              <div>
                <label className="block text-xs text-primary-muted uppercase tracking-wider font-semibold mb-1.5">Website URL</label>
                <input value={url} onChange={e => { setUrl(e.target.value); setUrlError('') }} placeholder="https://example.com" className="input-field" required />
                {urlError && <p className="text-xs text-red-400 mt-1">{urlError}</p>}
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <button type="button" onClick={() => { setShowModal(false); setUrlError('') }} className="btn-secondary py-2 px-4 rounded-lg text-xs">Cancel</button>
                <button type="submit" className="btn-primary py-2 px-5">Create Project</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]" onClick={() => { if (!deletingId) setPendingDelete(null) }}>
          <div className="bg-panel-dark border border-lumen rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()} style={{ borderRadius: '14px' }}>
            <h2 className="text-lg font-bold text-primary-text mb-2">Delete project?</h2>
            <p className="text-sm text-primary-muted mb-4">
              This will permanently delete <span className="text-primary-text font-semibold">{pendingDelete.name}</span> and all crawl data for it.
            </p>
            {deleteError && <div className="mb-4 rounded-md border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">{deleteError}</div>}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => { setPendingDelete(null); setDeleteError(null) }}
                className="btn-secondary py-2 px-4 rounded-lg text-xs"
                disabled={deletingId === pendingDelete.id}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteProject}
                className="btn-danger py-2 px-5"
                disabled={deletingId === pendingDelete.id}
              >
                {deletingId === pendingDelete.id ? 'Deleting' : 'Delete project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
