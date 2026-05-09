"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Repositories = void 0;
const projects_repo_1 = require("./projects.repo");
const crawls_repo_1 = require("./crawls.repo");
const urls_repo_1 = require("./urls.repo");
const issues_repo_1 = require("./issues.repo");
const links_repo_1 = require("./links.repo");
class Repositories {
    projects;
    crawls;
    urls;
    issues;
    links;
    constructor(db) {
        this.projects = new projects_repo_1.ProjectsRepo(db);
        this.crawls = new crawls_repo_1.CrawlsRepo(db);
        this.urls = new urls_repo_1.UrlsRepo(db);
        this.issues = new issues_repo_1.IssuesRepo(db);
        this.links = new links_repo_1.LinksRepo(db);
    }
}
exports.Repositories = Repositories;
//# sourceMappingURL=index.js.map