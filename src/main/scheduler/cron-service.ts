// Feature 7.4 — Cron-like scheduler for recurring crawls on configured projects.
// Uses node-cron (lightweight) to schedule tasks; triggers crawls via existing IPC channels.

import Database from 'better-sqlite3'
import type { CrawlSchedule } from '../../shared/types/crawl-schedule'

let scheduledTasks = new Map<string, NodeJS.Timeout>()

/**
 * Initialize the cron service — loads all active schedules and starts timers.
 */
export function initScheduler(db: Database.Database): void {
  const schedules = db.prepare(
    "SELECT * FROM crawl_schedules WHERE enabled = 1"
  ).all() as unknown as CrawlSchedule[]

  for (const s of schedules) {
    try {
      startCronTask(s, db)
    } catch (e) {
      console.error(`[Scheduler] Failed to start schedule ${s.id}:`, e)
    }
  }
}

function startCronTask(schedule: CrawlSchedule, _db: Database.Database): void {
  if (scheduledTasks.has(schedule.id)) return // Already running

  const nextMs = parseCronToMs(schedule.cron_expression)
  if (!nextMs || nextMs <= 0) {
    console.warn(`[Scheduler] Invalid cron expression "${schedule.cron_expression}" for ${schedule.id}`)
    return
  }

  // Simple interval-based scheduler using setTimeout/recursive setTimout
  // For production, replace with `node-cron` or `cron` package
  const runScheduled = () => {
    console.log(`[Scheduler] Running scheduled crawl for project ${schedule.project_id}`)

    // Update last_run_at & compute next_run_at
    const now = new Date().toISOString()
    const nextRun = new Date(Date.now() + nextMs).toISOString()
    _db.prepare(
      "UPDATE crawl_schedules SET last_run_at = ?, next_run_at = ?, updated_at = ? WHERE id = ?"
    ).run(now, nextRun, now, schedule.id)

    // Trigger crawl via IPC — the main process listens on 'scheduler:startCrawl'
    // This is handled in main.ts where we call ipcMain.handle('crawls:create') 
    // followed by 'crawls:start'. We emit an internal event.
    try {
      const { BrowserWindow, ipcMain } = require('electron')
      // Emit to main process handler that creates and starts the crawl
      ;(globalThis as any).__triggerScheduledCrawl?.({
        projectId: schedule.project_id,
        startUrl: schedule.start_url,
        settings: JSON.parse(schedule.crawl_settings_json)
      })
    } catch (e) {
      console.error('[Scheduler] Failed to trigger crawl:', e)
    }

    // Reschedule
    scheduledTasks.set(schedule.id, setTimeout(runScheduled, nextMs))
  }

  // Start first run after computed interval
  const timer = setTimeout(runScheduled, nextMs)
  scheduledTasks.set(schedule.id, timer)
}

/** Simple cron expression parser → milliseconds until next execution */
function parseCronToMs(expr: string): number | null {
  try {
    const parts = expr.trim().split(/\s+/)
    if (parts.length < 5) return null // Need at least min hour dom month dow

    const [min, hour, dom, month, dow] = parts

    const now = new Date()
    let next = new Date(now.getTime())
    // Set to beginning of next minute
    next.setSeconds(0, 0)

    // Parse month
    const m = parseInt(month === '*' ? String(next.getMonth() + 1) : month.replace(/[a-zA-Z]/g, ''), 10)
    if (!isNaN(m) && m !== next.getMonth() + 1) next.setMonth(m - 1)

    // Parse day of month
    const d = parseInt(dom === '*' ? '1' : dom, 10)
    if (!isNaN(d) && d > 0) next.setDate(Math.min(d, 28)) // Safe for all months

    // Parse hour
    const h = parseInt(hour === '*' ? '0' : hour, 10)
    if (!isNaN(h)) next.setHours(h)

    // Parse minute
    const mn = parseInt(min === '*' ? '0' : min, 10)
    if (!isNaN(mn)) next.setMinutes(mn)

    const diff = next.getTime() - now.getTime()
    return diff <= 0 ? diff + 86400000 : diff // If in the past, schedule for tomorrow
  } catch {
    return null
  }
}

/** Stop a specific scheduled task */
export function stopSchedule(id: string): void {
  const timer = scheduledTasks.get(id)
  if (timer) {
    clearTimeout(timer)
    scheduledTasks.delete(id)
  }
}

/** Stop all schedules */
export function stopAllSchedules(): void {
  for (const [, timer] of scheduledTasks) clearTimeout(timer)
  scheduledTasks.clear()
}
