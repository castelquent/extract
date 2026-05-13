// v2 dossier handlers. A dossier groups articles inside a project.
import { ipcMain } from 'electron'
import { existsSync, renameSync, rmSync } from 'fs'
import type { ArticleMetadata, DossierDeleteMode, DossierMetadata, DossierView } from '@shared/types'
import {
  ensureDir,
  getArticleDir,
  getArticleMetadataPath,
  getDossierArticlesDir,
  getDossierDir,
  getDossierMetadataPath,
  getOrphansDir,
  listSubdirs,
  newId,
  readArticleMetadata,
  readDossierMetadata,
  writeJson,
} from '../_fs'
import { touchProject } from './projects'
import {
  idx,
  patchArticle,
  patchDossier,
  removeArticleFromIndex,
  removeDossierFromIndex,
} from './_index'

const buildDossierView = (projectId: string, dossierId: string): DossierView | null => {
  const entry = idx.getDossier(dossierId)
  if (!entry || entry.projectId !== projectId) return null
  return {
    ...entry.meta,
    articlesCount: idx.countArticlesInDossier(projectId, dossierId),
  }
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
      patchDossier(projectId, id, metadata)
      touchProject(projectId)
      return buildDossierView(projectId, id)
    }
  )

  ipcMain.handle('v2:dossiers:list', async (_, projectId: string): Promise<DossierView[]> => {
    const views: DossierView[] = []
    for (const meta of idx.listDossiersInProject(projectId)) {
      const v = buildDossierView(projectId, meta.id)
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
      if (ok) {
        patchDossier(projectId, dossierId, updated)
        touchProject(projectId)
      }
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
              const updated: ArticleMetadata = {
                ...am,
                dossierId: null,
                modifiedAt: new Date().toISOString(),
              }
              writeJson(getArticleMetadataPath(projectId, null, articleId), updated)
              patchArticle(projectId, articleId, updated)
            }
          } catch (err) {
            console.error('Failed to orphan article', articleId, err)
          }
        }
      }
      // For 'delete-content', rmSync removes articles too — collect their
      // ids from the index BEFORE removing the dossier so we can purge them
      // from the cache. For 'orphan-articles', the articles have already
      // been moved out and re-patched above.
      const articlesToPurge: string[] =
        mode === 'delete-content'
          ? idx.listArticlesInProject(projectId, { dossierId, includeDrafts: true }).map((a) => a.id)
          : []

      try {
        rmSync(dir, { recursive: true, force: true })
        for (const id of articlesToPurge) removeArticleFromIndex(id)
        removeDossierFromIndex(dossierId)
        touchProject(projectId)
        return true
      } catch (err) {
        console.error('Dossier delete failed:', err)
        return false
      }
    }
  )
}
