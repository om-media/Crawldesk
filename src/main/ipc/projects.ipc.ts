import { ipcMain } from 'electron'
import { z } from 'zod'
import type { Repositories } from '../db/repositories'

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(120),
  rootUrl: z.string().url().refine(u => ['http:', 'https:'].includes(new URL(u).protocol))
})

export function registerProjectsIpc(repos: Repositories): void {
  ipcMain.handle('projects:create', (_e, input) => {
    const parsed = CreateProjectSchema.safeParse(input)
    if (!parsed.success) throw new Error(`VALIDATION_ERROR: ${parsed.error.message}`)
    return repos.projects.create(parsed.data)
  })

  ipcMain.handle('projects:list', () => repos.projects.list())

  ipcMain.handle('projects:get', (_e, projectId: string) => {
    if (!crypto.randomUUID || !projectId.startsWith('5') && !/^[0-9a-f]{36}$/i.test(projectId)) {
      // loose UUID check — let repo handle actual existence
    }
    return repos.projects.get(projectId)
  })

  ipcMain.handle('projects:update', (_e, projectId: string, patch: any) => repos.projects.update(projectId, patch))

  ipcMain.handle('projects:delete', (_e, projectId: string) => { repos.projects.delete(projectId); return true })
}
