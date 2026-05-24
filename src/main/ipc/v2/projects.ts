// v2 project handlers. Filesystem-as-truth: each project = a folder.
import { ipcMain, shell } from 'electron'
import { existsSync, readFileSync, rmSync, copyFileSync, readdirSync } from 'fs'
import { join } from 'path'
import type { ProjectMetadataV2, ProjectView } from '@shared/types'
import { isFieldFilled } from '@shared/fieldValue'
import {
  ensureDir,
  getProjectDir,
  getProjectMetadataPath,
  getProjectThumbnailPath,
  getDossiersDir,
  getOrphansDir,
  getSourcesDir,
  newId,
  readProjectMetadata,
  writeJson,
} from '../_fs'
import {
  idx,
  patchProject,
  rebuildProject,
  removeProjectFromIndex,
} from './_index'

// Build a ProjectView for one project from the in-memory index. Counts are
// derived in-memory (zero file reads). Returns null when the project isn't
// cached (deleted or not yet indexed).
const buildProjectView = (projectId: string): ProjectView | null => {
  const entry = idx.getProject(projectId)
  if (!entry) return null

  let articlesToExtract = 0  // status === 'draft' (PDF pending)
  let articlesTotal = 0       // status === 'ready'
  let articlesFilled = 0      // status === 'ready' AND every schema field + content has a value
  let fieldsTotal = 0
  let fieldsFilled = 0

  for (const am of idx.listArticlesInProject(projectId, { includeDrafts: true })) {
    if (am.status === 'draft') {
      articlesToExtract += 1
      continue
    }
    articlesTotal += 1
    const schema = am.schema ?? []
    const fields = am.fields ?? {}
    // The mandatory `content` (transcription body) counts as an extra slot
    // alongside the schema fields. An article is "filled" only when every
    // schema field has a value AND content.md is non-empty. This mirrors
    // the per-article counter shown in the editor.
    const schemaFilledCount = schema.filter((f) => isFieldFilled(f, fields[f.name])).length
    const allSchemaFilled = schemaFilledCount === schema.length
    const contentFilled = (am.content ?? '').trim().length > 0
    if (allSchemaFilled && contentFilled) {
      articlesFilled += 1
    }
    // Field-level totals also include content as a slot, so a 1-text-field
    // template ends up with 2 slots per article (the text field + content)
    // and the card / project-page % matches the editor's per-article badge.
    fieldsTotal += schema.length + 1
    fieldsFilled += schemaFilledCount + (contentFilled ? 1 : 0)
  }

  return {
    ...entry.meta,
    thumbnailPath: entry.hasThumbnail ? getProjectThumbnailPath(projectId) : null,
    sourcesCount: idx.countSourcesInProject(projectId),
    dossiersCount: idx.countDossiersInProject(projectId),
    articlesToExtract,
    articlesTotal,
    articlesFilled,
    fieldsTotal,
    fieldsFilled,
  }
}

// Recursive directory copy used by project duplication.
const copyRecursive = (src: string, dest: string): void => {
  ensureDir(dest)
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name)
    const d = join(dest, entry.name)
    if (entry.isDirectory()) copyRecursive(s, d)
    else if (entry.isFile()) copyFileSync(s, d)
  }
}

export function setupV2ProjectHandlers(): void {
  ipcMain.handle('v2:projects:list', async (): Promise<ProjectView[]> => {
    const views: ProjectView[] = []
    for (const id of idx.listProjectIds()) {
      const view = buildProjectView(id)
      if (view) views.push(view)
    }
    return views.sort((a, b) =>
      new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
    )
  })

  ipcMain.handle(
    'v2:projects:get',
    async (_, projectId: string): Promise<ProjectView | null> => buildProjectView(projectId)
  )

  ipcMain.handle(
    'v2:projects:create',
    async (_, name: string, defaultTemplateId: string): Promise<ProjectView | null> => {
      const id = newId()
      const now = new Date().toISOString()
      const metadata: ProjectMetadataV2 = {
        id,
        name: name.trim() || 'Nouveau projet',
        defaultTemplateId: defaultTemplateId || 'press-article',
        createdAt: now,
        modifiedAt: now,
      }
      ensureDir(getProjectDir(id))
      ensureDir(getSourcesDir(id))
      ensureDir(getDossiersDir(id))
      ensureDir(getOrphansDir(id))
      if (!writeJson(getProjectMetadataPath(id), metadata)) {
        try { rmSync(getProjectDir(id), { recursive: true, force: true }) } catch {}
        return null
      }
      patchProject(id, metadata)
      return buildProjectView(id)
    }
  )

  ipcMain.handle(
    'v2:projects:rename',
    async (_, projectId: string, name: string): Promise<boolean> => {
      const metadata = readProjectMetadata(projectId)
      if (!metadata) return false
      const updated: ProjectMetadataV2 = {
        ...metadata,
        name: name.trim() || metadata.name,
        modifiedAt: new Date().toISOString(),
      }
      const ok = writeJson(getProjectMetadataPath(projectId), updated)
      if (ok) patchProject(projectId, updated)
      return ok
    }
  )

  ipcMain.handle(
    'v2:projects:update',
    async (
      _,
      projectId: string,
      patch: { name?: string; defaultTemplateId?: string }
    ): Promise<boolean> => {
      const metadata = readProjectMetadata(projectId)
      if (!metadata) return false
      const trimmedName = patch.name?.trim()
      const updated: ProjectMetadataV2 = {
        ...metadata,
        name: trimmedName || metadata.name,
        defaultTemplateId: patch.defaultTemplateId ?? metadata.defaultTemplateId,
        modifiedAt: new Date().toISOString(),
      }
      const ok = writeJson(getProjectMetadataPath(projectId), updated)
      if (ok) patchProject(projectId, updated)
      return ok
    }
  )

  ipcMain.handle('v2:projects:delete', async (_, projectId: string): Promise<boolean> => {
    const dir = getProjectDir(projectId)
    if (!existsSync(dir)) return false
    try {
      rmSync(dir, { recursive: true, force: true })
      removeProjectFromIndex(projectId)
      return true
    } catch (err) {
      console.error('Project delete failed:', err)
      return false
    }
  })

  ipcMain.handle(
    'v2:projects:duplicate',
    async (_, projectId: string): Promise<ProjectView | null> => {
      const src = getProjectDir(projectId)
      if (!existsSync(src)) return null
      const metadata = readProjectMetadata(projectId)
      if (!metadata) return null

      const newProjectId = newId()
      const dest = getProjectDir(newProjectId)
      try {
        copyRecursive(src, dest)
      } catch (err) {
        console.error('Project duplicate copy failed:', err)
        try { rmSync(dest, { recursive: true, force: true }) } catch {}
        return null
      }
      const now = new Date().toISOString()
      const updated: ProjectMetadataV2 = {
        ...metadata,
        id: newProjectId,
        name: `${metadata.name} (copie)`,
        createdAt: now,
        modifiedAt: now,
      }
      writeJson(getProjectMetadataPath(newProjectId), updated)
      // Bulk: a duplicate adds dozens of files. Rebuild the whole project
      // slice in one shot rather than walking the renderer's IPC chatter.
      rebuildProject(newProjectId)
      return buildProjectView(newProjectId)
    }
  )

  ipcMain.handle(
    'v2:projects:openFolder',
    async (_, projectId: string): Promise<boolean> => {
      const dir = getProjectDir(projectId)
      if (!existsSync(dir)) return false
      try {
        const result = await shell.openPath(dir)
        return result === ''
      } catch {
        return false
      }
    }
  )

  ipcMain.handle(
    'v2:projects:getThumbnail',
    async (_, projectId: string): Promise<string | null> => {
      const thumbPath = getProjectThumbnailPath(projectId)
      if (!existsSync(thumbPath)) return null
      try {
        const buffer = readFileSync(thumbPath)
        return `data:image/png;base64,${buffer.toString('base64')}`
      } catch {
        return null
      }
    }
  )
}

// Re-exported for cross-module use (e.g. articles handler updates project modifiedAt)
export const touchProject = (projectId: string): void => {
  const metadata = readProjectMetadata(projectId)
  if (!metadata) return
  const updated: ProjectMetadataV2 = {
    ...metadata,
    modifiedAt: new Date().toISOString(),
  }
  writeJson(getProjectMetadataPath(projectId), updated)
  patchProject(projectId, updated)
}

// Re-exported helper for list-after-mutation patterns
export { buildProjectView }
