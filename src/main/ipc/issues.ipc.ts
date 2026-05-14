import { ipcMain } from 'electron'
import { ISSUE_DEFINITIONS } from '../../shared/types/issue'
import type { IssueSummary as IssueSummaryType } from '../../shared/types/issue'
import type { Repositories } from '../db/repositories'

export function registerIssuesIpc(repos: Repositories): void {
  ipcMain.handle('issues:summarize', (_e, crawlId) => {
    const raw = repos.issues.summarize(crawlId)
    return raw.map(r => {
      const def = ISSUE_DEFINITIONS[r.issue_type] || {}
      return {
        issue_type: r.issue_type,
        severity: r.severity,
        count: r.count,
        label: def.label || r.issue_type,
        explanation: def.explanation || '',
        recommendation: def.recommendation || ''
      } as IssueSummaryType
    })
  })

  ipcMain.handle('issues:list', (_e, input) => repos.issues.list(input))
}
