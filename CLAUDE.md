# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CrawlDesk is a local-first desktop SEO crawler. It crawls websites, detects 20+ SEO issue types, analyzes links, and measures performance — all running locally with no cloud dependency. Dual-backend: Electron (primary, working) and Tauri/Rust (in-progress, many commands return "not implemented").

## Commands

```bash
npm run dev              # Start dev (Vite renderer HMR + Electron main with nodemon)
npm run build            # Build all layers (main + preload + worker + renderer)
npm run build:main       # Compile main process TS only
npm run build:worker     # Compile worker TS only
npm run build:renderer   # Vite production build only
npm test                  # Run Vitest once
npm run test:watch       # Vitest in watch mode
npm run lint              # ESLint on src/ and shared/
npm run typecheck         # TypeScript type checking (no emit) — main, preload, worker
npm run electron:start    # Launch Electron on already-built output
```

Tests live in `tests/` (not `src/`). Run a single test: `npx vitest run tests/scope.test.ts`

## Architecture

Four-process architecture communicating via IPC:

```
Renderer (React) ──preload bridge──▶ Main Process (Electron) ──worker_threads──▶ Crawl Worker
                      contextBridge          ipcMain.handle              parentPort.postMessage
```

### Renderer (`src/renderer/`)
- React 19 + Zustand stores + TailwindCSS (dark "Midnight Teal" design system)
- Vite path aliases: `@` → `src/renderer/`, `@shared` → `src/shared/`
- Calls `window.crawldesk.<domain>.<method>()` — the preload bridge provides this typed API
- `tauri-api.ts` provides dual-backend abstraction: checks `window.__TAURI__` to route to Tauri or Electron

### Preload (`src/preload/preload.ts`)
- Exposes `window.crawldesk` via `contextBridge.exposeInMainWorld`
- Channel naming: `domain:action` (e.g., `crawls:create`, `urls:list`)

### Main Process (`src/main/`)
- `main.ts` — App entry, DB init, window creation, IPC registration
- `crawl/crawl-job-manager.ts` — Spawns worker, relays messages, inserts results into DB in batches
- `db/database.ts` — SQLite init (WAL mode), schema migrations via `schema_migrations` table
- `db/repositories/` — Repository pattern (`ProjectsRepo`, `CrawlsRepo`, `UrlsRepo`, etc.) with prepared statements
- `ipc/*.ipc.ts` — One file per domain, each registers `ipcMain.handle` handlers with Zod validation
- `scheduler/cron-service.ts` — Cron-based crawl scheduling

### Worker (`src/worker/`)
- `crawler-worker.ts` — Worker entry, message handling, result batching (25 per batch)
- `engine/crawl-engine.ts` — Main crawl loop: frontier → fetch → parse → detect → enqueue
- `engine/fetcher.ts` — HTTP fetching with redirect following and rate limiting
- `engine/seo-extractor.ts` — Cheerio-based HTML parsing for SEO fields
- `engine/detectors/` — Modular issue detectors (each is a standalone function). `index.ts` aggregates and runs all detectors
- `engine/url-frontier.ts` — Bounded FIFO queue with LRU dedup cache (150k cap)

### Shared Types (`src/shared/types/`)
All layers import from here. Key types: `UrlRecord`, `PageResult`, `SeoData`, `IssueRecordInput`, `CrawlProgress`, `PaginatedResult<T>`.

## Key Patterns

- **Adding a new IPC method**: Create handler in the appropriate `src/main/ipc/<domain>.ipc.ts`, add Zod schema, expose in `src/preload/preload.ts`, add type to `CrawldeskApi` interface, add Tauri command in `src-tauri/src/commands/`
- **Adding a new issue detector**: Create file in `src/worker/engine/detectors/`, export a function matching the detector pattern, register it in `detectors/index.ts`
- **DB migrations**: Add migration in `database.ts` with a new version number, update the `schema_migrations` table logic
- **Worker communication**: Main→Worker uses `worker.postMessage({type: 'crawl:start', ...})`, Worker→Main uses `parentPort.postMessage({type: 'crawl:pageResultBatch', ...})`
- **Batch processing**: Worker batches 25 page results before sending to main process for DB insertion via `UrlsRepo.bulkUpsertUrls()`

## Tauri Backend (`src-tauri/`)

Rust implementation mirrors the Electron backend structure: `src-tauri/src/commands/` maps to `src/main/ipc/`, `src-tauri/src/core/crawler/` maps to `src/worker/engine/`, `src-tauri/src/core/storage/` maps to `src/main/db/`. The renderer routes to either backend via `tauri-api.ts`.

## Conventions

- TypeScript strict mode (ES2022, `isolatedModules`, `esModuleInterop`)
- Main/preload/worker compile to CommonJS; renderer uses Vite with path aliases
- Conventional commits for PRs
- All IPC inputs validated with Zod
- SQLite WAL mode for concurrent reads during crawl writes