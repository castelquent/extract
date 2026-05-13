// v2 dossier handlers. A dossier groups articles inside a project.
import { ipcMain } from 'electron'
import { existsSync, renameSync, rmSync } from 'fs'
import type { DossierDeleteMode, DossierMetadata, DossierView } from '@shared/types'
import {
  ensureDir,
  getArticleDir,
  getArticleMetadataPath,
  getDossierArticlesDir,
  getDossierDir,
  getDossierMetadataPath,
  getDossiersDir,
  getOrphansDir,
  listSubdirs,
  newId,
  readArticleMetadata,
  readDossierMetadata,
  writeJson,
} from '../_fs'
import { touchProject } from './projects'

const buildDossierView = (projectId: string, dossierId: string): DossierView | null => {
  const metadata = readDossierMetadata(projectId, dossierId)
  if (!metadata) return null
  // Exclude drafts (status='new') from the user-facing count.
  const articleIds = listSubdirs(getDossierArticlesDir(projectId, dossierId))
  let articlesCount = 0
  for (const articleId of articleIds) {
    const am = readArticleMetadata(projectId, dossierId, articleId)
    if (am && am.status !== 'new') articlesCount += 1
  }
  return { ...metadata, articlesCount }
}

export function setupV2DossierHandlers(): void {
  ipcMain.handle(
    'v2:dossiers:create',
    async (_, projectId: string, name: string): Promise<DossierView | null> => {
      const id = newId()
      const now = new Date().toISOString()
      const metadata: DossierMetadata = {
        id,
        name: name.trim() || 'Nouveau dossier',
        createdAt: now,
        modifiedAt: now,
      }
      ensureDir(getDossierDir(projectId, id))
      ensureDir(getDossierArticlesDir(projectId, id))
      if (!writeJson(getDossierMetadataPath(projectId, id), metadata)) return null
      touchProject(projectId)
      return buildDossierView(projectId, id)
    }
  )

  ipcMain.handle('v2:dossiers:list', async (_, projectId: string): Promise<DossierView[]> => {
    const ids = listSubdirs(getDossiersDir(projectId))
    const views: DossierView[] = []
    for (const id of ids) {
      const v = buildDossierView(projectId, id)
      if (v) views.push(v)
    }
    return views.sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
  })

  ipcMain.handle(
    'v2:dossiers:get',
    async (_, projectId: string, dossierId: string): Promise<DossierView | null> =>
      buildDossierView(projectId, dossierId)
  )

  ipcMain.handle(
    'v2:dossiers:rename',
    async (_, projectId: string, dossierId: string, name: string): Promise<boolean> => {
      const metadata = readDossierMetadata(projectId, dossierId)
      if (!metadata) return false
      const updated: DossierMetadata = {
        ...metadata,
        name: name.trim() || metadata.name,
        modifiedAt: new Date().toISOString(),
      }
      const ok = writeJson(getDossierMetadataPath(projectId, dossierId), updated)
      if (ok) touchProject(projectId)
      return ok
    }
  )

  ipcMain.handle(
    'v2:dossiers:delete',
    async (
      _,
      projectId: string,
      dossierId: string,
      mode: DossierDeleteMode
    ): Promise<boolean> => {
      const dir = getDossierDir(projectId, dossierId)
      if (!existsSync(dir)) return false

      if (mode === 'orphan-articles') {
        // Move each article folder into orphans/, update its metadata.dossierId = null
        const articlesDir = getDossierArticlesDir(projectId, dossierId)
        const articleIds = listSubdirs(articlesDir)
        ensureDir(getOrphansDir(projectId))
        for (const articleId of articleIds) {
          const srcDir = getArticleDir(projectId, dossierId, articleId)
          const destDir = getArticleDir(projectId, null, articleId)
          try {
            renameSync(srcDir, destDir)
            const am = readArticleMetadata(projectId, null, articleId)
            if (am) {
              writeJson(getArticleMetadataPath(projectId, null, articleId), {
                ...am,
                dossierId: null,
                modifiedAt: new Date().toISOString(),
              })
            }
          } catch (err) {
            console.error('Failed to orphan article', articleId, err)
          }
        }
      }
      // For 'delete-content', we just rmSync the whole dossier dir (articles included).
      try {
        rmSync(dir, { recursive: true, force: true })
        touchProject(projectId)
        return true
      } catch (err) {
        console.error('Dossier delete failed:', err)
        return false
      }
    }
  )
}
