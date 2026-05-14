import React from 'react'
import { useProjectStore } from '../../stores/project-store'

interface SidebarProps {
  currentRoute: string
  onNavigate: (route: string) => void
  hasProject: boolean
}

type NavItem = { id: string; label: string; icon: string; count?: string; disabled?: boolean }

const projectNavItems: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: '▦' },
  { id: 'results', label: 'All URLs', icon: '│', count: '10,431' },
  { id: 'issues', label: 'Issues', icon: '△', count: '256' },
  { id: 'setup', label: 'Pages', icon: '▧', count: '10,431' },
  { id: 'links', label: 'Links', icon: '↗', count: '32,921' },
  { id: 'exports', label: 'Images', icon: '□', count: '4,289' },
  { id: 'javascript', label: 'JavaScript', icon: '┼', count: '1,102', disabled: true },
  { id: 'sitemaps', label: 'Sitemaps', icon: '⊕', count: '8', disabled: true },
  { id: 'performance', label: 'Performance', icon: '◉' },
]

export default function Sidebar({ currentRoute, onNavigate }: SidebarProps) {
  const { selectedProjectId, projects } = useProjectStore()
  const project = projects.find(p => p.id === selectedProjectId)

  // Keyboard navigation: arrow keys move focus between nav items
  const handleKeyDown = (e: React.KeyboardEvent<HTMLNavElement>) => {
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
          <h1 className="truncate text-[18px] font-bold leading-none tracking-normal text-primary-text">OpenCrawler</h1>
          <span className="rounded-full border border-lumen bg-panel-dark px-2 py-0.5 text-[11px] font-semibold text-primary-muted">v1.0.0</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 space-y-1" onKeyDown={handleKeyDown}>
        {projectNavItems.map(item => {
          const isActive = currentRoute === item.id
          const disabled = item.disabled || !selectedProjectId
          return (
            <button
              key={item.id}
              data-sidebar-nav
              onClick={() => !item.disabled && onNavigate(item.id)}
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
          {(projects.length ? projects : [{ id: 'demo', name: 'Aventerra Park', root_url: '', created_at: '', updated_at: '' }]).slice(0, 3).map((p) => (
            <div key={p.id} className={`mt-1 flex items-center justify-between rounded px-2 py-1.5 text-[13px] ${p.id === selectedProjectId ? 'bg-teal-bg text-primary-text' : 'text-primary-muted'}`}>
              <span className="truncate">▧ {p.name}</span>
              {p.id === selectedProjectId && <span className="text-emerald">●</span>}
            </div>
          ))}
        </button>
      </div>

      <div className="border-t border-lumen px-5 py-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#303941] text-sm font-bold text-primary-text">AD</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-primary-text">Alex Developer</div>
            <div className="truncate text-xs text-primary-muted">alex@example.com</div>
          </div>
          <span className="ml-auto text-primary-muted">⌄</span>
        </div>
        <button className="flex w-full items-center justify-between rounded-md border border-lumen bg-panel-dark px-3 py-2.5 text-sm text-primary-text">
          <span>◔ Dark Mode</span>
          <span>⌃</span>
        </button>
      </div>
    </aside>
  )
}
