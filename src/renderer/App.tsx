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
import PerformanceScreen from './routes/PerformanceScreen'
import ExportsScreen from './routes/ExportsScreen'
import SettingsScreen from './routes/SettingsScreen'
import ClientErrorsScreen from './routes/ClientErrorsScreen'
import KeywordsScreen from './routes/KeywordsScreen'
import ContentAuditScreen from './routes/ContentAuditScreen'
import ClustersScreen from './routes/ClustersScreen'
import { selectBestCrawlId } from './utils/crawl-selection'

import type { Route } from '@shared/types/route'

export default function App() {
  const [route, setRoute] = useState<Route>('projects')
  const [backendReady, setBackendReady] = useState(() => Boolean(window.crawldesk))
  const { selectedProjectId, projects, activeCrawlId } = useProjectStore()
  const selectedProject = projects.find(p => p.id === selectedProjectId)
  const [targetUrl, setTargetUrl] = useState('')
  const [toolbarError, setToolbarError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const updateProgress = useCrawlStore(s => s.updateProgress)
  const resetCrawlProgress = useCrawlStore(s => s.reset)
  const crawlProgress = useCrawlStore(s => s.progress)

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
        useProjectStore.getState().setActiveCrawlId(selectBestCrawlId(crawls as any[]))
      } catch (err) { console.error('[App] Failed to resolve latest crawl:', err) }
    }
    resolveLatestCrawl()
  }, [backendReady, selectedProjectId])

  useEffect(() => {
    if (selectedProject?.root_url) setTargetUrl(selectedProject.root_url)
  }, [selectedProject?.root_url])

  const navigate = useCallback((r: Route) => setRoute(r), [])
  const handleLiveCompleted = useCallback(() => setRoute('results'), [])

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
        respectSitemaps: true,
        crawlSubdomains: false,
        checkExternalLinks: true,
        crawlExternalLinks: false,
        userAgent: 'CrawlDeskBot/0.1',
        includePatterns: [],
        excludePatterns: [],
      })
      useProjectStore.getState().setActiveCrawlId(crawl.id)
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
      case 'overview': return <ProjectOverview crawlId={activeCrawlId} onNavigate={navigate} />
      case 'setup': return <CrawlSetup onComplete={() => navigate('live')} />
      case 'live': return <LiveCrawl onCompleted={handleLiveCompleted} />
      case 'results': return <ResultsScreen />
      case 'issues': return <IssuesScreen />
      case 'links': return <LinksScreen />
      case 'performance': return <PerformanceScreen />
      case 'exports': return <ExportsScreen />
      case 'settings': return <SettingsScreen />
      case 'client-errors': return <ClientErrorsScreen />
      case 'keywords': return <KeywordsScreen />
      case 'content': return <ContentAuditScreen />
      case 'clusters': return <ClustersScreen />
      default: return <ProjectsScreen onNavigate={navigate} />
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
          <button className="icon-button" title="Crawl settings" onClick={() => selectedProjectId ? navigate('setup') : navigate('settings')}>⚙</button>
          <button className="start-button" onClick={startToolbarCrawl} disabled={isStarting}>
            <span>▷</span>{isStarting ? 'Starting' : 'Start Crawl'}
          </button>
          {activeCrawlId && crawlProgress?.status === 'running' && (
            <button className="toolbar-button" onClick={async () => {
              try { await window.crawldesk.crawls.pause(activeCrawlId); useCrawlStore.getState().updateProgress({ status: 'paused' }) } catch {}
            }}>Ⅱ Pause</button>
          )}
          {activeCrawlId && crawlProgress?.status === 'paused' && (
            <button className="toolbar-button" onClick={async () => {
              try { await window.crawldesk.crawls.resume(activeCrawlId); useCrawlStore.getState().updateProgress({ status: 'running' }) } catch {}
            }}>▶ Resume</button>
          )}
          {activeCrawlId && (
            <button className="toolbar-button" onClick={() => { useProjectStore.getState().setActiveCrawlId(null); resetCrawlProgress() }}>⌫ Clear</button>
          )}
          <div className="crawl-state">
            <span style={{ color: activeCrawlId ? (crawlProgress?.status === 'running' ? '#10b981' : crawlProgress?.status === 'paused' ? '#f59e0b' : '#89a4aa') : '#89a4aa' }}>
              ● {activeCrawlId ? (crawlProgress?.status === 'running' ? 'Crawling' : crawlProgress?.status === 'paused' ? 'Paused' : 'Completed') : 'Idle'}
            </span>
          </div>
        </header>
        {toolbarError && <div className="mx-6 mt-3 rounded-md border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">{toolbarError}</div>}
        <div className="flex-1 overflow-auto px-5 py-4">
          <div className="mx-auto max-w-[1680px]">
            {renderContent()}
          </div>
        </div>
        <footer className="status-bar">
          <span style={{ color: activeCrawlId ? (crawlProgress?.status === 'running' ? '#10b981' : crawlProgress?.status === 'paused' ? '#f59e0b' : '#89a4aa') : '#89a4aa' }}>
            ● {activeCrawlId ? (crawlProgress?.status === 'running' ? 'Crawling' : crawlProgress?.status === 'paused' ? 'Paused' : 'Completed') : 'Ready'}
          </span>
          <span>|</span>
          <span>{selectedProject?.name || 'No project selected'}</span>
          <span>|</span>
          <span>Average: {crawlProgress?.avgResponseTimeMs ? `${Math.round(crawlProgress.avgResponseTimeMs)} ms` : '-- ms'}</span>
          <span>|</span>
          <span>Current: {crawlProgress?.urlsPerMinute ? `${crawlProgress.urlsPerMinute.toFixed(1)} url/min` : '--'}</span>
        </footer>
      </main>
    </div>
  )
}
