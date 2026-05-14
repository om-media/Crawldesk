export interface Project {
  id: string
  name: string
  root_url: string
  created_at: string
  updated_at: string
}

export interface CreateProjectInput {
  name: string
  rootUrl: string
}

export interface UpdateProjectInput {
  name?: string
  rootUrl?: string
}

export interface ProjectSummary extends Project {
  lastCrawlDate?: string | null
  lastCrawlUrlCount?: number | null
  lastCrawlIssueCount?: number | null
}
