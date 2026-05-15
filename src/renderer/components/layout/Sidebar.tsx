import React from 'react'
import { useProjectStore } from '../../stores/project-store'
import type { Route } from '@shared/types/route'

interface SidebarProps {
  currentRoute: Route
  onNavigate: (route: Route) => void
  hasProject: boolean
}

type NavItem = { id: Route; label: string; icon: string; count?: string; disabled?: boolean }

const projectNavItems: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: '▦' },
  { id: 'results', label: 'All URLs', icon: '│' },
  { id: 'issues', label: 'Issues', icon: '△' },
  { id: 'keywords', label: 'Keywords', icon: '#' },
  { id: 'clusters', label: 'Clusters', icon: '◎' },
  { id: 'setup', label: 'Crawl Setup', icon: '▧' },
  { id: 'links', label: 'Links', icon: '↗' },
  { id: 'exports', label: 'Exports', icon: '□' },
  { id: 'javascript', label: 'JavaScript', icon: '┼', disabled: true },
  { id: 'sitemaps', label: 'Sitemaps', icon: '⊕', disabled: true },
  { id: 'performance', label: 'Performance', icon: '◉', disabled: true },
]

export default function Sidebar({ currentRoute, onNavigate }: SidebarProps) {
  const { selectedProjectId, projects } = useProjectStore()
  const project = projects.find(p => p.id === selectedProjectId)
  const [version, setVersion] = React.useState('v0.1')

  React.useEffect(() => {
    let disposed = false

    window.crawldesk?.app?.getVersion?.()
      .then((value: string) => {
        if (!disposed && value) setVersion(value.startsWith('v') ? value : `v${value}`)
      })
      .catch(() => {})

    return () => {
      disposed = true
    }
  }, [])

  // Keyboard navigation: arrow keys move focus between nav items
  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const buttons = Array.from(document.querySelectorAll('[data-sidebar-nav]:not(:disabled)')) as HTMLButtonElement[]
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement)
    let nextIndex: number
    if (e.key === 'ArrowDown') {
      nextIndex = currentIndex < buttons.length - 1 ? currentIndex + 1 : 0
    } else {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : buttons.length - 1
    }
    buttons[nextIndex]?.focus()
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-[260px] min-w-[260px] flex-col border-r border-lumen bg-sidebar/95 shadow-2xl shadow-black/25">
      <div className="px-6 pb-4 pt-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="brand-mark" aria-hidden="true">☘</div>
          <h1 className="truncate text-[18px] font-bold leading-none tracking-normal text-primary-text">CrawlDesk</h1>
          <span className="rounded-full border border-lumen bg-panel-dark px-2 py-0.5 text-[11px] font-semibold text-primary-muted">{version}</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 space-y-1" onKeyDown={handleKeyDown}>
        {projectNavItems.filter(item => !item.disabled).map(item => {
          const isActive = currentRoute === item.id
          const disabled = !selectedProjectId
          return (
            <button
              key={item.id}
              data-sidebar-nav
              onClick={() => onNavigate(item.id)}
              disabled={disabled}
              aria-current={isActive ? 'page' : undefined}
              className={`sidebar-item ${isActive ? 'sidebar-item-active' : ''} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <span className="sidebar-icon" aria-hidden="true">{item.icon}</span>
              <span className="truncate">{item.label}</span>
              {item.count && <span className="sidebar-count">{item.count}</span>}
            </button>
          )
        })}

        <button
          data-sidebar-nav
          onClick={() => onNavigate('settings')}
          aria-current={currentRoute === 'settings' ? 'page' : undefined}
          className={`sidebar-item ${currentRoute === 'settings' ? 'sidebar-item-active' : ''}`}
        >
          <span className="sidebar-icon" aria-hidden="true">⚙</span>
          <span>Settings</span>
        </button>
      </nav>

      <div className="px-4 pb-3">
        <button
          data-sidebar-nav
          onClick={() => onNavigate('projects')}
          className={`w-full rounded-md border border-lumen bg-panel-dark p-3 text-left transition-colors hover:bg-midnight/40 ${currentRoute === 'projects' ? 'ring-1 ring-teal-accent/50' : ''}`}
        >
          <div className="mb-2 flex items-center justify-between text-xs text-primary-muted">
            <span>Projects</span>
            <span>⌄</span>
          </div>
          {(projects.length > 0 ? projects.slice(0, 3).map((p) => (
            <div key={p.id} className={`mt-1 flex items-center justify-between rounded px-2 py-1.5 text-[13px] ${p.id === selectedProjectId ? 'bg-teal-bg text-primary-text' : 'text-primary-muted'}`}>
              <span className="truncate">▧ {p.name}</span>
              {p.id === selectedProjectId && <span className="text-emerald">●</span>}
            </div>
          )) : (
            <p className="mt-1 text-xs text-primary-muted px-2">No projects yet</p>
          ))}
        </button>
      </div>

      <div className="border-t border-lumen px-5 py-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#303941] text-sm font-bold text-primary-text">CD</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-primary-text">CrawlDesk</div>
            <div className="truncate text-xs text-primary-muted">{version}</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
