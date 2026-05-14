# CrawlDesk

<div align="center">

<img src="https://img.shields.io/badge/version-0.1.0-teal" alt="version" />
<img src="https://img.shields.io/badge/tauri-2-green" alt="tauri" />
<img src="https://img.shields.io/badge/react-19-blue" alt="react" />
<img src="https://img.shields.io/badge/rust-orange" alt="rust" />
<img src="https://img.shields.io/badge/license-proprietary-red" alt="license" />

<br/>

**Local-first desktop SEO crawler with enterprise-grade analysis.**

Crawl websites, detect issues, analyze links, measure performance — all running locally on your machine.
No cloud. No accounts. No data leaving your device.

</div>

---

## Features

- **Crawl Engine** — Multi-threaded Rust crawler with robots.txt respect, scope control, private IP guarding, and rate limiting
- **SEO Issue Detection** — 20+ issue types: missing titles, duplicate meta descriptions, canonical problems, noindex pages, redirect chains, slow responses, and more
- **Live Crawl Monitoring** — Real-time progress with pause/resume/stop controls
- **URL Explorer** — Filter, sort, and paginate crawled URLs with a detail drawer for every page
- **Link Analysis** — Internal vs. external, follow vs. nofollow, broken link detection with filtering
- **PageSpeed Insights** — Lighthouse scores and Core Web Vitals per URL (opt-in)
- **Health Score** — Aggregated site health with circular gauge visualization
- **CSV Export** — Export URLs, issues, and links to CSV with filter-aware exports
- **Sitemap Analysis** — Sitemap comparison against crawled URLs
- **Structured Data** — JSON-LD extraction and validation
- **Custom Extractions** — CSS/XPath/Regex rules for pulling custom data from pages
- **Keyword Tracking** — Monitor keyword positions over time
- **Scheduled Crawls** — Cron-based re-crawling with configurable intervals
- **Crawl Diff** — Compare crawls to spot new, removed, and changed URLs
- **Link Graph** — Internal link structure analysis
- **TF-IDF Clustering** — Content similarity grouping
- **Carbon Estimation** — Estimate CO2 emissions per page
- **Dark UI** — Midnight teal design system built with TailwindCSS

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Shell | Tauri 2 (WebView2 / WKWebView) |
| Backend / Crawler | Rust (tokio, reqwest, scraper) |
| Renderer | React 19 + Vite 6 |
| State Management | Zustand 5 |
| Styling | TailwindCSS 3 + custom design tokens |
| Database | SQLite (via rusqlite) with WAL mode |
| UI Components | shadcn/ui |
| Language | TypeScript (frontend) + Rust (backend) |

## Architecture

```
CrawlDesk
├── src-tauri/                ┬─ Tauri / Rust backend
│   ├── src/
│   │   ├── core/
│   │   │   ├── crawler/      │  Async crawl engine (tokio, reqwest, scraper)
│   │   │   ├── storage/      │  SQLite schema, queries, models (rusqlite)
│   │   │   └── seo/          │  Issue detectors, SEO analyzers
│   │   ├── commands/         │  Tauri IPC command handlers (projects, crawls, urls, issues, links, exports)
│   │   └── lib.rs            │  App setup, IPC registration
│   ├── Cargo.toml
│   └── tauri.conf.json       │  Tauri configuration
├── src/renderer/              ┬─ React UI (Vite)
│   ├── routes/               │  Screens (Overview, LiveCrawl, Results, Issues, Links, Exports, Settings)
│   ├── components/           │  Layout (Sidebar), shared UI components
│   ├── stores/               │  Zustand stores (project-store, crawl-store)
│   ├── mock-backend.ts       │  Mock window.crawldesk for Playwright E2E testing
│   ├── tauri-api.ts          │  Tauri IPC bridge (camelCase → snake_case normalization)
│   └── App.tsx               │  Root layout, routing, toolbar
├── e2e-test.js                ── Playwright E2E tests (run with ?mock=true)
└── package.json
```

## Getting Started

### Prerequisites

- Node.js >= 20
- Rust >= 1.77 (via rustup)
- Platform-specific WebView2 (Windows) or WebKit (macOS/Linux)

### Install

```bash
git clone https://github.com/om-media/Crawldesk.git
cd Crawldesk
npm install
```

### Development

Start the Vite dev server for frontend-only development (with mock backend):

```bash
npm run dev
```

Open http://localhost:5173/?mock=true in your browser.

For full-stack development with the Tauri window:

```bash
npm run tauri:dev
```

This starts:
- **Vite dev server** on http://localhost:5173 (renderer with HMR)
- **Tauri window** with live Rust backend

### Build

Frontend only (for development):

```bash
npm run build
```

Production desktop app:

```bash
npm run tauri:build
```

### E2E Testing

Playwright-based end-to-end tests using a mock backend (no Tauri required):

```bash
# Start the dev server
npm run dev &
sleep 4

# Run E2E tests
node e2e-test.js
```

The mock backend activates when `?mock=true` is in the URL or `localStorage.crawldesk-mock` is set.

## Usage

1. **Create a project** — Name it and enter the root URL of the site to crawl
2. **Configure crawl** — Set max URLs, depth, concurrency, timeout, and toggle robots.txt respect, subdomains, external links
3. **Start crawling** — Watch live progress with real-time stats (completed, queued, failed, blocked)
4. **Review results** — Browse URLs with filters, inspect individual pages in the detail drawer
5. **Fix issues** — Check the Issues dashboard grouped by severity (critical, high, medium, low)
6. **Analyze links** — View internal/external link distribution, follow/nofollow ratios, broken links
7. **Export** — Download URLs, issues, or links as CSV files

## Issue Detection

CrawlDesk detects 20+ SEO issue types across 4 severity levels:

| Severity | Examples |
|----------|----------|
| Critical | Server errors (5xx), broken internal links |
| High | Missing page title, noindex on important pages, duplicate titles |
| Medium | Missing meta description, canonicalized URLs, redirect chains, duplicate meta descriptions |
| Low | Title too long/short, meta description too long/short, slow response, multiple H1s |

Specialized detectors also check:
- **Canonical tags** — multiple canonicals, self-referencing, cross-domain
- **Image optimization** — missing alt text, large images without dimensions
- **Open Graph / Twitter Cards** — missing og:title, og:description, og:image, twitter:card
- **Security headers** — missing HSTS, CSP, X-Frame-Options, X-Content-Type-Options
- **Hreflang** — missing, invalid format, no return link, wrong language codes
- **Structured data / JSON-LD** — syntax errors, missing required properties, invalid types
- **JavaScript rendering** — pages that require JS for content
- **Pagination** — rel prev/next patterns
- **Sitemap coverage** — URLs in sitemap but not crawled, and vice versa

## Privacy

All data stays on your machine:

- Crawling runs locally via Rust async runtime (tokio)
- Results are stored in a local SQLite database (crawldesk.sqlite)
- No accounts, logins, or cloud sync
- No telemetry or analytics
- PageSpeed Insights data is only fetched when explicitly enabled

## Configuration

Crawl settings are per-crawl and fully configurable:

| Setting | Default | Description |
|---------|---------|-------------|
| Max URLs | 10,000 | Maximum pages to crawl |
| Max Depth | 10 | Maximum crawl depth from start URL |
| Concurrency | 10 | Parallel requests (max 20) |
| Request Timeout | 30s | Per-request timeout |
| Respect robots.txt | On | Honor robots.txt directives |
| Crawl Subdomains | Off | Include subdomains in scope |
| Check External Links | On | Detect external link targets |
| Crawl External Links | Off | Actually fetch external URLs |
| Include/Exclude Patterns | - | Wildcard patterns for URL scoping |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server (frontend only) |
| `npm run tauri:dev` | Start Tauri dev mode (full stack) |
| `npm run build` | Build frontend (Vite production) |
| `npm run tauri:build` | Build production desktop app |
| `npm run typecheck` | TypeScript type checking (no emit) |
| `npm run lint` | ESLint on src/renderer/ |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit with conventional commits
4. Push and open a Pull Request

## License

Proprietary (c) om-media