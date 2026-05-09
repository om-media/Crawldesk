import { useState, useEffect, useCallback } from 'react'
import { useProjectStore } from './stores/project-store'
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
  const { selectedProjectId, setActiveCrawlId } = useProjectStore()

  // Auto-resolve activeCrawlId when project changes
  useEffect(() => {
    if (!selectedProjectId) return
    async function resolveLatestCrawl() {
      try {
        const crawls = await window.crawldesk.crawls.listByProject(selectedProjectId)
        if (crawls && crawls.length > 0) setActiveCrawlId(crawls[0].id)
        else setActiveCrawlId(null)
      } catch { /* ignore */ }
    }
    resolveLatestCrawl()
  }, [selectedProjectId, setActiveCrawlId])

  const navigate = (r: Route) => setRoute(r)

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

  return (
    <div className="flex h-screen bg-midnight overflow-hidden">
      <Sidebar currentRoute={route} onNavigate={navigate} hasProject={!!selectedProjectId} />
      <main className="flex-1 overflow-auto">
        <div className="px-[28px] py-[20px] max-w-[1680px] mx-auto">
          {renderContent()}
        </div>
      </main>
    </div>
  )
}
