import { useState, useEffect, useCallback } from 'react'
import { useProjectStore } from './stores/project-store'
import { useCrawlStore } from './stores/crawl-store'
import Sidebar from './components/layout/Sidebar'
import ProjectsScreen from './routes/ProjectsScreen'
import ProjectOverview from './routes/ProjectOverview'
import CrawlSetup from './routes/CrawlSetup'
import LiveCrawl from './routes/LiveCrawl'
import ResultsScreen from './routes/ResultsScreen'
import IssuesScreen from './routes/IssuesScreen'
import LinksScreen from './routes/LinksScreen'
import ExportsScreen from './routes/ExportsScreen'
import SettingsScreen from './routes/SettingsScreen'

type Route = 'projects' | 'overview' | 'setup' | 'live' | 'results' | 'issues' | 'links' | 'exports' | 'settings'

declare global { interface Window { crawldesk: any } }

export default function App() {
  const [route, setRoute] = useState<Route>('projects')
  const [backendReady, setBackendReady] = useState(() => Boolean(window.crawldesk))
  const { selectedProjectId, setActiveCrawlId, projects } = useProjectStore()
  const selectedProject = projects.find(p => p.id === selectedProjectId)
  const [targetUrl, setTargetUrl] = useState('')
  const [toolbarError, setToolbarError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const updateProgress = useCrawlStore(s => s.updateProgress)
  const resetCrawlProgress = useCrawlStore(s => s.reset)

  useEffect(() => {
    if (window.crawldesk) {
      setBackendReady(true)
      return
    }

    const handleReady = () => setBackendReady(true)
    window.addEventListener('crawldesk:ready', handleReady)
    return () => window.removeEventListener('crawldesk:ready', handleReady)
  }, [])

  // Auto-resolve activeCrawlId when project changes
  useEffect(() => {
    if (!backendReady || !selectedProjectId || !window.crawldesk) return
    async function resolveLatestCrawl() {
      try {
        const crawls = await window.crawldesk.crawls.listByProject(selectedProjectId)
        if (crawls && crawls.length > 0) setActiveCrawlId(crawls[0].id)
        else setActiveCrawlId(null)
      } catch (err) { console.error('[App] Failed to resolve latest crawl:', err) }
    }
    resolveLatestCrawl()
  }, [backendReady, selectedProjectId, setActiveCrawlId])

  useEffect(() => {
    if (selectedProject?.root_url) setTargetUrl(selectedProject.root_url)
  }, [selectedProject?.root_url])

  const navigate = (r: Route) => setRoute(r)

  const startToolbarCrawl = async () => {
    setToolbarError(null)
    if (!window.crawldesk) {
      setToolbarError('Backend not connected. Please restart the app.')
      return
    }
    if (!selectedProjectId) {
      setRoute('projects')
      setToolbarError('Select or create a project first.')
      return
    }
    try {
      new URL(targetUrl)
    } catch {
      setToolbarError('Enter a valid URL.')
      return
    }
    setIsStarting(true)
    try {
      resetCrawlProgress()
      const crawl = await window.crawldesk.crawls.create(selectedProjectId, {
        startUrl: targetUrl,
        maxUrls: 10000,
        maxDepth: 10,
        concurrency: 10,
        delayBetweenRequestsMs: 0,
        requestTimeoutMs: 15000,
        respectRobotsTxt: true,
        crawlSubdomains: false,
        checkExternalLinks: true,
        crawlExternalLinks: false,
        userAgent: 'CrawlDeskBot/0.1',
        includePatterns: [],
        excludePatterns: [],
      })
      setActiveCrawlId(crawl.id)
      updateProgress({
        crawlId: crawl.id,
        status: 'running',
        totalDiscovered: 1,
        totalQueued: 1,
        totalCompleted: 0,
        totalFailed: 0,
        totalBlocked: 0,
        elapsedTimeSeconds: 0,
      })
      setRoute('live')
    } catch (err: any) {
      setToolbarError(err?.message || String(err))
    } finally {
      setIsStarting(false)
    }
  }

  const renderContent = () => {
    if (!selectedProjectId && route !== 'projects' && route !== 'settings') return <ProjectsScreen />
    switch (route) {
      case 'projects': return <ProjectsScreen onNavigate={navigate} />
      case 'overview': return <ProjectOverview crawlId={useProjectStore.getState().activeCrawlId} onNavigate={navigate} />
      case 'setup': return <CrawlSetup onComplete={() => navigate('live')} />
      case 'live': return <LiveCrawl onCompleted={() => navigate('results')} />
      case 'results': return <ResultsScreen />
      case 'issues': return <IssuesScreen />
      case 'links': return <LinksScreen />
      case 'exports': return <ExportsScreen />
      case 'settings': return <SettingsScreen />
      default: return <ProjectsScreen />
    }
  }

  if (!backendReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#090f14] text-primary-muted">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-teal-accent border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-sm">Connecting to backend...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell h-screen overflow-hidden bg-[#090f14] text-primary-text">
      <Sidebar currentRoute={route} onNavigate={navigate} hasProject={!!selectedProjectId} />
      <main className="ml-[260px] flex h-screen flex-col overflow-hidden">
        <header className="app-topbar">
          <div className="url-field">
            <span className="url-icon">◎</span>
            <input
              value={targetUrl}
              onChange={e => setTargetUrl(e.target.value)}
              placeholder="https://example.com/"
              aria-label="Crawl URL"
            />
            <span className="url-caret">⌄</span>
          </div>
          <button className="icon-button" title="Crawl settings">⚙</button>
          <button className="icon-button" title="Add URL">＋</button>
          <button className="start-button" onClick={startToolbarCrawl} disabled={isStarting}>
            <span>▷</span>{isStarting ? 'Starting' : 'Start Crawl'}
          </button>
          <button className="toolbar-button" onClick={() => navigate('live')}>Ⅱ Pause</button>
          <button className="toolbar-button" onClick={() => setActiveCrawlId(null)}>⌫ Clear</button>
          <button className="icon-button">⋮</button>
          <div className="crawl-state"><span /> Crawl Idle</div>
        </header>
        {toolbarError && <div className="mx-6 mt-3 rounded-md border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">{toolbarError}</div>}
        <div className="flex-1 overflow-auto px-5 py-4">
          <div className="mx-auto max-w-[1680px]">
            {renderContent()}
          </div>
        </div>
        <footer className="status-bar">
          <span className="text-emerald">● Crawl ready</span>
          <span>|</span>
          <span>{selectedProject?.name || 'No project selected'}</span>
          <span>|</span>
          <span>{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          <span className="ml-auto">Average: -- ms</span>
          <span>|</span>
          <span>Current: -- ms</span>
        </footer>
      </main>
    </div>
  )
}
