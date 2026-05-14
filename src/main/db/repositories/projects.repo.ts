import Database from 'better-sqlite3'
import type { Project, CreateProjectInput, UpdateProjectInput, ProjectSummary } from '../../../shared/types/project'

export class ProjectsRepo {
  constructor(private db: Database.Database) {}

  create(input: CreateProjectInput): Project {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    this.db.prepare(`
      INSERT INTO projects (id, name, root_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, input.name, input.rootUrl, now, now)
    return this.getById(id)!
  }

  list(): ProjectSummary[] {
    const rows = this.db.prepare(`
      SELECT p.*,
        c.id as last_crawl_id,
        MAX(c.created_at) as last_crawl_date,
        COALESCE(MAX(c.total_completed), 0) as last_crawl_url_count,
        COALESCE((SELECT COUNT(*) FROM issues i WHERE i.crawl_id = c.id), 0) as last_crawl_issue_count
      FROM projects p
      LEFT JOIN crawls c ON c.project_id = p.id
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `).all() as any[]
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      root_url: r.root_url,
      created_at: r.created_at,
      updated_at: r.updated_at,
      lastCrawlDate: r.last_crawl_date || null,
      lastCrawlUrlCount: r.last_crawl_url_count ?? null,
      lastCrawlIssueCount: r.last_crawl_issue_count ?? null
    }))
  }

  get(projectId: string): Project | null {
    return this.getById(projectId)
  }

  update(projectId: string, patch: UpdateProjectInput): Project {
    const now = new Date().toISOString()
    if (patch.name !== undefined) {
      this.db.prepare(
        'UPDATE projects SET name = ?, updated_at = ? WHERE id = ?'
      ).run(patch.name, now, projectId)
    }
    if (patch.rootUrl !== undefined) {
      this.db.prepare(
        'UPDATE projects SET root_url = ?, updated_at = ? WHERE id = ?'
      ).run(patch.rootUrl, now, projectId)
    }
    return this.getById(projectId)!
  }

  delete(projectId: string): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(projectId)
  }

  private getById(id: string): Project | null {
    const row = this.db.prepare(
      'SELECT * FROM projects WHERE id = ?'
    ).get(id) as Project | undefined
    return row || null
  }
}
