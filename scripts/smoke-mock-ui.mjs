import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import puppeteer from 'puppeteer-core'

const repoRoot = process.cwd()
const preferredPort = Number(process.env.CRAWLDESK_SMOKE_PORT || 5173)
const checks = []

function record(name, passed, detail = '') {
  checks.push({ name, passed, detail })
  const prefix = passed ? 'PASS' : 'FAIL'
  console.log(`${prefix} ${name}${detail ? ` - ${detail}` : ''}`)
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.platform === 'win32' && path.join(process.env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe'),
    process.platform === 'win32' && path.join(process.env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    process.platform === 'win32' && path.join(process.env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe'),
    process.platform === 'win32' && path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
    process.platform === 'linux' && '/usr/bin/google-chrome',
    process.platform === 'linux' && '/usr/bin/chromium',
    process.platform === 'linux' && '/snap/bin/chromium',
    process.platform === 'darwin' && '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean)

  const found = candidates.find((candidate) => existsSync(candidate))
  if (!found) {
    throw new Error('No Chrome/Chromium executable found. Set CHROME_PATH to run the smoke test.')
  }
  return found
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true))
    })
  })
}

async function findAvailablePort(preferred) {
  if (process.env.CRAWLDESK_SMOKE_PORT || await canListen(preferred)) {
    return preferred
  }

  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : preferred
      server.close(() => resolve(port))
    })
  })
}

async function waitForServer(url, timeoutMs = 20000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Server is still starting.
    }
    await wait(300)
  }
  throw new Error(`Timed out waiting for Vite at ${url}`)
}

async function clickText(page, text, selector = 'button,a,[role="button"],.card') {
  const box = await page.evaluate(({ text, selector }) => {
    const needle = text.toLowerCase()
    const elements = Array.from(document.querySelectorAll(selector))
    const match = elements.find((element) => {
      const label = element.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || ''
      const disabled = element instanceof HTMLButtonElement && element.disabled
      const rect = element.getBoundingClientRect()
      return !disabled && rect.width > 0 && rect.height > 0 && label.includes(needle)
    })
    if (!match) return null
    match.scrollIntoView({ block: 'center', inline: 'center' })
    const rect = match.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }, { text, selector })
  if (!box) throw new Error(`Could not click text: ${text}`)
  await page.mouse.click(box.x, box.y)
}

async function fillByLabel(page, labelText, value, selector = 'input,textarea') {
  const filled = await page.evaluate(({ labelText, value, selector }) => {
    const needle = labelText.toLowerCase()
    const label = Array.from(document.querySelectorAll('label')).find((element) => {
      const text = element.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || ''
      return text.includes(needle)
    })
    const input = label?.parentElement?.querySelector(selector)
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return false

    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    valueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.blur()
    return true
  }, { labelText, value, selector })

  if (!filled) throw new Error(`Could not fill field labelled: ${labelText}`)
}

async function fillByPlaceholder(page, placeholderText, value) {
  const filled = await page.evaluate(({ placeholderText, value }) => {
    const input = Array.from(document.querySelectorAll('input,textarea')).find((element) => {
      return element.getAttribute('placeholder')?.toLowerCase().includes(placeholderText.toLowerCase())
    })
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return false

    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    valueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    input.blur()
    return true
  }, { placeholderText, value })

  if (!filled) throw new Error(`Could not fill field with placeholder: ${placeholderText}`)
}

async function bodyIncludes(page, text) {
  return page.evaluate((expected) => document.body.textContent?.includes(expected) ?? false, text)
}

async function visibleRows(page) {
  return page.evaluate(() => {
    const tableRows = document.querySelectorAll('tbody tr').length
    const resultsRows = document.querySelectorAll('[data-results-row]').length
    const resultRows = Array.from(document.querySelectorAll('.absolute.left-0.right-0'))
      .filter((row) => row.textContent?.includes('http')).length
    const virtualRows = document.querySelectorAll('[role="row"], [data-row], .virtual-row').length
    return Math.max(tableRows, resultsRows, resultRows, virtualRows)
  })
}

async function runSmoke() {
  const port = await findAvailablePort(preferredPort)
  const baseUrl = `http://127.0.0.1:${port}/?mock=true`
  const viteBin = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const viteArgs = ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort']
  const vite = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', `npx ${viteArgs.join(' ')}`], {
      cwd: repoRoot,
      env: { ...process.env, BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    : spawn(viteBin, viteArgs, {
    cwd: repoRoot,
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
    })

  let browser
  let userDataDir
  const stderr = []
  vite.stderr.on('data', (chunk) => stderr.push(chunk.toString()))

  try {
    await waitForServer(`http://127.0.0.1:${port}/`)

    const tempRoot = process.env.CRAWLDESK_SMOKE_TMP || path.join(repoRoot, '.tmp')
    mkdirSync(tempRoot, { recursive: true })
    userDataDir = mkdtempSync(path.join(tempRoot, 'puppeteer-profile-'))

    browser = await puppeteer.launch({
      executablePath: chromePath(),
      headless: 'new',
      userDataDir,
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    })

    const page = await browser.newPage()
    page.setDefaultTimeout(10000)
    await page.setViewport({ width: 1440, height: 950 })

    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await page.goto(baseUrl, { waitUntil: 'networkidle0' })
    await page.waitForFunction(() => Boolean(window.crawldesk))
    record('mock backend initializes', true)

    const projectCount = await page.evaluate(() => window.crawldesk.projects.list().then((projects) => projects.length))
    record('mock projects load', projectCount >= 2, `${projectCount} projects`)

    const deleteProjectWorks = await page.evaluate(async () => {
      const before = await window.crawldesk.projects.list()
      const project = await window.crawldesk.projects.create({
        name: 'Smoke Delete Project',
        rootUrl: 'https://delete-smoke.example/',
      })
      await window.crawldesk.projects.delete(project.id)
      const after = await window.crawldesk.projects.list()
      return before.length === after.length && !after.some((item) => String(item.id) === String(project.id))
    })
    record('project delete bridge removes project', deleteProjectWorks)

    await fillByPlaceholder(page, 'Filter projects', 'avanterra')
    await page.waitForFunction(() => {
      const text = document.body.textContent || ''
      return text.includes('Avanterra Park') && text.includes('Showing 1 of')
    })
    record('project filter narrows project list', await bodyIncludes(page, 'Showing 1 of'))

    await clickText(page, 'Avanterra Park', '.card')
    await page.waitForFunction(() => {
      const input = document.querySelector('.url-field input')
      return input && input.value.includes('avanterrapark.com')
    })
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.includes('Clear')))
    record('project selection populates toolbar URL', true)
    await page.waitForFunction(() => document.body.textContent?.includes('Technical health and crawl intelligence'))
    await page.waitForFunction(() => document.body.textContent?.includes('Recent Crawled URLs') && document.body.textContent?.includes('Page 1 - Avanterra Park'))
    const overviewState = await page.evaluate(() => {
      const text = document.body.textContent || ''
      return {
        hasTotalUrls: text.includes('Total URLs') && text.includes('247'),
        hasIndexablePages: text.includes('Indexable Pages'),
        hasRecentUrls: text.includes('Recent Crawled URLs') && text.includes('https://avanterrapark.com/'),
        hasTopIssues: text.includes('Top Issues'),
      }
    })
    record(
      'overview screen shows crawl summary and recent URLs',
      overviewState.hasTotalUrls && overviewState.hasIndexablePages && overviewState.hasRecentUrls && overviewState.hasTopIssues,
      JSON.stringify(overviewState),
    )

    await clickText(page, 'Crawl Setup', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Target Website'))
    const crawlCountBeforeInvalidHeaders = await page.evaluate(async () => {
      const crawls = await window.crawldesk.crawls.listByProject('1')
      return crawls.length
    })
    await fillByLabel(page, 'Custom Request Headers', 'InvalidHeaderLine')
    await clickText(page, 'Start Crawl', 'form button')
    await page.waitForFunction(() => document.body.textContent?.includes('Invalid custom header line'))
    const crawlCountAfterInvalidHeaders = await page.evaluate(async () => {
      const crawls = await window.crawldesk.crawls.listByProject('1')
      return crawls.length
    })
    record(
      'crawl setup rejects invalid custom headers before creating crawl',
      crawlCountAfterInvalidHeaders === crawlCountBeforeInvalidHeaders,
      `${crawlCountBeforeInvalidHeaders} -> ${crawlCountAfterInvalidHeaders}`,
    )
    await fillByLabel(page, 'Exclude Patterns', '*/tag/*\n*.pdf$')
    await fillByLabel(page, 'Allowed Hostnames', 'blog.avanterrapark.com')
    await fillByLabel(page, 'Blocked Hostnames', 'staging.avanterrapark.com')
    await fillByLabel(page, 'Max URL Length', '2048', 'input')
    await fillByLabel(page, 'Custom Request Headers', 'X-CrawlDesk-Smoke: open\nX-Preview-Token: abc123')
    await clickText(page, 'Start Crawl', 'form button')
    await page.waitForFunction(() => document.body.textContent?.includes('Live Crawl'))
    await page.waitForFunction(() => document.body.textContent?.includes('Running') || document.body.textContent?.includes('Waiting for first results'))
    const submittedCrawlSettings = await page.evaluate(async () => {
      const crawls = await window.crawldesk.crawls.listByProject('1')
      const crawl = crawls[crawls.length - 1]
      return JSON.parse(crawl?.settings_json || '{}')
    })
    record(
      'crawl setup submits host scope controls',
      submittedCrawlSettings.excludePatterns?.includes('*/tag/*') &&
        submittedCrawlSettings.excludePatterns?.includes('*.pdf$') &&
        submittedCrawlSettings.allowedHostnames?.includes('blog.avanterrapark.com') &&
        submittedCrawlSettings.blockedHostnames?.includes('staging.avanterrapark.com') &&
        submittedCrawlSettings.maxUrlLength === 2048,
      JSON.stringify({
        excludePatterns: submittedCrawlSettings.excludePatterns,
        allowedHostnames: submittedCrawlSettings.allowedHostnames,
        blockedHostnames: submittedCrawlSettings.blockedHostnames,
        maxUrlLength: submittedCrawlSettings.maxUrlLength,
      }),
    )
    record(
      'crawl setup submits custom request headers',
      submittedCrawlSettings.customHeaders?.['X-CrawlDesk-Smoke'] === 'open' &&
        submittedCrawlSettings.customHeaders?.['X-Preview-Token'] === 'abc123',
      JSON.stringify(submittedCrawlSettings.customHeaders),
    )
    const liveCrawlState = await page.evaluate(() => {
      const text = document.body.textContent || ''
      const cards = Array.from(document.querySelectorAll('.kpi-card')).map((card) => card.textContent?.replace(/\s+/g, ' ').trim() || '')
      return {
        hasRunning: text.includes('Running'),
        hasWaiting: text.includes('Waiting for first results'),
        cards,
      }
    })
    record(
      'crawl setup starts live crawl UI',
      liveCrawlState.hasRunning && liveCrawlState.cards.some((card) => card.includes('Queued') && /[1-9]/.test(card)),
      JSON.stringify(liveCrawlState),
    )
    const liveCrawlOverflow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    record(
      'live crawl screen does not create page-level horizontal overflow',
      liveCrawlOverflow.scrollWidth <= liveCrawlOverflow.viewport + 1,
      JSON.stringify(liveCrawlOverflow),
    )

    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.includes('All URLs') && !button.disabled))
    await clickText(page, 'All URLs', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Results ('))
    await page.waitForFunction(() => document.body.textContent?.includes('avanterrapark.com'))
    const resultRows = await visibleRows(page)
    record('results screen shows URL data', resultRows > 0, `${resultRows} visible rows`)
    const resultsTableOverflow = await page.evaluate(() => {
      const body = document.querySelector('[data-results-table-body]')
      return {
        viewport: document.documentElement.clientWidth,
        pageScrollWidth: document.documentElement.scrollWidth,
        tableClientWidth: body?.clientWidth ?? 0,
        tableScrollWidth: body?.scrollWidth ?? 0,
      }
    })
    record(
      'results table does not create horizontal overflow',
      resultsTableOverflow.pageScrollWidth <= resultsTableOverflow.viewport + 1 &&
        resultsTableOverflow.tableScrollWidth <= resultsTableOverflow.tableClientWidth + 1,
      JSON.stringify(resultsTableOverflow),
    )
    const resultsTableVerticalOverflow = await page.evaluate(() => {
      const body = document.querySelector('[data-results-table-body]')
      return {
        clientHeight: body?.clientHeight ?? 0,
        scrollHeight: body?.scrollHeight ?? 0,
        overflowY: body ? getComputedStyle(body).overflowY : '',
      }
    })
    record(
      'results table does not create inner vertical scroll',
      resultsTableVerticalOverflow.overflowY === 'visible' &&
        resultsTableVerticalOverflow.scrollHeight <= resultsTableVerticalOverflow.clientHeight + 1,
      JSON.stringify(resultsTableVerticalOverflow),
    )

    await clickText(page, 'Issues', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Issues Dashboard'))
    record('issues screen opens', await bodyIncludes(page, 'Issues Dashboard'))
    record('issue registry labels render', await bodyIncludes(page, 'Missing Title'))

    const issueBox = await page.evaluate(() => {
      const summaries = Array.from(document.querySelectorAll('.card .cursor-pointer'))
      const missingTitle = summaries.find((summary) => summary.textContent?.includes('Missing Title'))
      if (!missingTitle) return null
      const rect = missingTitle.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    })
    if (!issueBox) throw new Error('Could not find Missing Title issue summary')
    await page.mouse.click(issueBox.x, issueBox.y)
    await page.waitForFunction(() => document.body.textContent?.includes('Affected URLs'))
    record('issue expansion shows affected URLs area', await bodyIncludes(page, 'Affected URLs'))

    await clickText(page, 'Export visible CSV', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Exported'))
    record('issues export action works in mock mode', await bodyIncludes(page, 'Exported'))

    await clickText(page, 'Client Errors', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Client Errors'))
    await page.waitForFunction(() => document.body.textContent?.includes('404'))
    record('client errors screen shows 4xx rows', await bodyIncludes(page, '404'))
    await clickText(page, 'Export CSV', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('client error URLs'))
    record('client errors export shows completion', await bodyIncludes(page, 'client error URLs'))

    await clickText(page, 'Content Audit', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Pages Analyzed'))
    await page.waitForFunction(() => document.body.textContent?.includes('Zip Line Experience'))
    record('content audit screen shows readability data', await bodyIncludes(page, 'Zip Line Experience'))
    await fillByPlaceholder(page, 'Filter content pages', 'corporate')
    await page.waitForFunction(() => {
      const text = document.body.textContent || ''
      return text.includes('Corporate Team Building') && text.includes('Showing 1 of') && !text.includes('Zip Line Experience')
    })
    record('content audit filter narrows rows', await bodyIncludes(page, 'Corporate Team Building'))

    await clickText(page, 'Links', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Broken Links'))
    const linkRowsAll = await visibleRows(page)
    record('links screen shows link data', linkRowsAll > 0, `${linkRowsAll} visible rows`)
    await page.waitForFunction(() => document.body.textContent?.includes('Top Anchor Text') && document.body.textContent?.includes('click here'))
    record('links screen shows anchor text summary', await bodyIncludes(page, 'Top Anchor Text') && await bodyIncludes(page, 'click here'))

    await clickText(page, 'Internal', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Internal Links'))
    const internalPageLabel = await page.evaluate(() => document.body.textContent?.includes('Page 1 of'))
    record('links internal filter resets to first page', internalPageLabel)
    const internalCellsOk = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr')).filter((row) => {
        const firstCell = row.querySelector('td')
        return firstCell?.textContent?.includes('http')
      })
      return rows.length > 0 && rows.every((row) => {
        const cells = row.querySelectorAll('td')
        return cells[4]?.textContent?.includes('Yes')
      })
    })
    record('internal link filter applies', internalCellsOk)
    await clickText(page, 'Export CSV', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Exported 1834 links'))
    record('links screen export shows completion', await bodyIncludes(page, 'Exported 1834 links'))

    await clickText(page, 'Keywords', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Total Words Analyzed'))
    await page.waitForFunction(() => document.body.textContent?.includes('adventure'))
    record('keywords screen shows unigram data', await bodyIncludes(page, 'adventure'))
    await fillByPlaceholder(page, 'Filter keywords', 'zip')
    await page.waitForFunction(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr')).map((row) => row.textContent || '')
      return rows.length === 1 && rows[0].includes('zip') && !rows.some((row) => row.includes('adventure'))
    })
    record('keywords filter narrows visible phrases', await bodyIncludes(page, 'Showing 1 of'))
    await fillByPlaceholder(page, 'Filter keywords', '')

    await clickText(page, 'Bigrams', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('adventure park'))
    record('keywords bigram tab loads data', await bodyIncludes(page, 'adventure park'))

    await clickText(page, 'Clusters', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Content Clusters'))
    await page.waitForFunction(() => document.body.textContent?.includes('zip'))
    record('clusters screen shows cluster data', await bodyIncludes(page, 'zip'))
    await fillByPlaceholder(page, 'Filter clusters', 'birthday')
    await page.waitForFunction(() => {
      const text = document.body.textContent || ''
      return text.includes('birthday') && text.includes('Showing 1 of')
    })
    record('clusters filter narrows visible groups', await bodyIncludes(page, 'Showing 1 of'))

    await clickText(page, 'Sitemaps', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Sitemap Coverage'))
    record('sitemaps screen is reachable', await bodyIncludes(page, 'Sitemap URLs Not Crawled'))

    await clickText(page, 'Performance', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('URLs Analyzed'))
    record('performance screen is reachable', await bodyIncludes(page, 'URLs Analyzed'))
    await page.waitForFunction(() => document.body.textContent?.includes('Est. CO2'))
    record('performance screen shows carbon estimate', await bodyIncludes(page, 'Est. CO2'))
    await page.waitForFunction(() => document.body.textContent?.includes('Slow Pages') && document.body.textContent?.includes('Large Pages'))
    record('performance screen shows crawl-derived slow and large page counts', await bodyIncludes(page, 'Slow Pages') && await bodyIncludes(page, 'Large Pages'))
    await fillByPlaceholder(page, 'Filter by URL', 'gallery')
    await page.waitForFunction(() => {
      const text = document.body.textContent || ''
      return text.includes('https://avanterrapark.com/gallery') && !text.includes('https://avanterrapark.com/activities/zip-line')
    })
    record('performance filter narrows rows by URL', await bodyIncludes(page, 'https://avanterrapark.com/gallery'))
    await fillByPlaceholder(page, 'Filter by URL', '')
    await clickText(page, 'Large Pages', 'button')
    await page.waitForFunction(() => {
      const text = document.body.textContent || ''
      return text.includes('Showing 1 of') && text.includes('https://avanterrapark.com/gallery') && !text.includes('https://avanterrapark.com/activities/zip-line')
    })
    record('performance large page filter isolates heavy rows', await bodyIncludes(page, 'Showing 1 of') && await bodyIncludes(page, 'https://avanterrapark.com/gallery'))

    await clickText(page, 'Extractions', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Custom Extractions'))
    await fillByLabel(page, 'Rule Name', 'Smoke Meta Description')
    await fillByLabel(page, 'Selector / Pattern', 'meta[name="description"]')
    await fillByLabel(page, 'Attribute', 'content')
    await clickText(page, 'Add Rule', 'form button')
    await page.waitForFunction(() => document.body.textContent?.includes('Smoke Meta Description'))
    const extractionState = await page.evaluate(async () => {
      const crawls = await window.crawldesk.crawls.listByProject('1')
      const crawl = crawls[crawls.length - 1]
      const rows = await window.crawldesk.extractions.list(crawl.id)
      const nameInput = Array.from(document.querySelectorAll('label')).find((label) => label.textContent?.includes('Rule Name'))?.parentElement?.querySelector('input')
      return {
        count: rows.length,
        hasRule: rows.some((row) => row.name === 'Smoke Meta Description' && row.selector === 'meta[name="description"]' && row.attribute === 'content'),
        nameCleared: nameInput instanceof HTMLInputElement && nameInput.value === '',
      }
    })
    record('extractions screen creates a rule and clears the form', extractionState.hasRule && extractionState.nameCleared, JSON.stringify(extractionState))

    await clickText(page, 'Schedules', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Crawl Scheduling'))
    await page.waitForFunction(() => document.body.textContent?.includes('New URLs') && document.body.textContent?.includes('Broken Links'))
    record('crawl history diff table renders', await bodyIncludes(page, 'New URLs') && await bodyIncludes(page, 'Broken Links'))
    await clickText(page, 'Details', 'button')
    await page.waitForFunction(() => {
      const text = document.body.textContent || ''
      return text.includes('Changed URLs') && text.includes('New Broken Links') && text.includes('night-climb')
    })
    record('crawl history diff details expand', await bodyIncludes(page, 'Changed URLs') && await bodyIncludes(page, 'night-climb'))
    await clickText(page, 'New Schedule', 'button')
    await fillByLabel(page, 'Start URL', 'not-a-url')
    await fillByLabel(page, 'Cron Expression', '0 2 * * *')
    await clickText(page, 'Save', 'form button')
    await page.waitForFunction(() => document.body.textContent?.includes('Start URL must be a valid URL'))
    record('schedules screen validates URL before save', await bodyIncludes(page, 'Start URL must be a valid URL'))
    await fillByLabel(page, 'Start URL', 'https://avanterrapark.com/smoke-schedule')
    await fillByLabel(page, 'Max URLs', '12')
    await fillByLabel(page, 'Max Depth', '2')
    await fillByLabel(page, 'Concurrency', '3')
    await clickText(page, 'Save', 'form button')
    await page.waitForFunction(() => document.body.textContent?.includes('https://avanterrapark.com/smoke-schedule'))
    const scheduleState = await page.evaluate(async () => {
      const rows = await window.crawldesk.schedules.list('1')
      return {
        count: rows.length,
        hasSchedule: rows.some((row) => {
          const settings = JSON.parse(row.crawl_settings_json || '{}')
          return row.start_url === 'https://avanterrapark.com/smoke-schedule'
            && row.cron_expression === '0 2 * * *'
            && settings.maxUrls === 12
            && settings.maxDepth === 2
            && settings.concurrency === 3
        }),
      }
    })
    record('schedules screen creates a schedule with crawl settings', scheduleState.hasSchedule, JSON.stringify(scheduleState))
    await clickText(page, 'Edit', 'button')
    await fillByLabel(page, 'Start URL', 'https://avanterrapark.com/smoke-schedule-edited')
    await fillByLabel(page, 'Cron Expression', '0 */6 * * *')
    await fillByLabel(page, 'Max URLs', '8')
    await fillByLabel(page, 'Max Depth', '1')
    await fillByLabel(page, 'Concurrency', '2')
    await clickText(page, 'Save changes', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('https://avanterrapark.com/smoke-schedule-edited'))
    const scheduleEditState = await page.evaluate(async () => {
      const rows = await window.crawldesk.schedules.list('1')
      return {
        count: rows.length,
        edited: rows.some((row) => {
          const settings = JSON.parse(row.crawl_settings_json || '{}')
          return row.start_url === 'https://avanterrapark.com/smoke-schedule-edited'
            && row.cron_expression === '0 */6 * * *'
            && settings.maxUrls === 8
            && settings.maxDepth === 1
            && settings.concurrency === 2
        }),
      }
    })
    record('schedules screen edits an existing schedule with crawl settings', scheduleEditState.edited, JSON.stringify(scheduleEditState))
    await clickText(page, 'Duplicate', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Schedule duplicated.'))
    const scheduleDuplicateState = await page.evaluate(async () => {
      const rows = await window.crawldesk.schedules.list('1')
      const duplicates = rows.filter((row) => row.start_url === 'https://avanterrapark.com/smoke-schedule-edited' && row.cron_expression === '0 */6 * * *')
      return {
        count: rows.length,
        duplicates: duplicates.length,
        copiedSettings: duplicates.every((row) => {
          const settings = JSON.parse(row.crawl_settings_json || '{}')
          return settings.maxUrls === 8 && settings.maxDepth === 1 && settings.concurrency === 2
        }),
      }
    })
    record('schedules screen duplicates a tuned schedule', scheduleDuplicateState.duplicates === 2 && scheduleDuplicateState.copiedSettings, JSON.stringify(scheduleDuplicateState))
    await clickText(page, 'Run now', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Started scheduled crawl #'))
    const manualScheduleRunState = await page.evaluate(async () => {
      const rows = await window.crawldesk.schedules.list('1')
      const crawls = await window.crawldesk.crawls.listByProject('1')
      return {
        hasLastRun: rows.some((row) => row.start_url === 'https://avanterrapark.com/smoke-schedule-edited' && row.last_run_at),
        crawlCount: crawls.length,
      }
    })
    record('schedules screen can run a schedule now', manualScheduleRunState.hasLastRun && manualScheduleRunState.crawlCount >= 3, JSON.stringify(manualScheduleRunState))

    await clickText(page, 'Exports', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Export all crawled URLs'))
    await clickText(page, 'All URLs CSV', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Exported 247 URLs'))
    record('exports screen can export URLs', await bodyIncludes(page, 'Exported 247 URLs'))
    await clickText(page, 'Issues CSV', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Exported 12 issues'))
    record('exports screen can export issues', await bodyIncludes(page, 'Exported 12 issues'))
    await clickText(page, 'Links CSV', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Exported 1834 links'))
    const exportStatus = await page.evaluate(() => {
      const text = document.body.textContent || ''
      return {
        urls: text.includes('Exported 247 URLs'),
        issues: text.includes('Exported 12 issues'),
        links: text.includes('Exported 1834 links'),
      }
    })
    record('exports screen preserves independent export statuses', exportStatus.urls && exportStatus.issues && exportStatus.links, JSON.stringify(exportStatus))

    await clickText(page, 'Settings', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Crawl Defaults'))
    await clickText(page, 'Open data folder', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Data folder opened.'))
    record('settings screen opens data folder action', await bodyIncludes(page, 'Data folder opened.'))
    await clickText(page, 'Save Settings', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Settings saved'))
    record('settings screen loads and saves', await bodyIncludes(page, 'Settings saved'))

    record('no uncaught browser errors', pageErrors.length === 0, pageErrors.join('; '))

    const failed = checks.filter((check) => !check.passed)
    if (failed.length > 0) {
      throw new Error(`${failed.length} smoke checks failed`)
    }
  } finally {
    if (browser) await browser.close()
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
    if (process.platform === 'win32' && vite.pid) {
      spawnSync('taskkill', ['/pid', String(vite.pid), '/t', '/f'], { stdio: 'ignore' })
    } else {
      vite.kill('SIGTERM')
      await wait(500)
      if (!vite.killed) vite.kill('SIGKILL')
    }
    if (stderr.length) {
      const relevant = stderr.join('').trim()
      if (relevant) console.error(relevant)
    }
  }
}

runSmoke()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
