import Database from 'better-sqlite3'
import { ProjectsRepo } from './projects.repo'
import { CrawlsRepo } from './crawls.repo'
import { UrlsRepo } from './urls.repo'
import { IssuesRepo } from './issues.repo'
import { LinksRepo } from './links.repo'

export class Repositories {
  projects: ProjectsRepo
  crawls: CrawlsRepo
  urls: UrlsRepo
  issues: IssuesRepo
  links: LinksRepo

  constructor(db: Database.Database) {
    this.projects = new ProjectsRepo(db)
    this.crawls = new CrawlsRepo(db)
    this.urls = new UrlsRepo(db)
    this.issues = new IssuesRepo(db)
    this.links = new LinksRepo(db)
  }
}
