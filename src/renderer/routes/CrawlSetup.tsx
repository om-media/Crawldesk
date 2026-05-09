import { useState, useEffect } from 'react'
import { useProjectStore } from '../stores/project-store'
import { DEFAULT_CRAWL_SETTINGS } from '@shared/types/crawl'

interface Props { onComplete: () => void }
declare global { interface Window { crawldesk: any } }

export default function CrawlSetup({ onComplete }: Props) {
  const { selectedProjectId, setActiveCrawlId, projects } = useProjectStore()
  const project = projects.find(p => p.id === selectedProjectId)
  const [settings, setSettings] = useState({
    startUrl: '',
    maxUrls: DEFAULT_CRAWL_SETTINGS.maxUrls,
    maxDepth: DEFAULT_CRAWL_SETTINGS.maxDepth,
    concurrency: DEFAULT_CRAWL_SETTINGS.concurrency,
    requestTimeoutMs: DEFAULT_CRAWL_SETTINGS.requestTimeoutMs,
    respectRobotsTxt: true,
    crawlSubdomains: false,
    checkExternalLinks: true,
    crawlExternalLinks: false,
    userAgent: DEFAULT_CRAWL_SETTINGS.userAgent,
    includePatterns: '',
    excludePatterns: '',
  })

  // Pre-fill start URL from project's root_url
  useEffect(() => {
    if (project?.root_url && !settings.startUrl) {
      setSettings(s => ({ ...s, startUrl: project.root_url }))
    }
  }, [project])
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleStart(e: React.FormEvent) {
    e.preventDefault()
    console.log('[UI] handleStart called. selectedProjectId:', selectedProjectId, 'crawldesk API exists:', !!window.crawldesk)
    if (!selectedProjectId) {
      setError('No project selected. Please create/select a project from the sidebar first.')
      return
    }
    setError('')

    // Validate
    try { new URL(settings.startUrl) } catch { setError('Invalid start URL'); return }
    if (settings.concurrency > 20) { setError('Concurrency cannot exceed 20 in this version.'); return }
    if (settings.maxUrls < 1 || settings.maxUrls > 500000) { setError('Max URLs must be between 1 and 500,000.'); return }

    setCreating(true)
    try {
      const includePats = settings.includePatterns.split('\n').filter(Boolean).map(s => s.trim())
      const excludePats = settings.excludePatterns.split('\n').filter(Boolean).map(s => s.trim())
      const payload = { ...settings, startUrl: settings.startUrl, includePatterns: includePats, excludePatterns: excludePats }
      console.log('[UI] Creating crawl... payload keys:', Object.keys(payload))
      const crawl = await window.crawldesk.crawls.create(selectedProjectId, payload)
      console.log('[UI] Crawl created:', crawl?.id)
      setActiveCrawlId(crawl.id)
      console.log('[UI] Starting crawl worker for', crawl.id, '...')
      await window.crawldesk.crawls.start(crawl.id)
      console.log('[UI] Crawl started successfully!')
      onComplete()
    } catch (err: any) {
      console.error('[UI] Failed to start crawl:', err, err.stack)
      setError(err?.message || String(err) || 'Failed to start crawl')
    } finally {
      setCreating(false)
    }
  }

  const toggle = (key: string) => () => setSettings(s => ({ ...s, [key]: !s[key as keyof typeof s] }))
  const input = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setSettings(s => ({ ...s, [key]: e.target.value }))

  const numInput = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSettings(s => ({ ...s, [key]: parseInt(e.target.value) || 0 }))

  return (
    <div className="max-w-3xl">
      <h1 className="text-[30px] leading-none tracking-tight font-bold text-primary-text mb-6">Crawl Setup</h1>
      <form onSubmit={handleStart} className="space-y-6">
        {error && <div className="bg-[#3b171b] border border-red-900 rounded-lg p-3 text-sm text-red-400">{error}</div>}

        {/* Start URL */}
        <div className="card">
          <h2 className="text-xs uppercase font-semibold text-primary-muted mb-4">Target Website</h2>
          <label className="block text-sm font-medium text-primary-muted mb-1">Start URL *</label>
          <input value={settings.startUrl} onChange={input('startUrl')} placeholder="https://example.com" className="input-field" type="url" required />
        </div>

        {/* Limits */}
        <div className="grid grid-cols-2 gap-4">
          <div className="kpi-card"><label className="block text-xs font-medium text-primary-muted uppercase tracking-wider mb-1">Max URLs</label><input type="number" value={settings.maxUrls} onChange={numInput('maxUrls')} min={1} max={500000} className="!text-lg font-semibold input-field text-primary-text" /></div>
          <div className="kpi-card"><label className="block text-xs font-medium text-primary-muted uppercase tracking-wider mb-1">Max Depth</label><input type="number" value={settings.maxDepth} onChange={numInput('maxDepth')} min={0} max={20} className="!text-lg font-semibold input-field text-primary-text" /></div>
          <div className="kpi-card"><label className="block text-xs font-medium text-primary-muted uppercase tracking-wider mb-1">Concurrency (max 20)</label><input type="number" value={settings.concurrency} onChange={numInput('concurrency')} min={1} max={20} className="!text-lg font-semibold input-field text-primary-text" /></div>
          <div className="kpi-card"><label className="block text-xs font-medium text-primary-muted uppercase tracking-wider mb-1">Timeout (ms)</label><input type="number" value={settings.requestTimeoutMs} onChange={numInput('requestTimeoutMs')} min={1000} max={60000} step={1000} className="!text-lg font-semibold input-field text-primary-text" /></div>
        </div>

        {/* Toggles */}
        <div className="card">
          <h2 className="text-xs uppercase font-semibold text-primary-muted mb-3">Crawl Behavior</h2>
          <div className="space-y-3">
            {[
              { label: 'Respect robots.txt', key: 'respectRobotsTxt' },
              { label: 'Crawl Subdomains', key: 'crawlSubdomains' },
              { label: 'Check External Links', key: 'checkExternalLinks' },
              { label: 'Crawl External Links', key: 'crawlExternalLinks' },
            ].map(({ label, key }) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={!!(settings as any)[key]} onChange={() => setSettings(s => ({ ...s, [key]: !s[key as keyof typeof s] }))} className="w-4 h-4 rounded border-lumen text-teal-accent bg-panel-dark" />
                <span className="text-sm text-primary-text">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* User Agent */}
        <div className="kpi-card">
          <label className="block text-xs font-medium text-primary-muted uppercase tracking-wider mb-1">User Agent</label>
          <input value={settings.userAgent} onChange={input('userAgent')} className="input-field" />
        </div>

        {/* Patterns */}
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-xs font-medium text-primary-muted uppercase tracking-wider mb-1">Include Patterns (one per line)</label><textarea rows={3} value={settings.includePatterns} onChange={input('includePatterns')} placeholder="/blog/*" className="input-field" /></div>
          <div><label className="block text-xs font-medium text-primary-muted uppercase tracking-wider mb-1">Exclude Patterns (one per line)</label><textarea rows={3} value={settings.excludePatterns} onChange={input('excludePatterns')} placeholder="*/tag/*" className="input-field" /></div>
        </div>

        <button type="submit" disabled={creating} className="btn-primary w-full py-3 text-base">{creating ? 'Starting...' : 'Start Crawl'}</button>
      </form>
    </div>
  )
}
