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
    const rect = match.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }, { text, selector })
  if (!box) throw new Error(`Could not click text: ${text}`)
  await page.mouse.click(box.x, box.y)
}

async function bodyIncludes(page, text) {
  return page.evaluate((expected) => document.body.textContent?.includes(expected) ?? false, text)
}

async function visibleRows(page) {
  return page.evaluate(() => {
    const tableRows = document.querySelectorAll('tbody tr').length
    const resultRows = Array.from(document.querySelectorAll('.absolute.left-0.right-0'))
      .filter((row) => row.textContent?.includes('http')).length
    const virtualRows = document.querySelectorAll('[role="row"], [data-row], .virtual-row').length
    return Math.max(tableRows, resultRows, virtualRows)
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

    await clickText(page, 'Avanterra Park', '.card')
    await page.waitForFunction(() => {
      const input = document.querySelector('.url-field input')
      return input && input.value.includes('avanterrapark.com')
    })
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.includes('Clear')))
    record('project selection populates toolbar URL', true)

    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.includes('All URLs') && !button.disabled))
    await clickText(page, 'All URLs', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Results ('))
    await page.waitForFunction(() => document.body.textContent?.includes('avanterrapark.com'))
    const resultRows = await visibleRows(page)
    record('results screen shows URL data', resultRows > 0, `${resultRows} visible rows`)

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

    await clickText(page, 'Links', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Broken Links'))
    const linkRowsAll = await visibleRows(page)
    record('links screen shows link data', linkRowsAll > 0, `${linkRowsAll} visible rows`)

    await clickText(page, 'Internal', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Internal Links'))
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

    await clickText(page, 'Sitemaps', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Sitemap Coverage'))
    record('sitemaps screen is reachable', await bodyIncludes(page, 'Sitemap URLs Not Crawled'))

    await clickText(page, 'Performance', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('URLs Analyzed'))
    record('performance screen is reachable', await bodyIncludes(page, 'URLs Analyzed'))

    await clickText(page, 'Extractions', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Custom Extractions'))
    record('extractions screen is reachable', await bodyIncludes(page, 'New Extraction Rule'))

    await clickText(page, 'Schedules', 'button')
    await page.waitForFunction(() => document.body.textContent?.includes('Crawl Scheduling'))
    record('schedules screen is reachable', await bodyIncludes(page, 'New Schedule'))

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
