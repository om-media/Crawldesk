# CrawlDesk PRD v2: Local-First Desktop SEO Crawler

**Version:** 1.0  
**Date:** 2026-05-10  
**Audience:** Development LLM / engineering agent  
**Product:** CrawlDesk / OpenCrawler — standalone desktop technical SEO crawler  
**Primary Product Direction:** Screaming Frog-level utility, modern dense desktop UI, Rust-powered crawler, shadcn-based React frontend  
**Target Platform:** Windows, macOS, Linux  
**Primary Architecture:** Tauri + Rust crawler core + React/Vite/TypeScript + shadcn/ui + SQLite  

---

## 0. One-Sentence Product Definition

CrawlDesk is a high-performance, local-first desktop SEO crawler that lets SEO professionals crawl, inspect, diagnose, prioritize, and export technical SEO issues across small sites and very large websites with 200k+ URLs, using a dense modern shadcn UI and a Rust crawling engine.

---

## 1. Critical Architecture Update

The product must **not** be implemented as an Electron/Node crawler or a simple browser-based dashboard. The UI may use web technologies, but the crawler engine must be native, efficient, and built for high-volume local crawling.

### 1.1 Final Recommended Stack

```txt
Desktop shell:       Tauri
Crawler engine:      Rust
Async runtime:       Tokio
HTTP client:         reqwest or hyper
HTML parsing:        scraper / html5ever / kuchiki / lol_html, final choice by engineering feasibility
URL handling:        url crate
Robots/sitemaps:     Rust parsers or well-maintained crates, with tests against edge cases
Database:            SQLite for v1 live crawl data and app state
DB access:           sqlx or rusqlite, final choice by engineering feasibility
Frontend:            React + Vite + TypeScript
UI system:           shadcn/ui + Tailwind CSS
Tables:              TanStack Table + TanStack Virtual
Charts:              Recharts or custom SVG/canvas charts
State management:    Zustand or TanStack Query for UI state, not crawl state
Packaging:           Tauri bundler and updater
Future analytics:    DuckDB optional
Future huge frontier: RocksDB optional
```

### 1.2 Non-Negotiable Architecture Rule

React owns **presentation only**.

Rust owns:

- crawling
- scheduling
- URL normalization
- robots.txt handling
- sitemap parsing
- fetching
- response handling
- parsing
- link extraction
- SEO metadata extraction
- issue detection
- database writes
- exports
- crawl resume/pause state
- high-volume filtering/query endpoints

The frontend must not crawl, parse, dedupe URLs, or hold large crawl datasets in memory.

### 1.3 Why Rust Is Required

The app must eventually support users crawling websites with:

- 50k URLs
- 100k URLs
- 200k+ URLs
- millions of internal links
- millions of external links/checks
- large crawl histories
- incremental crawl comparisons

Node-based local crawling is acceptable for a prototype, but this product is intended to be a serious Screaming Frog alternative. Rust gives the product:

- lower memory overhead
- better native performance
- stronger concurrency safety
- better control over long-running crawl processes
- easier packaging as a native engine
- better credibility for power-user SEO tooling

---

## 2. Product Vision

CrawlDesk should become the crawler SEO professionals actually enjoy using: dense enough for technical audits, powerful enough for huge crawls, and beautiful enough to feel like a modern flagship desktop product.

The product should combine:

```txt
Screaming Frog-level technical utility
+
Rust-native crawl performance
+
shadcn/Tailwind UI polish
+
local-first privacy
+
GSC/GA4/PageSpeed intelligence
+
developer-ready fix workflows
```

### 2.1 Positioning

Do not position this as a shallow clone.

Positioning statement:

> A modern, local-first technical SEO crawler for professionals who need Screaming Frog-level depth, faster workflows, clearer prioritization, and a beautiful desktop experience.

### 2.2 Product Principles

1. **Crawl data is the core object.** The main URL table is the center of the app.
2. **Density matters.** This is a professional desktop tool, not a fluffy SaaS dashboard.
3. **Local-first by default.** Crawls and sensitive website data stay on the user's machine.
4. **Rust does the heavy work.** React must remain responsive even during massive crawls.
5. **Actionability beats reporting.** Every issue should lead to a clear fix path.
6. **Scale is a first-class requirement.** Design for 200k+ URLs from the beginning.
7. **AI must be evidence-grounded.** AI features can summarize and explain, but all claims must trace back to crawl data.

---

## 3. Target Users

### 3.1 Technical SEO Consultant

Needs:

- advanced crawl controls
- huge table filtering
- canonicals, redirects, hreflang, structured data, robots, sitemaps
- custom extraction
- exports
- client-ready findings
- fast inspection of individual URLs

### 3.2 In-House SEO Manager

Needs:

- recurring technical checks
- dashboard summaries
- issue prioritization
- GSC/GA4 integrations
- developer handoff
- historical crawl comparison

### 3.3 SEO Agency

Needs:

- multiple projects
- reusable crawl templates
- white-label exports
- audit workflows
- client reports
- team-friendly file sharing later

### 3.4 Power User / Enterprise SEO

Needs:

- 200k+ URL crawls
- millions of rows
- fast filtering
- low memory usage
- pause/resume
- crash recovery
- large exports
- database-backed workflows

---

## 4. Product Scope

### 4.1 MVP Scope

MVP must prove the core loop:

1. User creates or selects a project.
2. User enters a crawl target.
3. Rust engine crawls the site locally.
4. Results stream into SQLite.
5. UI updates progress in real time.
6. User filters and inspects URLs in a virtualized table.
7. User sees issue counts and URL-level details.
8. User exports crawl data to CSV.

### 4.2 V1 Scope

V1 should support serious technical SEO work:

- HTML crawling
- robots.txt support
- sitemap discovery and crawling
- canonical extraction
- title/meta/H1 extraction
- internal/external link extraction
- indexability classification
- status code and redirect analysis
- issue detection
- bottom URL inspector panel
- persistent projects
- crawl history
- CSV exports
- dark/light theme
- virtualized tables
- pause/stop crawl
- resume after app restart where feasible

### 4.3 V2 Scope

V2 should add advanced auditing:

- crawl comparison
- custom extraction
- GSC integration
- GA4 integration
- PageSpeed sampling
- internal link opportunity engine
- structured data validation/extraction
- hreflang auditing
- visual crawl diagrams
- PDF/HTML reports
- developer ticket generation
- crawl recipes/templates

### 4.4 V3 Scope

V3 should add power-user/enterprise capabilities:

- JavaScript rendering pool
- raw HTML vs rendered DOM comparison
- accessibility checks
- DuckDB analytics layer
- RocksDB/disk-backed frontier if needed
- large crawl archive format
- team/cloud sync optional
- white-label reporting
- AI-assisted fix packs
- migration command center

---

## 5. Core Application Architecture

### 5.1 High-Level Architecture

```txt
React + shadcn UI
        |
        | Tauri commands/events
        v
Rust Application Layer
        |
        | starts/stops/manages crawl sessions
        v
Rust Crawl Engine
        |
        | fetch, parse, extract, analyze
        v
SQLite Local Database
        |
        | paginated/filtered query commands
        v
React Virtualized Views
```

### 5.2 Process Boundaries

The app should be built as a Tauri app where the Rust backend is part of the native app. The crawler should be modular enough that it could later be compiled as:

- a Tauri backend module
- a CLI binary
- a sidecar service
- a library reused in tests and benchmarks

### 5.3 Rust Workspace Layout

Recommended structure:

```txt
src-tauri/
  Cargo.toml
  src/
    main.rs
    commands/
      mod.rs
      crawl_commands.rs
      project_commands.rs
      url_commands.rs
      issue_commands.rs
      export_commands.rs
      settings_commands.rs
    core/
      mod.rs
      crawler/
        mod.rs
        crawl_session.rs
        scheduler.rs
        frontier.rs
        fetcher.rs
        parser.rs
        extractor.rs
        normalizer.rs
        robots.rs
        sitemap.rs
        redirects.rs
        renderer.rs
      analysis/
        mod.rs
        issue_engine.rs
        indexability.rs
        duplicates.rs
        canonicals.rs
        titles.rs
        meta_descriptions.rs
        headings.rs
        links.rs
        images.rs
        hreflang.rs
        structured_data.rs
        performance.rs
      storage/
        mod.rs
        db.rs
        migrations.rs
        writer.rs
        queries.rs
        exports.rs
      events/
        mod.rs
        crawl_events.rs
        progress.rs
      config/
        mod.rs
        crawl_settings.rs
        app_settings.rs
```

### 5.4 Frontend Layout

Recommended structure:

```txt
src/
  main.tsx
  App.tsx
  styles/
    globals.css
    themes.css
  components/
    ui/
      button.tsx
      card.tsx
      badge.tsx
      input.tsx
      tabs.tsx
      select.tsx
      dropdown-menu.tsx
      command.tsx
      tooltip.tsx
      separator.tsx
      scroll-area.tsx
      resizable.tsx
      dialog.tsx
      sheet.tsx
      progress.tsx
      skeleton.tsx
    layout/
      AppShell.tsx
      Sidebar.tsx
      TopCommandBar.tsx
      CrawlStatusBar.tsx
      ProjectSwitcher.tsx
    dashboard/
      KpiCard.tsx
      KpiRow.tsx
      CrawlProgressCard.tsx
      CrawlActivitySparkline.tsx
    crawl-data/
      CrawlDataPage.tsx
      UrlDataTable.tsx
      UrlTableToolbar.tsx
      UrlFilters.tsx
      UrlStatusBadge.tsx
      IndexabilityBadge.tsx
      UrlInspectorPanel.tsx
      UrlDetailsTab.tsx
      MetaDataTab.tsx
      LinksTab.tsx
      RenderedPageTab.tsx
      StructuredDataTab.tsx
      ResponseHeadersTab.tsx
    issues/
      IssuesPanel.tsx
      IssueCategoryRow.tsx
      IssueSeverityBadge.tsx
      IssueDetailsSheet.tsx
    charts/
      MiniSparkline.tsx
      StatusDistributionDonut.tsx
      HealthGauge.tsx
    lib/
      tauri.ts
      utils.ts
      format.ts
      constants.ts
      table.ts
    stores/
      crawl-ui-store.ts
      project-store.ts
      theme-store.ts
    types/
      crawl.ts
      url.ts
      issue.ts
      project.ts
      settings.ts
```

---

## 6. UI Direction: Dense shadcn Desktop Crawler

### 6.1 Reference Direction

The UI should follow the attached reference screenshot direction:

- dark desktop app
- left sidebar
- top URL/crawl command bar
- KPI cards
- central crawl table
- right issues panel
- bottom selected URL details inspector
- bottom crawl status bar

The product must feel like a powerful crawler, not like a generic marketing analytics dashboard.

### 6.2 Visual Style

Use shadcn/ui as the foundation, but customize heavily.

The design should feel:

- dense
- serious
- technical
- fast
- professional
- premium
- keyboard-friendly
- data-first

Avoid:

- default shadcn dashboard look
- oversized cards
- too much empty whitespace
- toy-like colors
- generic SaaS landing-page aesthetics
- fluffy analytics widgets that do not help crawling work

### 6.3 Theme

The app must support:

- dark theme as default
- light theme as optional

Dark theme should use:

```txt
background: deep near-black slate
surface: dark charcoal
surface-hover: slightly lighter charcoal
border: subtle slate
primary: crawler green / emerald
success: green
warning: amber
error: red
info: blue
muted text: slate gray
selected row: subtle green outline + tinted background
```

### 6.4 shadcn Components Required

Use shadcn/ui for:

- Button
- Input
- Card
- Badge
- Tabs
- Select
- DropdownMenu
- Popover
- Command
- Tooltip
- Separator
- ScrollArea
- Sheet
- Dialog
- Progress
- Skeleton
- Resizable
- Switch
- Checkbox
- Table primitives where useful

Use TanStack Table and TanStack Virtual for the actual large tables. shadcn table primitives can provide styling, but cannot be the performance layer by themselves.

### 6.5 shadcn Theme Tokens

Implement theme variables in CSS. Example starting point:

```css
:root {
  --background: 248 250 252;
  --foreground: 15 23 42;

  --card: 255 255 255;
  --card-foreground: 15 23 42;

  --popover: 255 255 255;
  --popover-foreground: 15 23 42;

  --primary: 20 184 166;
  --primary-foreground: 255 255 255;

  --secondary: 241 245 249;
  --secondary-foreground: 51 65 85;

  --muted: 241 245 249;
  --muted-foreground: 100 116 139;

  --accent: 236 254 255;
  --accent-foreground: 15 118 110;

  --destructive: 239 68 68;
  --destructive-foreground: 255 255 255;

  --border: 226 232 240;
  --input: 226 232 240;
  --ring: 20 184 166;

  --radius: 0.75rem;
}

.dark {
  --background: 7 16 22;
  --foreground: 230 246 244;

  --card: 12 24 32;
  --card-foreground: 230 246 244;

  --popover: 12 24 32;
  --popover-foreground: 230 246 244;

  --primary: 132 204 22;
  --primary-foreground: 5 10 8;

  --secondary: 15 32 40;
  --secondary-foreground: 203 232 228;

  --muted: 15 32 40;
  --muted-foreground: 137 164 170;

  --accent: 18 54 47;
  --accent-foreground: 167 243 208;

  --destructive: 239 68 68;
  --destructive-foreground: 255 255 255;

  --border: 31 54 64;
  --input: 31 54 64;
  --ring: 132 204 22;
}
```

### 6.6 Main App Layout

The main window must have these regions:

1. Left sidebar
2. Top crawl command bar
3. KPI row
4. Main crawl data table
5. Right issues panel
6. Bottom selected URL inspector
7. Bottom crawl status bar

Recommended approximate dimensions for 1728px wide layout:

```txt
Sidebar width:             240px
Top command bar height:    56px
KPI row height:            100px
Right issues panel width:  390px
Bottom inspector height:   280px, resizable
Bottom status bar height:  32px
Main gutter:               12-16px
Table row height:          28-34px
```

### 6.7 Left Sidebar Requirements

Sidebar sections:

```txt
Overview
Crawl Data
  All URLs
  Issues
  Pages
  Links
  Images
  JavaScript
  Sitemaps
Performance
Settings
Projects
User/account
Theme toggle
```

Sidebar must support:

- active nav state
- collapsed sections
- count badges
- project switcher
- keyboard focus states
- dense spacing

Example counts:

```txt
All URLs:     10,431
Issues:       256
Pages:        10,431
Links:        32,921
Images:       4,289
JavaScript:   1,102
Sitemaps:     8
```

### 6.8 Top Crawl Command Bar

Elements:

- app logo/name
- crawl target input
- crawl settings button
- Start Crawl button
- Pause button
- Clear button
- overflow menu
- crawl status pill

States:

```txt
Idle
Crawling
Paused
Completed
Failed
Cancelled
```

The Start Crawl button should be the dominant primary action.

### 6.9 KPI Row

Cards:

- URLs Crawled
- Indexable Pages
- Issues Found
- Warnings
- Avg Response Time
- Crawl Progress

Each card:

- icon
- label
- primary value
- sublabel
- tiny sparkline/progress indicator

Example values:

```txt
URLs Crawled:      10,431
Indexable Pages:   8,142
Issues Found:      256
Warnings:          1,102
Avg Response Time: 452 ms
Crawl Progress:    100%
```

### 6.10 Main Crawl Data Table

This is the most important component.

Must use:

- TanStack Table
- TanStack Virtual
- backend-backed filtering
- backend-backed sorting
- sticky header
- resizable columns
- column visibility
- row selection
- keyboard navigation
- selected row highlight

Default columns:

```txt
URL
Content Type
Status Code
Indexability
Title
Depth
Inlinks
```

Optional columns:

```txt
Outlinks
Word Count
Canonical URL
Meta Robots
X-Robots-Tag
H1
H2
Response Time
Page Size
Last Modified
Hash
Crawl Source
Template Group
Issue Count
```

Filters:

```txt
URL search
Status code
Indexability
Content type
Issue type
Depth
Crawl source
More filters popover
```

Important performance rule:

> Never render all URLs directly in React. Never load a 200k URL crawl into frontend state. Always query only the visible window/page/filter subset from Rust/SQLite and virtualize rendering.

### 6.11 Right Issues Panel

Persistent issue panel with tabs:

```txt
All
Errors
Warnings
Opportunities
```

Issue row fields:

- icon
- issue name
- count
- percentage affected
- severity

Clicking an issue must filter the main table.

Example issue categories:

```txt
Missing Title
Duplicate Title
Title Too Long
Missing Meta Description
Duplicate Meta Description
Meta Description Too Long
Missing H1
Multiple H1
Low Content Pages
Redirect Chains
Broken Links
4xx Pages
5xx Pages
Blocked by robots.txt
Blocked by Meta Robots
Canonical Issues
Missing Canonical
Images Missing Alt Text
Slow Pages
Hreflang Issues
Structured Data Errors
```

### 6.12 Bottom URL Detail Inspector

When a row is selected, show a bottom inspector panel.

Tabs:

```txt
URL Details
Meta Data
Links
Inlinks
Outlinks
Rendered Page
Structured Data
Response Headers
Issues
History
AI Fix Plan
```

URL Details tab must show:

- page preview/screenshot placeholder
- selected URL
- canonical URL
- content type
- status code
- indexability
- indexability reason
- depth
- last modified
- size
- title
- meta description
- meta robots
- X-Robots-Tag
- Open Graph title/type
- Twitter card
- language

The inspector must be:

- resizable
- collapsible
- keyboard accessible
- kept in sync with selected table row

### 6.13 Bottom Crawl Status Bar

Show:

- crawl state
- total URLs
- duration
- crawl start time
- average response time
- current response time
- queue size while crawling
- active workers while crawling

Example:

```txt
Crawl completed | 10,431 URLs | 2m 34s | May 20, 2024, 10:15 AM | Average: 45 ms | Current: 298 ms
```

---

## 7. Performance Requirements

### 7.1 Crawl Scale Targets

The app must be designed around these crawl sizes:

```txt
Small:       0-5,000 URLs
Medium:      5,000-50,000 URLs
Large:       50,000-200,000 URLs
Very large:  200,000+ URLs
```

### 7.2 V1 Performance Targets

V1 should handle:

- 200k discovered URLs on a modern desktop
- millions of link rows with database-backed views
- continuous crawl progress updates without freezing UI
- filtering on common columns in under 1 second for typical datasets
- exports streamed to disk, not built fully in memory

### 7.3 Memory Rules

Do not store full crawl state in memory.

Bad:

```txt
HashMap of all URLs
Vec of all links
Vec of all issues
then write everything at the end
```

Good:

```txt
disk-backed frontier
bounded async channels
streaming batch writes
periodic checkpoints
incremental issue generation
paginated reads
```

### 7.4 React Performance Rules

React must not:

- render thousands of rows at once
- hold all URL records in Zustand/React state
- sort/filter huge arrays in the browser
- compute issue summaries from raw rows

React should:

- render visible rows only
- call Rust query commands for filters/sorts
- debounce search inputs
- subscribe to progress events
- use memoized cells and stable column definitions

---

## 8. Rust Crawl Engine Requirements

### 8.1 Crawl Session Lifecycle

States:

```txt
created
initializing
loading_robots
loading_sitemaps
crawling
paused
stopping
completed
failed
cancelled
```

Commands:

```ts
startCrawl(settings): Promise<CrawlSession>
pauseCrawl(crawlId): Promise<void>
resumeCrawl(crawlId): Promise<void>
stopCrawl(crawlId): Promise<void>
clearCrawl(crawlId): Promise<void>
getCrawlProgress(crawlId): Promise<CrawlProgress>
```

Events:

```txt
crawl:started
crawl:progress
crawl:url-discovered
crawl:url-fetched
crawl:issue-found
crawl:paused
crawl:resumed
crawl:completed
crawl:failed
crawl:cancelled
```

### 8.2 Crawl Settings

Crawl settings should include:

```txt
start_url
crawl_mode
max_urls
max_depth
include_subdomains
crawl_external_links
check_external_links
respect_robots_txt
user_agent
custom_headers
cookies
timeout_ms
max_response_size_bytes
concurrency
per_host_concurrency
crawl_delay_ms
follow_redirects
max_redirects
crawl_sitemaps
crawl_linked_xml_sitemaps
include_patterns
exclude_patterns
allow_query_params
strip_fragments
normalize_trailing_slash
render_javascript
rendering_limit
```

### 8.3 Crawl Modes

Implement these modes over time:

```txt
Spider mode
List mode
Sitemap mode
SERP/GSC import mode
Compare mode
Scheduled recrawl mode
```

### 8.4 Frontier / Queue Requirements

Each URL should have state:

```txt
discovered
queued
fetching
fetched
failed
skipped
blocked_by_robots
out_of_scope
```

Use SQLite frontier in V1 unless performance requires RocksDB later.

Required fields:

```txt
crawl_id
normalized_url
original_url
depth
status
source_url
priority
attempts
last_error
created_at
updated_at
```

### 8.5 Fetcher Requirements

Fetcher must:

- enforce timeouts
- enforce max response size
- handle gzip/br encoding where supported
- track response time
- track redirects
- classify content type
- avoid private/internal IP ranges for safety where applicable
- respect robots.txt if enabled
- emit progress events
- retry only where safe

### 8.6 Parser Requirements

Parser must extract:

- status code
- final URL
- content type
- page size
- title
- meta description
- meta robots
- X-Robots-Tag
- canonical
- H1/H2
- internal links
- external links
- image URLs
- image alt text
- hreflang
- structured data blocks
- Open Graph tags
- Twitter card tags
- language
- word count
- text hash/content hash

### 8.7 URL Normalization Requirements

Normalize URLs consistently:

- lowercase scheme and host
- remove fragments
- resolve relative URLs
- normalize dot segments
- preserve or normalize trailing slash based on settings
- preserve query params unless configured otherwise
- sort query params only if safe/configured
- punycode domains correctly
- prevent duplicate queue entries

### 8.8 Issue Engine Requirements

The issue engine should run incrementally where possible, but some issues require post-crawl aggregation.

Incremental issues:

- missing title
- title too long
- missing meta description
- meta description too long
- missing H1
- multiple H1
- noindex
- blocked by robots
- non-200 status
- oversized page
- slow response

Post-crawl issues:

- duplicate titles
- duplicate meta descriptions
- duplicate H1
- duplicate content hash
- orphan pages
- redirect chains
- canonical clusters
- internal link depth problems
- low internal links

---

## 9. Storage Architecture

### 9.1 SQLite First

Use SQLite for V1.

SQLite stores:

- projects
- crawl sessions
- crawl settings
- URL records
- link records
- issue records
- frontier state
- crawl summaries
- exports metadata

### 9.2 SQLite PRAGMAs

On database open:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA temp_store = MEMORY;
PRAGMA busy_timeout = 5000;
PRAGMA mmap_size = 268435456;
PRAGMA cache_size = -200000;
```

### 9.3 Writer Architecture

Use:

```txt
many fetch/parse tasks
one dedicated database writer task
bounded channels
batch inserts
prepared statements
periodic checkpoints
```

Do not allow many async tasks to write directly to SQLite concurrently.

### 9.4 Batch Writing

Batch sizes:

```txt
URL records:       250-2,000 rows per transaction
Link records:      1,000-10,000 rows per transaction
Issue records:     250-2,000 rows per transaction
Progress updates:  throttled
```

### 9.5 Index Strategy

During crawl, keep indexes minimal.

Required during crawl:

```sql
UNIQUE(crawl_id, normalized_url)
INDEX(crawl_id, status)
INDEX(crawl_id, depth)
```

After crawl, build heavier reporting indexes:

```sql
INDEX(crawl_id, status_code)
INDEX(crawl_id, indexability)
INDEX(crawl_id, content_type)
INDEX(crawl_id, title)
INDEX(crawl_id, meta_description)
INDEX(crawl_id, canonical_url)
INDEX(crawl_id, content_hash)
INDEX(crawl_id, issue_type)
INDEX(crawl_id, severity)
```

### 9.6 Future Storage Enhancements

Add DuckDB when needed for:

- heavy analytical queries
- crawl comparison
- GSC/GA4 joins
- Parquet exports
- large aggregation reports

Add RocksDB when needed for:

- huge frontier state
- very fast URL deduplication
- very large temporary graph data

Do not add DuckDB/RocksDB in MVP unless SQLite proves insufficient in benchmarks.

---

## 10. Database Schema Direction

### 10.1 projects

```sql
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  root_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### 10.2 crawls

```sql
CREATE TABLE crawls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  start_url TEXT NOT NULL,
  status TEXT NOT NULL,
  settings_json TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  total_discovered INTEGER DEFAULT 0,
  total_crawled INTEGER DEFAULT 0,
  total_indexable INTEGER DEFAULT 0,
  total_issues INTEGER DEFAULT 0,
  avg_response_time_ms INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);
```

### 10.3 urls

```sql
CREATE TABLE urls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crawl_id INTEGER NOT NULL,
  original_url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  final_url TEXT,
  content_type TEXT,
  status_code INTEGER,
  indexability TEXT,
  indexability_reason TEXT,
  title TEXT,
  title_length INTEGER,
  meta_description TEXT,
  meta_description_length INTEGER,
  h1 TEXT,
  h1_count INTEGER,
  h2_count INTEGER,
  canonical_url TEXT,
  meta_robots TEXT,
  x_robots_tag TEXT,
  depth INTEGER,
  inlinks_count INTEGER DEFAULT 0,
  outlinks_count INTEGER DEFAULT 0,
  response_time_ms INTEGER,
  size_bytes INTEGER,
  word_count INTEGER,
  content_hash TEXT,
  language TEXT,
  last_modified TEXT,
  crawl_source TEXT,
  fetched_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(crawl_id, normalized_url),
  FOREIGN KEY(crawl_id) REFERENCES crawls(id)
);
```

### 10.4 links

```sql
CREATE TABLE links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crawl_id INTEGER NOT NULL,
  source_url_id INTEGER,
  target_url TEXT NOT NULL,
  target_normalized_url TEXT NOT NULL,
  target_url_id INTEGER,
  anchor_text TEXT,
  link_type TEXT,
  is_internal INTEGER NOT NULL,
  is_followed INTEGER NOT NULL DEFAULT 1,
  source_element TEXT,
  source_attribute TEXT,
  status_code INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY(crawl_id) REFERENCES crawls(id),
  FOREIGN KEY(source_url_id) REFERENCES urls(id),
  FOREIGN KEY(target_url_id) REFERENCES urls(id)
);
```

### 10.5 issues

```sql
CREATE TABLE issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crawl_id INTEGER NOT NULL,
  url_id INTEGER,
  issue_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  recommendation TEXT,
  evidence_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(crawl_id) REFERENCES crawls(id),
  FOREIGN KEY(url_id) REFERENCES urls(id)
);
```

### 10.6 crawl_frontier

```sql
CREATE TABLE crawl_frontier (
  crawl_id INTEGER NOT NULL,
  normalized_url TEXT NOT NULL,
  original_url TEXT NOT NULL,
  depth INTEGER NOT NULL,
  status TEXT NOT NULL,
  source_url TEXT,
  priority INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (crawl_id, normalized_url)
);
```

---

## 11. Tauri Command API Contract

### 11.1 Project Commands

```ts
type Project = {
  id: number;
  name: string;
  rootUrl: string;
  createdAt: string;
  updatedAt: string;
};

createProject(input: { name: string; rootUrl: string }): Promise<Project>
listProjects(): Promise<Project[]>
getProject(projectId: number): Promise<Project>
updateProject(projectId: number, input: Partial<Project>): Promise<Project>
deleteProject(projectId: number): Promise<void>
```

### 11.2 Crawl Commands

```ts
type CrawlSettings = {
  projectId: number;
  startUrl: string;
  maxUrls?: number;
  maxDepth?: number;
  concurrency: number;
  perHostConcurrency: number;
  respectRobotsTxt: boolean;
  crawlSitemaps: boolean;
  includeSubdomains: boolean;
  crawlExternalLinks: boolean;
  checkExternalLinks: boolean;
  renderJavaScript: boolean;
};

startCrawl(settings: CrawlSettings): Promise<{ crawlId: number }>;
pauseCrawl(crawlId: number): Promise<void>;
resumeCrawl(crawlId: number): Promise<void>;
stopCrawl(crawlId: number): Promise<void>;
clearCrawl(crawlId: number): Promise<void>;
getCrawlSummary(crawlId: number): Promise<CrawlSummary>;
```

### 11.3 URL Query Commands

```ts
type UrlQuery = {
  crawlId: number;
  search?: string;
  statusCodes?: number[];
  indexability?: string[];
  contentTypes?: string[];
  issueTypes?: string[];
  minDepth?: number;
  maxDepth?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  limit: number;
  offset: number;
};

queryUrls(query: UrlQuery): Promise<{
  rows: UrlRecord[];
  total: number;
}>;

getUrlDetails(urlId: number): Promise<UrlDetails>;
```

### 11.4 Issue Commands

```ts
getIssueSummary(crawlId: number): Promise<IssueSummary[]>;
queryIssues(input: IssueQuery): Promise<{ rows: IssueRecord[]; total: number }>;
getIssueDetails(issueId: number): Promise<IssueDetails>;
```

### 11.5 Export Commands

```ts
exportUrlsToCsv(input: UrlQuery & { outputPath: string }): Promise<ExportResult>;
exportIssuesToCsv(input: IssueQuery & { outputPath: string }): Promise<ExportResult>;
exportCrawlSummary(input: { crawlId: number; outputPath: string; format: 'json' | 'html' | 'pdf' }): Promise<ExportResult>;
```

---

## 12. Feature Parity: Screaming Frog-Style Capabilities

### 12.1 Crawl Inputs

Implement:

- spider from URL
- crawl from sitemap
- crawl from uploaded URL list
- recrawl from previous crawl
- import from GSC later

### 12.2 Crawl Configuration

Implement settings for:

- include/exclude patterns
- max depth
- max URLs
- user agent
- cookies
- custom headers
- crawl speed
- robots.txt behavior
- follow redirects
- max redirects
- canonical handling
- query parameter handling
- subdomain handling
- external link checking

### 12.3 Data Extraction

Extract:

- URL
- final URL
- status code
- content type
- indexability
- title
- meta description
- headings
- canonical
- meta robots
- X-Robots-Tag
- links
- images
- hreflang
- structured data
- Open Graph
- Twitter card
- word count
- response time
- size
- hash

### 12.4 Issue Categories

Implement issue detection for:

- response codes
- redirects
- titles
- meta descriptions
- headings
- canonicals
- indexability
- robots
- links
- images
- structured data
- hreflang
- performance
- content quality
- duplicate content

### 12.5 Exports

Support:

- all URLs CSV
- filtered URLs CSV
- issues CSV
- links CSV
- images CSV
- redirects CSV
- canonicals CSV
- sitemap XML generation later
- crawl summary JSON

---

## 13. Differentiator Features Beyond Screaming Frog

### 13.1 Impact Prioritization Engine

Combine:

- issue severity
- affected URL count
- page depth
- inlinks
- GSC impressions/clicks later
- GA4 sessions/conversions later
- template grouping

Output:

- Critical Now
- High Impact
- Medium Impact
- Cleanup
- Ignore/Monitor

### 13.2 Fix Packs

A fix pack groups related issues into developer-ready work.

Example:

```txt
Fix Pack: Product template missing meta descriptions
Affected URLs: 1,248
Root cause: same template
Impact: high
Developer task: update product template meta description logic
Acceptance criteria: all affected URLs return unique meta descriptions between 120-160 chars
Evidence: sample URLs and current extracted metadata
```

### 13.3 URL Inspector as Workflow Hub

The bottom URL inspector should become more powerful than a simple detail view.

It should answer:

- Why is this URL indexable/non-indexable?
- What links point to it?
- What does it link to?
- What issues affect it?
- Did it change since the previous crawl?
- What should the user fix first?

### 13.4 Index Reality Gap

When GSC is connected, compare:

- crawl indexability
- sitemap presence
- internal link discoverability
- GSC indexed/inspected status
- GSC impressions/clicks

Find:

- indexable but not performing
- indexed but orphaned
- noindex but getting impressions
- sitemap URLs not crawlable
- crawlable URLs missing from sitemap

### 13.5 Internal Link Opportunity Engine

Suggest internal links based on:

- page depth
- orphan/low-inlink pages
- related page titles/H1s
- anchor text opportunities
- GSC query/page relevance later

### 13.6 Developer Ticket Generator

Generate issue tickets for:

- GitHub
- Jira
- Linear
- Markdown copy/paste

Each ticket must include:

- title
- problem
- SEO impact
- affected URLs
- reproduction steps
- expected result
- acceptance criteria
- evidence

### 13.7 Crawl Recipes

Reusable crawl configurations:

- Standard Technical SEO Audit
- Migration QA
- JavaScript Rendering Audit
- Sitemap Audit
- Redirect Audit
- Ecommerce Facet Audit
- Content Pruning Audit
- Image SEO Audit

---

## 14. JavaScript Rendering Strategy

Do not render every URL by default.

JS rendering is expensive. For 200k+ URLs, rendering all pages is not realistic on most machines.

V1:

- no JS rendering or limited experimental mode

V2/V3:

- selected URL rendering
- sample rendering by template
- raw HTML vs rendered DOM comparison
- detect pages likely requiring JS
- render only high-priority templates

UI must clearly show:

```txt
HTML crawl data
Rendered DOM data
Differences
```

---

## 15. Testing Requirements

### 15.1 Rust Unit Tests

Test:

- URL normalization
- robots rules
- sitemap parsing
- HTML extraction
- link extraction
- canonical logic
- indexability classification
- issue rules
- redirect chains

### 15.2 Rust Integration Tests

Use local test servers to simulate:

- redirects
- robots blocking
- broken links
- canonical loops
- large sitemaps
- slow responses
- timeouts
- malformed HTML
- duplicate titles
- noindex pages

### 15.3 Frontend Tests

Test:

- table virtualization
- filter state
- selected URL inspector
- issue panel click-to-filter
- theme switching
- crawl status states
- empty/loading/error states

### 15.4 Performance Benchmarks

Create benchmark fixtures:

```txt
1k URL site
10k URL site
50k URL site
200k URL synthetic site
1M link synthetic dataset
```

Measure:

- crawl throughput
- memory use
- DB write speed
- filter query speed
- export speed
- UI responsiveness

---

## 16. Security and Safety Requirements

The crawler must prevent abuse and local security issues.

Implement:

- block localhost/private IP crawling unless explicitly allowed
- block cloud metadata IPs by default
- max response size
- redirect limit
- timeout limit
- robots respect default on
- safe file writes
- no arbitrary JS execution in app context
- strict Tauri permissions
- sanitized exports

Blocked by default:

```txt
127.0.0.1
localhost
0.0.0.0
10.0.0.0/8
172.16.0.0/12
192.168.0.0/16
169.254.169.254
::1
fc00::/7
fe80::/10
```

Allow advanced users to override only with explicit warning.

---

## 17. Acceptance Criteria for V1

V1 is acceptable when:

1. User can create a project.
2. User can enter a URL and start a local crawl.
3. Rust engine crawls HTML pages and stores results in SQLite.
4. Crawl progress updates in the UI without freezing.
5. User can pause/stop crawl.
6. User can view URLs in a virtualized table.
7. User can filter by status code, indexability, content type, and issue type.
8. User can select a row and see URL details in the bottom inspector.
9. User can view issue counts in the right panel.
10. Clicking an issue filters the table.
11. User can export filtered URLs to CSV.
12. Dark and light themes work.
13. App can handle at least 50k URLs smoothly in V1 tests.
14. Architecture does not load all URLs into React state.
15. Database writes are batched and do not block UI.

---

## 18. Developer LLM Implementation Instructions

### 18.1 Implementation Priorities

Build in this order:

1. Tauri + React + Vite + TypeScript skeleton
2. shadcn/ui installation and theme tokens
3. static UI matching dense crawler layout
4. SQLite schema and migrations
5. Rust crawl session model
6. basic HTML fetch and parse
7. URL frontier and dedupe
8. writer task and batch inserts
9. progress events to frontend
10. virtualized URL table backed by Rust query commands
11. right issues panel
12. bottom URL inspector
13. CSV export
14. pause/stop/resume behavior
15. performance benchmarks

### 18.2 Do Not Do

Do not:

- build the crawler in React
- build the crawler in Node
- load full datasets into frontend state
- render all rows in React
- implement JS rendering before stable HTML crawling
- overbuild SaaS/cloud sync in V1
- use generic dashboard layouts that hide the table

### 18.3 Quality Bar

The app should feel like:

```txt
Screaming Frog utility
+
modern shadcn desktop polish
+
Rust native performance
```

If a choice must be made between beauty and data workflow, prioritize data workflow. Then polish it.

---

## 19. Final Product Direction

The updated product direction is:

```txt
Local-first desktop SEO crawler
Tauri shell
Rust crawl engine
SQLite local database
React/Vite frontend
shadcn/ui design system
TanStack virtualized tables
Dense Screaming Frog-style workflow
Modern premium dark UI
Built for 200k+ URL crawls
```

This PRD supersedes any earlier architecture that suggested Node/Electron as the main crawler engine. Electron may be considered only as a fallback shell, but the crawler must remain Rust-native.

