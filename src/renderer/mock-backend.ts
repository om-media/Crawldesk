/**
 * Mock backend for CrawlDesk — used when window.__TAURI__ is not available
 * (e.g. running in a regular browser for Playwright E2E testing).
 *
 * Provides realistic fake data so the full UI flow can be tested without Tauri.
 *
 * Activate: set localStorage.setItem('crawldesk-mock', 'true') before the app loads,
 * or just load the page in a browser without Tauri.
 */

const MOCK_DELAY = 150 // ms — simulates network latency

function delay(ms: number = MOCK_DELAY): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ── Mock Data ───────────────────────────────────────────────────

let nextProjectId = 3
let nextCrawlId = 2

const MOCK_PROJECTS = [
  { id: '1', name: 'Avanterra Park', root_url: 'https://avanterrapark.com', created_at: '2025-05-10T10:00:00Z', updated_at: '2025-05-13T08:30:00Z', lastCrawlDate: '2025-05-13T08:30:00Z', lastCrawlUrlCount: 247, lastCrawlIssueCount: 12 },
  { id: '2', name: 'Silent Jam Zone', root_url: 'https://silentjamzone.com', created_at: '2025-05-11T14:00:00Z', updated_at: '2025-05-12T09:00:00Z', lastCrawlDate: null, lastCrawlUrlCount: null, lastCrawlIssueCount: null },
]

const MOCK_CRAWLS: any[] = [
  { id: '1', project_id: '1', status: 'completed', settings_json: '{}', started_at: '2025-05-13T08:00:00Z', completed_at: '2025-05-13T08:30:00Z', error_message: null, url_count: 247, issue_count: 12, link_count: 1834, created_at: '2025-05-13T08:00:00Z' },
]

function makeMockUrls(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    url: `https://avanterrapark.com/${i === 0 ? '' : `page-${i + 1}`}`,
    project_id: 1,
    crawl_id: 1,
    status_code: [200, 200, 200, 200, 301, 404, 500][i % 7],
    title: `Page ${i + 1} - Avanterra Park`,
    meta_description: `Description for page ${i + 1}`,
    indexability: i % 7 === 5 ? 'noindex' : i % 7 === 6 ? 'non_indexable' : 'indexable',
    depth: Math.min(i, 5),
    response_time_ms: Math.round(100 + Math.random() * 900),
    content_type: 'text/html',
    content_length: Math.round(5000 + Math.random() * 45000),
    word_count: Math.round(200 + Math.random() * 2800),
    h1: i % 3 === 0 ? `Heading ${i + 1}` : null,
    canonical: i % 5 === 0 ? `https://avanterrapark.com/page-${i + 1}` : null,
    is_internal: true,
    is_crawlable: i % 7 !== 6,
    normalized_url: `https://avanterrapark.com/${i === 0 ? '' : `page-${i + 1}`}`,
    created_at: '2025-05-13T08:15:00Z',
    updated_at: '2025-05-13T08:15:00Z',
    fetch_result_json: JSON.stringify({
      statusCode: [200, 200, 200, 200, 301, 404, 500][i % 7],
      responseTimeMs: Math.round(100 + Math.random() * 900),
      contentType: 'text/html',
      contentLength: Math.round(5000 + Math.random() * 45000),
      finalUrl: `https://avanterrapark.com/page-${i + 1}`,
      isError: [200, 200, 200, 200, 301, 404, 500][i % 7] >= 400,
      errorMessage: null,
    }),
    seo_data_json: JSON.stringify({
      title: `Page ${i + 1} - Avanterra Park`,
      metaDescription: `Description for page ${i + 1}`,
      h1: i % 3 === 0 ? `Heading ${i + 1}` : null,
      canonicalUrl: i % 5 === 0 ? `https://avanterrapark.com/page-${i + 1}` : null,
      wordCount: Math.round(200 + Math.random() * 2800),
    }),
  }))
}

const MOCK_URLS = makeMockUrls(247)

const MOCK_ISSUES = [
  { id: '1', issueType: 'missing_title', severity: 'critical', category: 'content', urlId: 5, url: 'https://avanterrapark.com/page-5', message: 'Title tag is missing', detailsJson: null, detectedAt: '2025-05-13T08:20:00Z', isFixed: false, label: 'Missing Title Tag', explanation: 'This page has no title tag', recommendation: 'Add a descriptive title tag', count: 3 },
  { id: '2', issueType: 'duplicate_title', severity: 'warning', category: 'content', urlId: 8, url: 'https://avanterrapark.com/page-8', message: 'Title tag is duplicated', detailsJson: null, detectedAt: '2025-05-13T08:20:00Z', isFixed: false, label: 'Duplicate Title Tag', explanation: 'Multiple pages share the same title', recommendation: 'Make each title unique', count: 5 },
  { id: '3', issueType: 'missing_meta_description', severity: 'warning', category: 'content', urlId: 12, url: 'https://avanterrapark.com/page-12', message: 'Meta description is missing', detailsJson: null, detectedAt: '2025-05-13T08:20:00Z', isFixed: false, label: 'Missing Meta Description', explanation: 'Page has no meta description', recommendation: 'Add a meta description of 120-160 characters', count: 4 },
]

const MOCK_LINKS = Array.from({ length: 50 }, (_, i) => ({
  id: String(i + 1),
  source_url_id: Math.floor(i / 5) + 1,
  source_url: `https://avanterrapark.com/page-${Math.floor(i / 5) + 1}`,
  target_url: i % 3 === 0 ? `https://external-site.com/resource-${i}` : `https://avanterrapark.com/page-${(i % 47) + 1}`,
  link_relation: i % 4 === 0 ? 'a' : 'link',
  anchor_text: `Link text ${i + 1}`,
  is_internal: i % 3 !== 0,
  is_no_follow: i % 7 === 0,
  detected_at: '2025-05-13T08:18:00Z',
  link_type: i % 3 !== 0 ? 'internal' : 'external',
}))

const MOCK_URL_SUMMARY = {
  totalUrls: 247,
  indexable: 210,
  nonIndexable: 37,
  statusCodeDistribution: { '200': 210, '301': 15, '404': 12, '500': 10 },
}

const MOCK_LINK_SUMMARY = {
  totalLinks: 1834,
  totalInternal: 1200,
  totalExternal: 634,
  brokenCount: 12,
}

// ── Mock API ────────────────────────────────────────────────────

export function setupMockCrawldesk() {
  if (window.crawldesk) return

  console.log('[Mock] Setting up mock window.crawldesk for Playwright testing')

  window.crawldesk = {
    projects: {
      create: async (input: any) => {
        await delay()
        const project = {
          id: String(nextProjectId++),
          name: input.name,
          root_url: input.rootUrl,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          lastCrawlDate: null,
          lastCrawlUrlCount: null,
          lastCrawlIssueCount: null,
        }
        MOCK_PROJECTS.push(project)
        return project
      },
      list: async () => { await delay(); return MOCK_PROJECTS },
      get: async (id: string) => { await delay(); return MOCK_PROJECTS.find(p => p.id === id) || null },
      update: async (id: string, patch: any) => {
        await delay()
        const p = MOCK_PROJECTS.find(p => p.id === id)
        if (p) { if (patch.name) p.name = patch.name; if (patch.rootUrl) p.root_url = patch.rootUrl }
        return p
      },
      delete: async (id: string) => {
        await delay()
        const idx = MOCK_PROJECTS.findIndex(p => p.id === id)
        if (idx >= 0) MOCK_PROJECTS.splice(idx, 1)
        // Also clean up associated crawls
        for (let i = MOCK_CRAWLS.length - 1; i >= 0; i--) {
          if (MOCK_CRAWLS[i].project_id === id) MOCK_CRAWLS.splice(i, 1)
        }
      },
    },
    crawls: {
      create: async (projectId: string, settings: any) => {
        await delay(500) // slower — simulates starting a crawl
        const crawl: Record<string, unknown> & { completed_at: string | null } = {
          id: String(nextCrawlId++),
          project_id: String(projectId),
          status: 'running',
          settings_json: JSON.stringify(settings),
          started_at: new Date().toISOString(),
          completed_at: null,
          error_message: null,
          url_count: 0,
          issue_count: 0,
          link_count: 0,
          created_at: new Date().toISOString(),
        }
        MOCK_CRAWLS.push(crawl)
        // Simulate crawl progress after a delay
        setTimeout(() => {
          crawl.status = 'completed'
          crawl.url_count = 247
          crawl.issue_count = 12
          crawl.link_count = 1834
          crawl.completed_at = new Date().toISOString()
        }, 2000)
        return crawl
      },
      pause: async () => { await delay(); console.log('[Mock] Crawl paused') },
      resume: async () => { await delay(); console.log('[Mock] Crawl resumed') },
      stop: async () => { await delay(); console.log('[Mock] Crawl stopped') },
      get: async (crawlId: string) => {
        await delay()
        return MOCK_CRAWLS.find(c => c.id === crawlId) || null
      },
      listByProject: async (projectId: string) => {
        await delay()
        return MOCK_CRAWLS.filter(c => c.project_id === projectId)
      },
      onProgress: (cb: (progress: any) => void) => {
        // Simulate progress events
        const crawl = MOCK_CRAWLS[MOCK_CRAWLS.length - 1]
        if (crawl && crawl.status === 'running') {
          const progress = { crawlId: crawl.id, status: 'running', totalDiscovered: 10, totalQueued: 5, totalCompleted: 3, totalFailed: 0, totalBlocked: 0 }
          cb(progress)
        }
        return () => {}
      },
      onStatus: (cb: (status: any) => void) => {
        const crawl = MOCK_CRAWLS[MOCK_CRAWLS.length - 1]
        if (crawl) cb({ crawlId: crawl.id, status: crawl.status })
        return () => {}
      },
    },
    urls: {
      list: async (input: any) => {
        await delay()
        const page = input.page ?? 0
        const pageSize = input.pageSize ?? 50
        const sort = input.sort ?? { field: 'url', direction: 'asc' }
        const filters = input.filters ?? {}
        let items = [...MOCK_URLS]
        // Apply search filter
        if (filters.search) {
          const q = filters.search.toLowerCase()
          items = items.filter(u =>
            (u.url || '').toLowerCase().includes(q) ||
            (u.title || '').toLowerCase().includes(q) ||
            (u.meta_description || '').toLowerCase().includes(q)
          )
        }
        // Apply status category filter
        if (filters.statusCategory) {
          const cat = filters.statusCategory
          items = items.filter(u => {
            const code = u.status_code
            if (cat === '2xx') return code >= 200 && code < 300
            if (cat === '3xx') return code >= 300 && code < 400
            if (cat === '4xx') return code >= 400 && code < 500
            if (cat === '5xx') return code >= 500
            return true
          })
        }
        // Apply indexability filter
        if (filters.indexability) {
          if (filters.indexability === 'non_indexable') {
            items = items.filter(u => u.indexability === 'non_indexable' || u.indexability === 'noindex')
          } else {
            items = items.filter(u => u.indexability === filters.indexability)
          }
        }
        // Sort
        const fieldMap: Record<string, (u: any) => any> = {
          url: (u: any) => u.url,
          status_code: (u: any) => u.status_code,
          statusCode: (u: any) => u.status_code,
          indexability: (u: any) => u.indexability,
          title: (u: any) => u.title || '',
          depth: (u: any) => u.depth,
          response_time_ms: (u: any) => u.response_time_ms || 0,
          responseTimeMs: (u: any) => u.response_time_ms || 0,
        }
        const getter = fieldMap[sort.field] || fieldMap['url']
        const dir = sort.direction === 'desc' ? -1 : 1
        items.sort((a, b) => {
          const va = getter(a)
          const vb = getter(b)
          if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
          return String(va).localeCompare(String(vb)) * dir
        })
        const total = items.length
        const start = page * pageSize
        const pagedItems = items.slice(start, start + pageSize)
        return { items: pagedItems, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
      },
      get: async (urlId: string) => {
        await delay()
        const record = MOCK_URLS.find(u => u.id === urlId) || null
        return record
      },
      summarize: async () => { await delay(); return MOCK_URL_SUMMARY },
    },
    issues: {
      definitions: async () => {
        await delay()
        return [
          { id: 'missing_title', severity: 'critical', category: 'content', label: 'Missing title', explanation: 'The page has no title tag or the title is empty.', recommendation: 'Add a descriptive, unique title tag.' },
          { id: 'duplicate_title', severity: 'warning', category: 'content', label: 'Duplicate title', explanation: 'Multiple pages share the same title.', recommendation: 'Give each indexable page a unique title.' },
          { id: 'missing_meta_description', severity: 'warning', category: 'content', label: 'Missing meta description', explanation: 'The page has no meta description.', recommendation: 'Add a concise meta description.' },
          { id: 'internal_link_to_4xx', severity: 'critical', category: 'links', label: 'Internal link to 4xx', explanation: 'An internal link points to a client error URL.', recommendation: 'Update or remove the broken internal link.' },
        ]
      },
      summarize: async () => {
        await delay()
        // Return proper summary objects (issue_type, severity, count)
        return [
          { issue_type: 'missing_title', severity: 'critical', category: 'content', count: 3, label: 'Missing Title Tag', explanation: 'Pages have no title tag', recommendation: 'Add descriptive title tags' },
          { issue_type: 'duplicate_title', severity: 'warning', category: 'content', count: 5, label: 'Duplicate Title Tag', explanation: 'Multiple pages share the same title', recommendation: 'Make each title unique' },
          { issue_type: 'missing_meta_description', severity: 'warning', category: 'content', count: 4, label: 'Missing Meta Description', explanation: 'Pages have no meta description', recommendation: 'Add meta descriptions' },
          { issue_type: 'internal_link_to_4xx', severity: 'critical', category: 'links', count: 2, label: 'Internal Link To 4xx', explanation: 'Internal links return 404', recommendation: 'Fix or remove broken links' },
        ]
      },
      list: async (input: any) => {
        await delay()
        const issueType = input.filters?.issueType
        const severity = input.filters?.severity
        const category = input.filters?.category
        const search = input.filters?.search?.toLowerCase()
        const issueUrls: Record<string, any[]> = {
          missing_title: [
            { id: '1', issue_type: 'missing_title', category: 'content', url: '/about', severity: 'critical', message: 'Title tag is empty' },
            { id: '2', issue_type: 'missing_title', category: 'content', url: '/contact', severity: 'critical', message: 'Title tag is empty' },
            { id: '3', issue_type: 'missing_title', category: 'content', url: '/blog/post-3', severity: 'critical', message: 'Title tag is empty' },
          ],
          missing_meta_description: [
            { id: '4', issue_type: 'missing_meta_description', category: 'content', url: '/', severity: 'warning', message: 'No meta description found' },
            { id: '5', issue_type: 'missing_meta_description', category: 'content', url: '/services', severity: 'warning', message: 'No meta description found' },
            { id: '6', issue_type: 'missing_meta_description', category: 'content', url: '/team', severity: 'warning', message: 'No meta description found' },
          ],
          internal_link_to_4xx: [
            { id: '9', issue_type: 'internal_link_to_4xx', category: 'links', url: '/old-page', severity: 'critical', message: 'Returns 404' },
            { id: '10', issue_type: 'internal_link_to_4xx', category: 'links', url: '/removed-product', severity: 'critical', message: 'Returns 404' },
          ],
          duplicate_title: [
            { id: '20', issue_type: 'duplicate_title', category: 'content', url: '/products/a', severity: 'warning', message: 'Duplicate of /products/b title' },
            { id: '21', issue_type: 'duplicate_title', category: 'content', url: '/products/b', severity: 'warning', message: 'Duplicate of /products/a title' },
          ],
        }
        let urls: any[] = (issueType && issueUrls[issueType]) || [
          { id: '99', issue_type: 'example_issue', category: 'content', url: '/example', severity: 'warning', message: 'Issue detected' },
        ]
        if (severity) urls = urls.filter(issue => issue.severity === severity)
        if (category) urls = urls.filter(issue => issue.category === category)
        if (search) {
          urls = urls.filter(issue => [issue.url, issue.message, issue.issue_type, issue.category].join(' ').toLowerCase().includes(search))
        }
        return { items: urls, total: urls.length }
      },
      get: async (issueId: string) => {
        await delay()
        const detail = MOCK_ISSUES.find(issue => issue.id === issueId) || {
          id: issueId,
          issueType: 'example_issue',
          severity: 'warning',
          category: 'content',
          urlId: 99,
          url: '/example',
          message: 'Issue detected',
          detailsJson: JSON.stringify({ recommendation: 'Review this issue in the page source.' }),
          detectedAt: '2025-05-13T08:20:00Z',
          isFixed: false,
        }
        const normalizedDetail = detail as any
        return {
          id: String(normalizedDetail.id),
          issue_type: normalizedDetail.issueType ?? normalizedDetail.issue_type,
          severity: normalizedDetail.severity,
          category: normalizedDetail.category,
          url_id: normalizedDetail.urlId ?? 99,
          url: normalizedDetail.url,
          message: normalizedDetail.message,
          details_json: normalizedDetail.detailsJson ?? JSON.stringify({ recommendation: normalizedDetail.recommendation }),
          detected_at: normalizedDetail.detectedAt ?? '2025-05-13T08:20:00Z',
          is_fixed: normalizedDetail.isFixed ?? false,
          label: normalizedDetail.label ?? null,
          explanation: normalizedDetail.explanation ?? null,
          recommendation: normalizedDetail.recommendation ?? null,
        }
      },
    },
    links: {
      list: async (input: any) => {
        await delay()
        let filtered = [...MOCK_LINKS]
        if (input.filters?.isInternal === true) filtered = filtered.filter(l => l.is_internal)
        if (input.filters?.isInternal === false) filtered = filtered.filter(l => !l.is_internal)
        if (input.filters?.sourceUrl) filtered = filtered.filter(l => l.source_url === input.filters.sourceUrl)
        if (input.filters?.targetUrl) filtered = filtered.filter(l => l.target_url === input.filters.targetUrl)
        const page = input.page ?? 0
        const pageSize = input.pageSize ?? 50
        const start = page * pageSize
        const items = filtered.slice(start, start + pageSize)
        return { items, total: filtered.length }
      },
      summarize: async () => { await delay(); return MOCK_LINK_SUMMARY },
    },
    exports: {
      exportUrls: async () => { await delay(); return { filePath: '/tmp/urls-1.csv', rowCount: 247 } },
      exportIssues: async () => { await delay(); return { filePath: '/tmp/issues-1.csv', rowCount: 12 } },
      exportLinks: async () => { await delay(); return { filePath: '/tmp/links-1.csv', rowCount: 1834 } },
    },
    app: {
      getVersion: async () => '0.1.0-mock',
      getDataPath: async () => '/tmp/crawldesk-mock',
      openExternalUrl: async () => { console.log('[Mock] Open external URL') },
      openPath: async () => { throw new Error('Open path is not implemented in mock mode') },
    },
    keywords: { analyze: async () => ([]), },
    clusters: { find: async () => ([]), },
    extractions: { list: async () => [], create: async () => ({}), update: async () => ({}), delete: async () => ({}) },
    schedules: { list: async () => [], create: async () => ({}), update: async () => ({}), delete: async () => ({}) },
    diff: { get: async () => null, listByProject: async () => [] },
    psi: { listByCrawl: async () => [], summarize: async () => null },
  }

  window.dispatchEvent(new Event('crawldesk:ready'))
}
