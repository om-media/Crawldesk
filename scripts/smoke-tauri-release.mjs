import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import process from 'node:process'
import puppeteer from 'puppeteer-core'

const repoRoot = process.cwd()
const exePath = process.env.CRAWLDESK_EXE || path.join(repoRoot, 'src-tauri', 'target', 'release', 'crawldesk.exe')
const debugPort = Number(process.env.CRAWLDESK_WEBVIEW_DEBUG_PORT || 9333)
const tempRoot = process.env.CRAWLDESK_SMOKE_TMP || path.join(repoRoot, '.tmp')
const appData = path.join(tempRoot, 'tauri-release-smoke-appdata')
const checks = []

function record(name, passed, detail = '') {
  checks.push({ name, passed, detail })
  const prefix = passed ? 'PASS' : 'FAIL'
  console.log(`${prefix} ${name}${detail ? ` - ${detail}` : ''}`)
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function fixtureHtml(title, body, extraHead = '') {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <meta name="description" content="CrawlDesk packaged smoke fixture page">
  <link rel="canonical" href="/">
  ${extraHead}
</head>
<body>
  ${body}
</body>
</html>`
}

async function startFixtureServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (url.pathname === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n')
      return
    }
    if (url.pathname === '/sitemap.xml') {
      const origin = `http://127.0.0.1:${server.address().port}`
      res.writeHead(200, { 'content-type': 'application/xml' })
      res.end(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${origin}/</loc></url>
  <url><loc>${origin}/about</loc></url>
  <url><loc>${origin}/sitemap-only</loc></url>
  <url><loc>${origin}/hero.jpg</loc></url>
  <url><loc>${origin}/missing</loc></url>
</urlset>`)
      return
    }
    if (url.pathname === '/') {
      res.writeHead(200, {
        'content-type': 'text/html',
        'strict-transport-security': 'max-age=31536000',
        'content-security-policy': "default-src 'self'",
        'x-frame-options': 'DENY',
        'referrer-policy': 'strict-origin-when-cross-origin',
      })
      res.end(fixtureHtml(
        'Smoke Fixture Home',
        `<h1>Smoke Fixture</h1>
         <p>Adventure planning content cluster topic verifies the packaged crawl pipeline.</p>
         <p>Adventure planning content cluster topic repeats for keyword analysis.</p>
         <a href="/about">About</a>
         <a href="/about">Learn more</a>
         <a href="/sitemap-only">Learn more</a>
         <a href="/missing">Missing page</a>
         <img src="/hero.jpg">`,
        `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"Smoke Fixture Home"}</script>`
      ))
      return
    }
    if (url.pathname === '/about') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(fixtureHtml('Smoke Fixture About', '<h1>About Fixture</h1><p>Adventure planning content cluster topic supports grouped crawl analysis.</p><p>Adventure planning content cluster topic repeats on the about page.</p><a href="/">Home</a><a href="/">Learn more</a>'))
      return
    }
    if (url.pathname === '/sitemap-only') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(fixtureHtml('Sitemap Only', '<h1>Sitemap Only</h1><p>Adventure planning content cluster topic appears from sitemap discovery.</p><p>Adventure planning content cluster topic repeats on sitemap content.</p><a href="/">Learn more</a>'))
      return
    }
    if (url.pathname === '/hero.jpg') {
      const jpg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2w==', 'base64')
      res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': String(jpg.length) })
      res.end(jpg)
      return
    }
    if (url.pathname === '/missing') {
      res.writeHead(404, { 'content-type': 'text/html' })
      res.end(fixtureHtml('Missing Fixture', '<h1>Missing</h1><p>This page intentionally returns 404.</p>'))
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return server
}

async function waitForDebugPort(timeoutMs = 20000) {
  const started = Date.now()
  const url = `http://127.0.0.1:${debugPort}/json/version`
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // WebView2 debug endpoint is still starting.
    }
    await wait(300)
  }
  throw new Error(`Timed out waiting for WebView2 remote debugging at ${url}`)
}

async function waitForTauriPage(browser, timeoutMs = 20000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const pages = await browser.pages()
    for (const page of pages) {
      try {
        const ready = await page.evaluate(() => Boolean(window.crawldesk?.projects?.create)).catch(() => false)
        if (ready) return page
      } catch {
        // Ignore transient navigation targets.
      }
    }
    await wait(300)
  }
  throw new Error('Timed out waiting for CrawlDesk WebView page')
}

async function runSmoke() {
  if (!existsSync(exePath)) {
    throw new Error(`Release executable not found: ${exePath}. Run npm run tauri:build first.`)
  }
  if (process.platform !== 'win32') {
    throw new Error('The packaged Tauri release smoke currently supports Windows/WebView2 only.')
  }

  mkdirSync(tempRoot, { recursive: true })
  rmSync(appData, { recursive: true, force: true })
  mkdirSync(appData, { recursive: true })

  const fixture = await startFixtureServer()
  const fixtureBase = `http://127.0.0.1:${fixture.address().port}/`
  let app
  let browser

  try {
    app = spawn(exePath, [], {
      cwd: repoRoot,
      env: {
        ...process.env,
        APPDATA: appData,
        LOCALAPPDATA: path.join(appData, 'Local'),
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false,
    })

    await waitForDebugPort()
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${debugPort}` })
    const page = await waitForTauriPage(browser)
    page.setDefaultTimeout(15000)
    record('release WebView exposes crawldesk bridge', true)

    const result = await page.evaluate(async ({ fixtureBase }) => {
      const name = `Packaged Smoke ${Date.now()}`
      const project = await window.crawldesk.projects.create({ name, rootUrl: fixtureBase })
      const crawlSettings = {
        startUrl: fixtureBase,
        maxUrls: 10,
        maxDepth: 2,
        concurrency: 2,
        delayBetweenRequestsMs: 0,
        requestTimeoutMs: 5000,
        timeoutSeconds: 5,
        respectRobotsTxt: true,
        respectSitemaps: true,
        crawlSubdomains: false,
        checkExternalLinks: false,
        crawlExternalLinks: false,
        userAgent: 'CrawlDeskPackagedSmoke/1.0',
        includePatterns: [],
        excludePatterns: [],
      }

      async function waitForCrawl(crawlId) {
        const deadline = Date.now() + 30000
        let latest = null
        while (Date.now() < deadline) {
          const crawls = await window.crawldesk.crawls.listByProject(project.id)
          latest = crawls.find((item) => String(item.id) === String(crawlId)) || crawls[0] || null
          if (latest && ['completed', 'failed', 'stopped'].includes(latest.status)) break
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
        return latest
      }

      const crawl = await window.crawldesk.crawls.create(project.id, crawlSettings)
      const latest = await waitForCrawl(crawl.id)

      await new Promise((resolve) => setTimeout(resolve, 1000))
      const urls = await window.crawldesk.urls.list({ projectId: project.id, crawlId: crawl.id, page: 0, pageSize: 50 })
      const urlsByCrawlOnly = await window.crawldesk.urls.list({ crawlId: crawl.id, page: 0, pageSize: 50 })
      const issues = await window.crawldesk.issues.summarize(crawl.id)
      const issueRows = await window.crawldesk.issues.list({ crawlId: crawl.id, page: 0, pageSize: 100 })
      const links = await window.crawldesk.links.list({ crawlId: crawl.id, page: 0, pageSize: 50 })
      const anchorSummary = await window.crawldesk.links.anchorSummary(crawl.id, 10)
      const definitions = await window.crawldesk.issues.definitions()
      const keywordUnigrams = await window.crawldesk.keywords.analyze(crawl.id, 'unigrams')
      const keywordBigrams = await window.crawldesk.keywords.analyze(crawl.id, 'bigrams')
      const keywordTrigrams = await window.crawldesk.keywords.analyze(crawl.id, 'trigrams')
      const clusters = await window.crawldesk.clusters.find(crawl.id)
      const extractionRule = await window.crawldesk.extractions.create({
        crawlId: crawl.id,
        name: 'Smoke title',
        selector: 'title',
        ruleType: 'css',
        attribute: '',
        active: true,
      })
      const extractionRuleUpdated = await window.crawldesk.extractions.update(extractionRule.id, {
        name: 'Smoke meta description',
        selector: 'meta[name="description"]',
        ruleType: 'css',
        attribute: 'content',
        active: 0,
      })
      const extractionRulesBeforeDelete = await window.crawldesk.extractions.list(crawl.id)
      await window.crawldesk.extractions.delete(extractionRule.id)
      const extractionRulesAfterDelete = await window.crawldesk.extractions.list(crawl.id)
      const schedule = await window.crawldesk.schedules.create({
        projectId: project.id,
        startUrl: fixtureBase,
        crawlSettingsJson: JSON.stringify({ maxUrls: 10, maxDepth: 1 }),
        cronExpression: '0 2 * * *',
      })
      const scheduleUpdated = await window.crawldesk.schedules.update(schedule.id, { enabled: false })
      const schedulesBeforeDelete = await window.crawldesk.schedules.list(project.id)
      await window.crawldesk.schedules.delete(schedule.id)
      const schedulesAfterDelete = await window.crawldesk.schedules.list(project.id)
      const activeExtractionRule = await window.crawldesk.extractions.create({
        crawlId: crawl.id,
        name: 'Smoke H1',
        selector: 'h1',
        ruleType: 'css',
        attribute: '',
        active: true,
      })
      const secondCrawl = await window.crawldesk.crawls.create(project.id, crawlSettings)
      const latestSecond = await waitForCrawl(secondCrawl.id)
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const secondExtractionRules = await window.crawldesk.extractions.list(secondCrawl.id)
      const secondUrls = await window.crawldesk.urls.list({ projectId: project.id, crawlId: secondCrawl.id, page: 0, pageSize: 50 })
      const diffRows = await window.crawldesk.diff.listByProject(project.id)

      function parseJson(value) {
        if (typeof value !== 'string') return value
        try {
          return JSON.parse(value)
        } catch {
          return null
        }
      }

      function extractionResultsForUrl(item) {
        const seo = parseJson(item.seoDataJson ?? item.seo_data_json) || {}
        const raw = item.extractionResults ?? item.extraction_results ?? seo.extractionResults ?? seo.extraction_results ?? []
        const parsed = parseJson(raw) || raw
        return Array.isArray(parsed) ? parsed : []
      }

      const secondExtractionResults = (secondUrls.items || []).flatMap((item) => (
        extractionResultsForUrl(item).map((result) => ({
          url: item.url,
          name: result.name,
          value: result.value,
          values: result.values,
          matchCount: result.matchCount,
          error: result.error,
        }))
      ))

      await window.crawldesk.projects.delete(project.id)
      const projectsAfterDelete = await window.crawldesk.projects.list()

      return {
        projectId: project.id,
        crawlId: crawl.id,
        status: latest?.status || null,
        secondCrawlId: secondCrawl.id,
        secondStatus: latestSecond?.status || null,
        urlTotal: urls.total ?? urls.items?.length ?? 0,
        crawlOnlyUrlTotal: urlsByCrawlOnly.total ?? urlsByCrawlOnly.items?.length ?? 0,
        urls: (urls.items || []).map((item) => ({ url: item.url, status: item.status_code ?? item.statusCode })),
        crawlOnlyUrls: (urlsByCrawlOnly.items || []).map((item) => ({ url: item.url, status: item.status_code ?? item.statusCode })),
        issueTypes: (issues || []).map((issue) => issue.issue_type),
        issueRows: (issueRows.items || []).map((issue) => ({ url: issue.url, type: issue.issue_type ?? issue.issueType })),
        issueTotal: (issues || []).reduce((sum, issue) => sum + Number(issue.count || 0), 0),
        linkTotal: links.total ?? links.items?.length ?? 0,
        anchorSummary,
        definitionCount: definitions.length,
        definitionIds: definitions.map((definition) => definition.id),
        keywordUnigrams,
        keywordBigrams,
        keywordTrigrams,
        clusters,
        extractionRuleUpdated,
        extractionRulesBeforeDelete,
        extractionRulesAfterDelete,
        activeExtractionRule,
        secondExtractionRules,
        secondExtractionResults,
        scheduleUpdated,
        schedulesBeforeDelete,
        schedulesAfterDelete,
        diffRows,
        projectDeleted: !projectsAfterDelete.some((item) => String(item.id) === String(project.id)),
      }
    }, { fixtureBase })

    record('release crawl completes', result.status === 'completed', `status=${result.status}`)
    record('release crawl stores URLs', result.urlTotal >= 3, `${result.urlTotal} urls`)
    record('release crawl-only URL query returns rows', result.crawlOnlyUrlTotal >= 3, `${result.crawlOnlyUrlTotal} urls`)
    record('release crawl captures 404 fixture URL', result.urls.some((item) => item.status === 404), JSON.stringify(result.urls))
    record('release sitemap image does not get missing-title issue', result.urls.some((item) => item.url.endsWith('/hero.jpg')) && !result.issueRows.some((item) => item.url.endsWith('/hero.jpg') && item.type === 'missing_title'), JSON.stringify(result.issueRows))
    record('release 404 page only gets HTTP/sitemap issues', !result.issueRows.some((item) => item.url.endsWith('/missing') && ['missing_title', 'missing_h1', 'missing_meta_description'].includes(item.type)), JSON.stringify(result.issueRows))
    record('release thin content detector finds short HTML pages', result.issueRows.some((item) => item.type === 'thin_content'), JSON.stringify(result.issueRows))
    record('release post-crawl/issue summary returns issues', result.issueTotal > 0, `${result.issueTotal} issues: ${result.issueTypes.join(', ')}`)
    record('release crawl stores links', result.linkTotal > 0, `${result.linkTotal} links`)
    record('release anchor text aggregation works', result.anchorSummary?.some((item) => item.anchorText === 'learn more' && item.count >= 4 && item.targetUrlCount >= 2), JSON.stringify(result.anchorSummary))
    record('release issue registry command works', result.definitionCount > 20, `${result.definitionCount} definitions`)
    record('release issue registry includes thin content', result.definitionIds.includes('thin_content'), result.definitionIds.join(', '))
    record('release keyword analysis returns unigrams', result.keywordUnigrams?.totalWords > 0 && result.keywordUnigrams?.totalPhrases > 0 && result.keywordUnigrams?.keywords?.some((item) => item.phrase === 'adventure' && item.count >= 3), JSON.stringify(result.keywordUnigrams))
    record('release keyword analysis returns bigrams', result.keywordBigrams?.totalWords > result.keywordBigrams?.totalPhrases && result.keywordBigrams?.keywords?.some((item) => item.phrase === 'adventure planning' && item.count >= 3), JSON.stringify(result.keywordBigrams))
    record('release keyword analysis returns trigrams', result.keywordTrigrams?.totalWords > result.keywordTrigrams?.totalPhrases && result.keywordTrigrams?.keywords?.some((item) => item.phrase === 'adventure planning content' && item.count >= 3), JSON.stringify(result.keywordTrigrams))
    record('release content clustering returns grouped pages', Array.isArray(result.clusters) && result.clusters.some((cluster) => Number(cluster.size) >= 2 && cluster.keywords?.includes('adventure')), JSON.stringify(result.clusters))
    record('release extraction rules CRUD works', result.extractionRuleUpdated?.name === 'Smoke meta description' && result.extractionRuleUpdated?.active === 0 && result.extractionRulesBeforeDelete.length === 1 && result.extractionRulesAfterDelete.length === 0, JSON.stringify({ updated: result.extractionRuleUpdated, before: result.extractionRulesBeforeDelete, after: result.extractionRulesAfterDelete }))
    record('release custom extraction results are applied during crawl', result.activeExtractionRule?.name === 'Smoke H1' && result.secondExtractionRules.length >= 1 && result.secondExtractionResults.some((item) => item.name === 'Smoke H1' && Array.isArray(item.values) && item.values.some((value) => value.includes('Smoke Fixture'))), JSON.stringify({ rules: result.secondExtractionRules, results: result.secondExtractionResults }))
    record('release crawl schedules CRUD works', result.scheduleUpdated?.enabled === 0 && result.scheduleUpdated?.next_run_at == null && result.schedulesBeforeDelete.length === 1 && result.schedulesAfterDelete.length === 0, JSON.stringify({ updated: result.scheduleUpdated, before: result.schedulesBeforeDelete, after: result.schedulesAfterDelete }))
    record('release crawl diff command compares completed crawls', result.secondStatus === 'completed' && result.diffRows.length >= 1 && result.diffRows.some((item) => String(item.crawl_b_id) === String(result.secondCrawlId)), JSON.stringify({ secondStatus: result.secondStatus, diffs: result.diffRows }))
    record('release project delete cascades', result.projectDeleted, `projectId=${result.projectId}`)

    const failed = checks.filter((check) => !check.passed)
    if (failed.length > 0) throw new Error(`${failed.length} release smoke checks failed`)
  } finally {
    if (browser) await browser.disconnect()
    if (app?.pid) spawnSync('taskkill', ['/pid', String(app.pid), '/t', '/f'], { stdio: 'ignore' })
    await new Promise((resolve) => fixture.close(resolve))
  }
}

runSmoke()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
