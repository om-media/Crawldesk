import { create } from 'zustand'

export interface Project {
  id: string
  name: string
  root_url: string
  created_at: string
  updated_at: string
  lastCrawlDate?: string | null
  lastCrawlUrlCount?: number | null
  lastCrawlIssueCount?: number | null
}

interface ProjectState {
  selectedProjectId: string | null
  projects: Project[]
  activeCrawlId: string | null
  setSelectedProjectId: (id: string | null) => void
  setProjects: (projects: Project[]) => void
  setActiveCrawlId: (id: string | null) => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  selectedProjectId: null,
  projects: [],
  activeCrawlId: null,
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
  setProjects: (projects) => set({ projects }),
  setActiveCrawlId: (id) => set({ activeCrawlId: id }),
}))
