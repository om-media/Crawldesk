import React from 'react'
import { useProjectStore } from '../../stores/project-store'

interface SidebarProps {
  currentRoute: string
  onNavigate: (route: string) => void
  hasProject: boolean
}

type NavItem = { id: string; label: string; icon: string }

const projectNavItems: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: '⌂' },
  { id: 'setup', label: 'Crawls', icon: '☁' },
  { id: 'results', label: 'URLs', icon: '◉' },
  { id: 'issues', label: 'Issues', icon: '△' },
  { id: 'links', label: 'Links', icon: '↗' },
  { id: 'exports', label: 'Exports', icon: '▧' },
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
    <aside className="w-[240px] min-w-[240px] bg-sidebar border-r border-lumen flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 pt-6 pb-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-accent flex items-center justify-center relative overflow-hidden" aria-hidden="true">
            <div className="w-4 h-4 rounded-full bg-[#063b37]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-primary-text tracking-tight leading-none">LumenCrawl</h1>
            <p className="text-[11px] text-primary-muted mt-0.5 font-medium">Enterprise Edition</p>
          </div>
        </div>
      </div>

      {/* Project selector */}
      <div className="px-3 py-2">
        <button
          data-sidebar-nav
          onClick={() => onNavigate('projects')}
          className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all ${currentRoute === 'projects' ? 'bg-teal-bg border border-lumen' : 'hover:bg-midnight/40'} border-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-accent`}
        >
          <span className="text-primary-muted text-xs uppercase tracking-wider font-semibold">Projects</span>
          {project && (
            <p className="text-sm font-semibold text-primary-text truncate mt-0.5">{project.name}</p>
          )}
        </button>
      </div>

      {/* Divider */}
      <div className="mx-5 my-2 border-t border-lumen/60" />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-[2px]" onKeyDown={handleKeyDown}>
        {projectNavItems.map(item => {
          const isActive = currentRoute === item.id
          return (
            <button
              key={item.id}
              data-sidebar-nav
              onClick={() => onNavigate(item.id)}
              disabled={!selectedProjectId}
              aria-current={isActive ? 'page' : undefined}
              className={`relative w-full flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-[12px] text-sm transition-all ${isActive ? 'bg-teal-bg' : 'hover:bg-midnight/30'} ${!selectedProjectId ? 'opacity-40 cursor-not-allowed' : ''} focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-accent`}
            >
              {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-teal-accent" />}
              <span className={`${isActive ? 'text-teal-accent' : 'text-primary-muted'} text-lg leading-none`} aria-hidden="true">{item.icon}</span>
              <span className={`${isActive ? 'text-primary-text font-semibold' : 'text-primary-muted font-medium'}`}>
                {item.label}
              </span>
            </button>
          )
        })}
      </nav>

      {/* Settings at bottom */}
      <div className="p-3 border-t border-lumen/60">
        <button
          data-sidebar-nav
          onClick={() => onNavigate('settings')}
          aria-current={currentRoute === 'settings' ? 'page' : undefined}
          className={`relative w-full flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-[12px] text-sm transition-all ${currentRoute === 'settings' ? 'bg-teal-bg' : 'hover:bg-midnight/30'} focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-accent`}
        >
          {currentRoute === 'settings' && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-teal-accent" />}
          <span className={currentRoute === 'settings' ? 'text-teal-accent' : 'text-primary-muted'} style={{ fontSize: '16px' }} aria-hidden="true">⚙</span>
          <span className={currentRoute === 'settings' ? 'text-primary-text font-semibold' : 'text-primary-muted font-medium'}>Settings</span>
        </button>
      </div>
    </aside>
  )
}
