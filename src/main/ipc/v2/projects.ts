// v2 project handlers. Filesystem-as-truth: each project = a folder.
import { ipcMain, shell } from 'electron'
import { existsSync, readFileSync, rmSync, copyFileSync, readdirSync } from 'fs'
import { join } from 'path'
import type { ProjectMetadataV2, ProjectView } from '@shared/types'
import {
  ensureDir,
  getProjectDir,
  getProjectMetadataPath,
  getProjectThumbnailPath,
  getProjectsRoot,
  getDossiersDir,
  getDossierArticlesDir,
  getOrphansDir,
  getSourcesDir,
  listSubdirs,
  newId,
  readArticleMetadata,
  readProjectMetadata,
  writeJson,
} from '../_fs'

// Build a ProjectView for one project (reads metadata + walks dossiers/orphans/sources).
const buildProjectView = (projectId: string): ProjectView | null => {
  const metadata = readProjectMetadata(projectId)
  if (!metadata) return null

  let articlesTotal = 0
  let articlesToExtract = 0
  let articlesToTranscribe = 0
  let articlesDone = 0

  // Drafts (status='new') are excluded from `articlesTotal` so they don't
  // pollute "X éléments dans ce projet" headers. They're surfaced separately
  // via articlesToExtract (= "X à extraire" badges).
  const countArticle = (dossierId: string | null, articleId: string): void => {
    const am = readArticleMetadata(projectId, dossierId, articleId)
    if (!am) return
    if (am.status === 'new') {
      articlesToExtract += 1
    } else {
      articlesTotal += 1
      if (am.status === 'extracted') articlesToTranscribe += 1
      else if (am.status === 'transcribed') articlesDone += 1
    }
  }

  // Walk orphans
  for (const articleId of listSubdirs(getOrphansDir(projectId))) {
    countArticle(null, articleId)
  }

  // Walk dossiers
  const dossierIds = listSubdirs(getDossiersDir(projectId))
  for (const dossierId of dossierIds) {
    for (const articleId of listSubdirs(getDossierArticlesDir(projectId, dossierId))) {
      countArticle(dossierId, articleId)
    }
  }

  const sourcesCount = listSubdirs(getSourcesDir(projectId)).length
  const thumbnailPath = existsSync(getProjectThumbnailPath(projectId))
    ? getProjectThumbnailPath(projectId)
    : null

  return {
    ...metadata,
    thumbnailPath,
    sourcesCount,
    dossiersCount: dossierIds.length,
    articlesTotal,
    articlesToExtract,
    articlesToTranscribe,
    articlesDone,
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
    const projectIds = listSubdirs(getProjectsRoot())
    const views: ProjectView[] = []
    for (const id of projectIds) {
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
        // cleanup half-created project
        try { rmSync(getProjectDir(id), { recursive: true, force: true }) } catch {}
        return null
      }
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
      return writeJson(getProjectMetadataPath(projectId), updated)
    }
  )

  ipcMain.handle('v2:projects:delete', async (_, projectId: string): Promise<boolean> => {
    const dir = getProjectDir(projectId)
    if (!existsSync(dir)) return false
    try {
      rmSync(dir, { recursive: true, force: true })
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
  writeJson(getProjectMetadataPath(projectId), {
    ...metadata,
    modifiedAt: new Date().toISOString(),
  })
}

// Re-exported helper for list-after-mutation patterns
export { buildProjectView }
