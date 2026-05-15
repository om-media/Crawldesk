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
         <p>This local fixture verifies the packaged crawl pipeline.</p>
         <a href="/about">About</a>
         <a href="/missing">Missing page</a>
         <img src="/hero.jpg">`,
        `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"Smoke Fixture Home"}</script>`
      ))
      return
    }
    if (url.pathname === '/about') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(fixtureHtml('Smoke Fixture About', '<h1>About Fixture</h1><p>About page body text.</p><a href="/">Home</a>'))
      return
    }
    if (url.pathname === '/sitemap-only') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(fixtureHtml('Sitemap Only', '<h1>Sitemap Only</h1><p>This URL is discovered from sitemap.xml.</p>'))
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
      const crawl = await window.crawldesk.crawls.create(project.id, {
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
      })

      const deadline = Date.now() + 30000
      let latest = null
      while (Date.now() < deadline) {
        const crawls = await window.crawldesk.crawls.listByProject(project.id)
        latest = crawls.find((item) => String(item.id) === String(crawl.id)) || crawls[0] || null
        if (latest && ['completed', 'failed', 'stopped'].includes(latest.status)) break
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      await new Promise((resolve) => setTimeout(resolve, 1000))
      const urls = await window.crawldesk.urls.list({ projectId: project.id, crawlId: crawl.id, page: 0, pageSize: 50 })
      const urlsByCrawlOnly = await window.crawldesk.urls.list({ crawlId: crawl.id, page: 0, pageSize: 50 })
      const issues = await window.crawldesk.issues.summarize(crawl.id)
      const issueRows = await window.crawldesk.issues.list({ crawlId: crawl.id, page: 0, pageSize: 100 })
      const links = await window.crawldesk.links.list({ crawlId: crawl.id, page: 0, pageSize: 50 })
      const definitions = await window.crawldesk.issues.definitions()

      await window.crawldesk.projects.delete(project.id)
      const projectsAfterDelete = await window.crawldesk.projects.list()

      return {
        projectId: project.id,
        crawlId: crawl.id,
        status: latest?.status || null,
        urlTotal: urls.total ?? urls.items?.length ?? 0,
        crawlOnlyUrlTotal: urlsByCrawlOnly.total ?? urlsByCrawlOnly.items?.length ?? 0,
        urls: (urls.items || []).map((item) => ({ url: item.url, status: item.status_code ?? item.statusCode })),
        crawlOnlyUrls: (urlsByCrawlOnly.items || []).map((item) => ({ url: item.url, status: item.status_code ?? item.statusCode })),
        issueTypes: (issues || []).map((issue) => issue.issue_type),
        issueRows: (issueRows.items || []).map((issue) => ({ url: issue.url, type: issue.issue_type ?? issue.issueType })),
        issueTotal: (issues || []).reduce((sum, issue) => sum + Number(issue.count || 0), 0),
        linkTotal: links.total ?? links.items?.length ?? 0,
        definitionCount: definitions.length,
        projectDeleted: !projectsAfterDelete.some((item) => String(item.id) === String(project.id)),
      }
    }, { fixtureBase })

    record('release crawl completes', result.status === 'completed', `status=${result.status}`)
    record('release crawl stores URLs', result.urlTotal >= 3, `${result.urlTotal} urls`)
    record('release crawl-only URL query returns rows', result.crawlOnlyUrlTotal >= 3, `${result.crawlOnlyUrlTotal} urls`)
    record('release crawl captures 404 fixture URL', result.urls.some((item) => item.status === 404), JSON.stringify(result.urls))
    record('release sitemap image does not get missing-title issue', result.urls.some((item) => item.url.endsWith('/hero.jpg')) && !result.issueRows.some((item) => item.url.endsWith('/hero.jpg') && item.type === 'missing_title'), JSON.stringify(result.issueRows))
    record('release 404 page only gets HTTP/sitemap issues', !result.issueRows.some((item) => item.url.endsWith('/missing') && ['missing_title', 'missing_h1', 'missing_meta_description'].includes(item.type)), JSON.stringify(result.issueRows))
    record('release post-crawl/issue summary returns issues', result.issueTotal > 0, `${result.issueTotal} issues: ${result.issueTypes.join(', ')}`)
    record('release crawl stores links', result.linkTotal > 0, `${result.linkTotal} links`)
    record('release issue registry command works', result.definitionCount > 20, `${result.definitionCount} definitions`)
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
