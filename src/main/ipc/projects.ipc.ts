import { ipcMain } from 'electron'
import { z } from 'zod'
import type { Repositories } from '../db/repositories'

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(120),
  rootUrl: z.string().url().refine(u => ['http:', 'https:'].includes(new URL(u).protocol))
})

// Strict UUID v4 regex: 8-4-4-4-12 hex format with valid version (4) and variant (8/9/a/b) digits
const UuidV4Schema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'Invalid UUID v4 format')

export function registerProjectsIpc(repos: Repositories): void {
  ipcMain.handle('projects:create', (_e, input) => {
    const parsed = CreateProjectSchema.safeParse(input)
    if (!parsed.success) throw new Error(`VALIDATION_ERROR: ${parsed.error.message}`)
    return repos.projects.create(parsed.data)
  })

  ipcMain.handle('projects:list', () => repos.projects.list())

  ipcMain.handle('projects:get', (_e, projectId: string) => {
    UuidV4Schema.parse(projectId)
    return repos.projects.get(projectId)
  })

  ipcMain.handle('projects:update', (_e, projectId: string, patch: any) => {
    UuidV4Schema.parse(projectId)
    return repos.projects.update(projectId, patch)
  })

  ipcMain.handle('projects:delete', (_e, projectId: string) => {
    UuidV4Schema.parse(projectId)
    repos.projects.delete(projectId)
    return true
  })
}
