/**
 * Tauri API bridge — typed wrapper around window.crawldesk for invocations
 * and event listeners. Falls back to mock backend when Tauri is unavailable.
 */
type TauriGlobal = NonNullable<Window['__TAURI__']>

const READY_EVENT = 'crawldesk:ready'

function getTauri(): TauriGlobal | undefined {
  return window.__TAURI__
}

function unavailable(feature: string): Promise<never> {
  return Promise.reject(new Error(`${feature} is not implemented in the Tauri backend yet.`))
}

function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const tauri = getTauri()
  if (!tauri?.core?.invoke) {
    return unavailable('Tauri command bridge')
  }
  return tauri.core.invoke<T>(cmd, args)
}

function toId(value: string | number | undefined | null): number {
  const id = Number(value)
  if (!Number.isFinite(id)) throw new Error(`Invalid numeric id: ${value}`)
  return id
}

function joinPath(base: string, ...parts: string[]): string {
  const separator = base.includes('\\') ? '\\' : '/'
  return [base.replace(/[\\/]+$/, ''), ...parts.map((part) => part.replace(/^[\\/]+|[\\/]+$/g, ''))].join(separator)
}

async function exportPath(kind: string, id: string | number): Promise<string> {
  const safeId = String(id).replace(/[^a-z0-9_-]/gi, '_')
  const fileName = `${kind}-${safeId}.csv`

  try {
    const dataPath = await invoke<string>('get_data_path')
    return joinPath(dataPath, 'exports', fileName)
  } catch {
    return fileName
  }
}

function normalizeExportResult(result: any) {
  return {
    filePath: result.filePath ?? result.file_path ?? '',
    rowCount: Number(result.rowCount ?? result.row_count ?? 0),
    fileSize: Number(result.fileSize ?? result.file_size ?? 0),
  }
}

function normalizeCrawlSettings(settings: any) {
  const timeoutSeconds =
    settings.timeoutSeconds != null
      ? Number(settings.timeoutSeconds)
      : Math.max(1, Math.round(Number(settings.requestTimeoutMs ?? 30000) / 1000))

  return {
    startUrl: settings.startUrl ?? null,
    maxUrls: Number(settings.maxUrls ?? 10000),
    maxDepth: Number(settings.maxDepth ?? 10),
    concurrency: Number(settings.concurrency ?? 10),
    delayBetweenRequestsMs: Number(settings.delayBetweenRequestsMs ?? 0),
    userAgent: settings.userAgent ?? 'CrawlDesk SEO Crawler',
    acceptLanguage: settings.acceptLanguage ?? 'en-US,en;q=0.9',
    maxResponseSizeKb: Number(settings.maxResponseSizeKb ?? 5120),
    timeoutSeconds,
    followRedirects: settings.followRedirects ?? true,
    maxRedirects: Number(settings.maxRedirects ?? 5),
    respectRobotsTxt: settings.respectRobotsTxt ?? true,
    respectSitemaps: settings.respectSitemaps ?? true,
    crawlSubdomains: settings.crawlSubdomains ?? false,
    checkExternalLinks: settings.checkExternalLinks ?? true,
    crawlExternalLinks: settings.crawlExternalLinks ?? false,
    requestTimeoutMs: Number(settings.requestTimeoutMs ?? 30000),
    includePatterns: Array.isArray(settings.includePatterns) ? settings.includePatterns : [],
    excludePatterns: Array.isArray(settings.excludePatterns) ? settings.excludePatterns : [],
    allowedHostnames: Array.isArray(settings.allowedHostnames) ? settings.allowedHostnames : [],
    blockedHostnames: Array.isArray(settings.blockedHostnames) ? settings.blockedHostnames : [],
    maxUrlLength: Number(settings.maxUrlLength ?? 2048),
    disablePrivateIpAccess: settings.disablePrivateIpAccess ?? true,
    enableJsRendering: settings.enableJsRendering ?? false,
    customHeaders: settings.customHeaders ?? null,
  }
}

async function listen<T>(names: string[], cb: (payload: T) => void): Promise<() => void> {
  const tauri = getTauri()
  if (!tauri?.event?.listen) return () => {}
  const unlisteners = await Promise.all(names.map((name) => tauri.event!.listen<T>(name, (event) => cb(event.payload))))
  return () => {
    for (const unlisten of unlisteners) unlisten()
  }
}

function normalizeLinkRecord(record: any) {
  return {
    id: String(record.id ?? ''),
    source_url_id: record.sourceUrlId ?? record.source_url_id ?? 0,
    source_url: record.sourceUrl ?? record.source_url ?? '',
    target_url: record.targetUrl ?? record.target_url ?? '',
    link_relation: record.linkRelation ?? record.link_relation ?? '',
    anchor_text: record.anchorText ?? record.anchor_text ?? null,
    is_internal: record.isInternal ?? record.is_internal ?? false,
    is_no_follow: record.isNoFollow ?? record.is_no_follow ?? false,
    detected_at: record.detectedAt ?? record.detected_at ?? '',
    // Alias for frontend compatibility
    link_type: record.linkRelation ?? record.link_relation ?? '',
  }
}

function normalizeIssueSeverity(value: any) {
  switch (value) {
    case 'critical':
      return 'critical'
    case 'high':
    case 'medium':
    case 'warning':
      return 'warning'
    case 'low':
    case 'info':
      return 'info'
    default:
      return value ?? ''
  }
}

function normalizeIssueDefinition(record: any) {
  return {
    id: record.id ?? record.issueType ?? record.issue_type ?? '',
    label: record.label ?? '',
    severity: normalizeIssueSeverity(record.severity),
    category: record.category ?? '',
    explanation: record.explanation ?? '',
    recommendation: record.recommendation ?? '',
  }
}

function normalizeIssueRecord(record: any) {
  return {
    id: String(record.id ?? ''),
    issue_type: record.issueType ?? record.issue_type ?? '',
    severity: normalizeIssueSeverity(record.severity),
    category: record.category ?? '',
    url_id: record.urlId ?? record.url_id ?? 0,
    url: record.url ?? '',
    message: record.message ?? '',
    details_json: record.detailsJson ?? record.details_json ?? null,
    detected_at: record.detectedAt ?? record.detected_at ?? '',
    is_fixed: record.isFixed ?? record.is_fixed ?? false,
    // Enriched fields from the backend summary query
    label: record.label ?? null,
    explanation: record.explanation ?? null,
    recommendation: record.recommendation ?? null,
    count: record.count ?? 0,
  }
}

function normalizeIssueSummary(record: any) {
  return {
    issue_type: record.issueType ?? record.issue_type ?? '',
    severity: normalizeIssueSeverity(record.severity),
    category: record.category ?? '',
    count: record.count ?? 0,
    label: record.label ?? null,
    explanation: record.explanation ?? null,
    recommendation: record.recommendation ?? null,
  }
}

function normalizeProjectRecord(record: any) {
  return {
    id: String(record.id ?? ''),
    name: record.name ?? '',
    root_url: record.rootUrl ?? record.root_url ?? '',
    created_at: record.createdAt ?? record.created_at ?? '',
    updated_at: record.updatedAt ?? record.updated_at ?? '',
    lastCrawlDate: record.lastCrawlDate ?? null,
    lastCrawlUrlCount: record.lastCrawlUrlCount ?? null,
    lastCrawlIssueCount: record.lastCrawlIssueCount ?? null,
  }
}

function setupCrawldesk() {
  if (window.crawldesk) return // Already set (by Tauri preload or previous call)
  const tauri = getTauri()
  if (!tauri) {
    console.warn('[tauri-api] window.__TAURI__ not available — no backend connected')
    return
  }

  window.crawldesk = {
    projects: {
      create: async (input: any) => {
        const result = await invoke('create_project', { name: input.name, rootUrl: input.rootUrl })
        return normalizeProjectRecord(result)
      },
      list: async () => {
        const result = await invoke('get_projects') as unknown[]
        return (result || []).map(normalizeProjectRecord)
      },
      get: async (id: string) => {
        const result = await invoke('get_project', { id: toId(id) })
        return result ? normalizeProjectRecord(result) : null
      },
      update: (id: string, patch: any) => invoke('update_project', { id: toId(id), name: patch.name, rootUrl: patch.rootUrl }),
      delete: (id: string) => invoke('delete_project', { id: toId(id) }),
    },
    crawls: {
      create: async (projectId: string, settings: any) => {
        const normalizedSettings = normalizeCrawlSettings(settings)
        const id = await invoke<number>('start_crawl', { projectId: toId(projectId), settings: normalizedSettings })
        return { id: String(id), project_id: String(projectId), status: 'running', settings_json: JSON.stringify(settings) }
      },
      pause: (crawlId: string) => invoke('pause_crawl', { crawlId: toId(crawlId) }),
      resume: (crawlId: string) => invoke('resume_crawl', { crawlId: toId(crawlId) }),
      stop: (crawlId: string) => invoke('stop_crawl', { crawlId: toId(crawlId) }),
      get: (crawlId: string) => invoke('get_crawl_progress', { crawlId: toId(crawlId) }),
      listByProject: async (projectId: string) => {
        const crawls = await invoke<Array<any>>('list_crawls', { projectId: toId(projectId) })
        // Ensure ids are strings for frontend compatibility
        return crawls.map((c: any) => ({ ...c, id: String(c.id), project_id: String(c.project_id) }))
      },
      onProgress: (cb: (progress: any) => void) => {
        let disposed = false
        let cleanup: (() => void) | undefined
        listen(['crawl:progress', 'crawls:progress'], cb).then((unlisten) => {
          if (disposed) unlisten()
          else cleanup = unlisten
        })
        return () => {
          disposed = true
          cleanup?.()
        }
      },
      onStatus: (cb: (status: any) => void) => {
        let disposed = false
        let cleanup: (() => void) | undefined
        listen(['crawl:status', 'crawls:status'], cb).then((unlisten) => {
          if (disposed) unlisten()
          else cleanup = unlisten
        })
        return () => {
          disposed = true
          cleanup?.()
        }
      },
    },
    urls: {
      list: (input: any) => invoke('query_urls', {
        projectId: toId(input.projectId ?? 1),
        crawlId: input.crawlId ? toId(input.crawlId) : undefined,
        page: input.page ?? 0,
        pageSize: input.pageSize ?? 50,
        filterIndexability: input.filters?.indexability || undefined,
        filterStatusCategory: input.filters?.statusCategory || undefined,
        search: input.filters?.search || undefined,
        sortBy: input.sort?.field,
        sortOrder: input.sort?.direction,
      }),
      get: (urlId: string) => invoke('get_url_details', { urlId: toId(urlId) }),
      summarize: (projectId: string) => invoke('summarize_urls', { projectId: toId(projectId) }),
    },
    issues: {
      definitions: async () => {
        const result = await invoke<Array<any>>('get_issue_definitions')
        return (result || []).map(normalizeIssueDefinition)
      },
      summarize: async (crawlId: string) => {
        const result = await invoke<Array<any>>('get_issue_summary', { crawlId: toId(crawlId) })
        return (result || []).map(normalizeIssueSummary)
      },
      list: async (input: any) => {
        const result = await invoke<[any[], number]>('query_issues', {
          crawlId: input.crawlId ? toId(input.crawlId) : undefined,
          page: input.page ?? 0,
          pageSize: input.pageSize ?? 50,
          filterType: input.filters?.issueType,
          filterSeverity: input.filters?.severity,
          filterCategory: input.filters?.category,
          search: input.filters?.search,
        })
        const items = (result[0] || []).map(normalizeIssueRecord)
        return { items, total: result[1] ?? 0 }
      },
      get: async (issueId: string) => {
        const result = await invoke('get_issue_details', { issueId: toId(issueId) })
        return result ? normalizeIssueRecord(result) : null
      },
      /** Run post-crawl cross-page analysis (duplicate titles, canonical clusters, etc.). */
      runPostCrawl: async (crawlId: string) => {
        const result = await invoke<number>('run_post_crawl', { crawlId: toId(crawlId) })
        return result
      },
    },
    links: {
      list: async (input: any) => {
        const result = await invoke<[any[], number]>('query_links', {
          crawlId: input.crawlId ? toId(input.crawlId) : undefined,
          page: input.page ?? 0,
          pageSize: input.pageSize ?? 50,
          filterRelation: undefined,
          filterIsInternal: input.filters?.isInternal !== undefined
            ? input.filters.isInternal
            : null,
        })
        const items = (result[0] || []).map(normalizeLinkRecord)
        return { items, total: result[1] ?? 0 }
      },
      summarize: (crawlId: string) => invoke('summarize_links', { crawlId: toId(crawlId) }),
    },
    exports: {
      exportUrls: async (input: any) => {
        const crawlId = input.crawlId ?? input.projectId
        const result = await invoke('export_urls_csv', {
          crawlId: toId(crawlId),
          outputPath: await exportPath('urls', crawlId),
          filterIndexability: input.filters?.indexability,
          sortBy: input.sort?.field,
          sortOrder: input.sort?.direction,
        })
        return normalizeExportResult(result)
      },
      exportIssues: async (input: any) => {
        const crawlId = input.crawlId ?? input.projectId
        const result = await invoke('export_issues_csv', {
          crawlId: toId(crawlId),
          outputPath: await exportPath('issues', crawlId),
          filterType: input.filters?.issueType,
          filterSeverity: input.filters?.severity,
          filterCategory: input.filters?.category,
          search: input.filters?.search,
        })
        return normalizeExportResult(result)
      },
      exportLinks: async (input: any) => {
        const crawlId = input.crawlId ?? input.projectId
        const result = await invoke('export_links_csv', {
          crawlId: toId(crawlId),
          outputPath: await exportPath('links', crawlId),
          filterRelation: input.filters?.linkRelation,
          filterIsInternal: input.filters?.isInternal,
        })
        return normalizeExportResult(result)
      },
    },
    app: {
      getVersion: () => invoke('get_version'),
      getDataPath: () => invoke('get_data_path'),
      openExternalUrl: (url: string) => invoke('open_external_url', { url }),
      openPath: () => unavailable('Open path'),
    },
    settings: {
      get: () => invoke('get_settings'),
      update: (settings: Record<string, unknown>) => invoke('update_settings', { settings }),
    },
    keywords: {
      analyze: (crawlId: string | number, gramType: 'unigrams' | 'bigrams' | 'trigrams') =>
        invoke('analyze_keywords', { crawlId: toId(crawlId), gramType }),
    },
    clusters: {
      find: (crawlId: string | number) =>
        invoke('find_clusters', { crawlId: toId(crawlId) }),
    },
    extractions: {
      list: () => unavailable('Extraction rules'),
      create: () => unavailable('Extraction rules'),
      update: () => unavailable('Extraction rules'),
      delete: () => unavailable('Extraction rules'),
    },
    schedules: {
      list: () => unavailable('Crawl schedules'),
      create: () => unavailable('Crawl schedules'),
      update: () => unavailable('Crawl schedules'),
      delete: () => unavailable('Crawl schedules'),
    },
    diff: {
      get: () => unavailable('Crawl diff'),
      listByProject: () => unavailable('Crawl diff'),
    },
    psi: {
      listByCrawl: () => unavailable('PageSpeed results'),
      summarize: () => unavailable('PageSpeed results'),
    },
  }

  window.dispatchEvent(new Event(READY_EVENT))
}

// Try immediately (works when Tauri preload already set window.crawldesk
// or when Tauri has already injected window.__TAURI__)
setupCrawldesk()

// If window.crawldesk is still not set, wait for Tauri's global to appear.
// This handles the case where Tauri injects __TAURI__ after our module runs.
if (!window.crawldesk && !getTauri()) {
  // Check for mock mode (Playwright testing or dev without Tauri)
  const useMock = localStorage.getItem('crawldesk-mock') === 'true' || window.location.search.includes('mock=true')
  if (useMock) {
    import('./mock-backend').then(({ setupMockCrawldesk }) => {
      setupMockCrawldesk()
      console.log('[tauri-api] Mock backend activated')
    })
  } else {
    // Poll for up to 5 seconds for window.__TAURI__ to appear
    const interval = setInterval(() => {
      if (getTauri()) {
        clearInterval(interval)
        setupCrawldesk()
      }
    }, 50)
    // Stop polling after 5 seconds
    setTimeout(() => clearInterval(interval), 5000)
  }
}

export {}
