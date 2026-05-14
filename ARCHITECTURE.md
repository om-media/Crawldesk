# CrawlDesk Architecture

## Current Target: Tauri + Rust

This project now uses **Tauri** as its primary desktop framework with a **Rust backend**.

### Key Components

- **Frontend**: React + TypeScript (Vite)
  - Location: `src/renderer/`
  - API Layer: `src/renderer/tauri-api.ts` (communicates with Rust via Tauri's `invoke()`)

- **Backend**: Rust (Tauri commands)
  - Location: `src-tauri/src/`
  - Commands: `src-tauri/src/commands/` (crawl, project, url, issue, link, export, keyword, cluster, settings, app)
  - Core Logic: `src-tauri/src/core/` (crawler engine, storage, events)

- **Database**: SQLite
  - Location: App data directory (`crawldesk.sqlite`)
  - Schema: Defined in `src-tauri/src/core/storage/db.rs`

### Build & Run

```bash
# Install dependencies
npm install

# Run Tauri dev mode (recommended)
npm run tauri:dev

# Build for production
npm run tauri:build

# Build frontend only (for web/testing)
npm run build
```

## Legacy: Electron (Deprecated)

Electron support has been **deprecated** and is no longer actively maintained.

- Electron files are marked with `@DEPRECATED` comments
- Electron is removed from package.json scripts and devDependencies
- The Tauri implementation is the only supported desktop target

### Why Tauri?

1. **Smaller bundle size** - Uses system webview instead of bundling Chromium
2. **Better performance** - Rust backend is faster and more memory-efficient
3. **Native feel** - Better integration with OS-level features
4. **Security** - Smaller attack surface, no Node.js in renderer

## Settings Persistence

Settings are persisted to JSON file in the app data directory:
- Path: `{app_data_dir}/settings.json`
- Loaded on `get_settings()`, saved on `update_settings()`

## Project Structure

```
OpenCrawler/
├── src/
│   ├── renderer/          # React frontend (Tauri target)
│   │   ├── tauri-api.ts   # Tauri command bridge
│   │   ├── stores/        # Zustand state stores
│   │   └── routes/        # Page components
│   ├── preload/           # [DEPRECATED] Electron preload
│   └── main/              # [DEPRECATED] Electron main process
├── src-tauri/             # Rust backend (Tauri)
│   ├── src/
│   │   ├── commands/      # Tauri command handlers
│   │   ├── core/          # Business logic
│   │   └── lib.rs         # Entry point
│   ├── Cargo.toml
│   └── tauri.conf.json
├── shared/                # Shared TypeScript types
└── package.json
```

## Migration Notes

If you were using Electron before:
1. Use `npm run tauri:dev` instead of `npm run dev`
2. All API calls go through `window.crawldesk` (same interface)
3. Backend is now Rust, not Node.js
4. Database is SQLite (same as before, but accessed via Rust queries)
