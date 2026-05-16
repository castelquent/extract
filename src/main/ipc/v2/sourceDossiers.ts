// v2 source-dossier handlers. A source-dossier groups sources inside a
// project. Parallel hierarchy to (article) dossiers — the two are
// intentionally independent, see SourceDossierMetadata in shared/types.
//
// On disk we store nothing under the source-dossier folder other than its
// own metadata.json. The actual sources stay flat under
// projects/{id}/sources/{sourceId}/ — the link is purely a `sourceDossierId`
// field on each source's metadata.json. Keeping it that way means no
// filesystem refactor on every move and source path resolution stays
// identical to before.
import { ipcMain } from 'electron'
import { existsSync, rmSync } from 'fs'
import type {
  SourceDossierDeleteMode,
  SourceDossierMetadata,
  SourceDossierView,
  SourceMetadata,
} from '@shared/types'
import {
  ensureDir,
  getSourceDossierDir,
  getSourceDossierMetadataPath,
  getSourceMetadataPath,
  newId,
  readSourceDossierMetadata,
  writeJson,
} from '../_fs'
import { touchProject } from './projects'
import {
  idx,
  patchSource,
  patchSourceDossier,
  removeSourceDossierFromIndex,
} from './_index'

const buildView = (projectId: string, id: string): SourceDossierView | null => {
  const entry = idx.getSourceDossier(id)
  if (!entry || entry.projectId !== projectId) return null
  return {
    ...entry.meta,
    sourcesCount: idx.countSourcesInSourceDossier(projectId, id),
  }
}

export function setupV2SourceDossierHandlers(): void {
  ipcMain.handle(
    'v2:sourceDossiers:create',
    async (_, projectId: string, name: string): Promise<SourceDossierView | null> => {
      const id = newId()
      const now = new Date().toISOString()
      const metadata: SourceDossierMetadata = {
        id,
        name: name.trim() || 'Nouveau dossier',
        createdAt: now,
        modifiedAt: now,
      }
      ensureDir(getSourceDossierDir(projectId, id))
      if (!writeJson(getSourceDossierMetadataPath(projectId, id), metadata)) return null
      patchSourceDossier(projectId, id, metadata)
      touchProject(projectId)
      return buildView(projectId, id)
    }
  )

  ipcMain.handle(
    'v2:sourceDossiers:list',
    async (_, projectId: string): Promise<SourceDossierView[]> => {
      const views: SourceDossierView[] = []
      for (const meta of idx.listSourceDossiersInProject(projectId)) {
        const v = buildView(projectId, meta.id)
        if (v) views.push(v)
      }
      return views.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
    }
  )

  ipcMain.handle(
    'v2:sourceDossiers:rename',
    async (
      _,
      projectId: string,
      sourceDossierId: string,
      name: string
    ): Promise<boolean> => {
      const metadata = readSourceDossierMetadata(projectId, sourceDossierId)
      if (!metadata) return false
      const updated: SourceDossierMetadata = {
        ...metadata,
        name: name.trim() || metadata.name,
        modifiedAt: new Date().toISOString(),
      }
      const ok = writeJson(getSourceDossierMetadataPath(projectId, sourceDossierId), updated)
      if (ok) {
        patchSourceDossier(projectId, sourceDossierId, updated)
        touchProject(projectId)
      }
      return ok
    }
  )

  ipcMain.handle(
    'v2:sourceDossiers:delete',
    async (
      _,
      projectId: string,
      sourceDossierId: string,
      mode: SourceDossierDeleteMode
    ): Promise<boolean> => {
      const dir = getSourceDossierDir(projectId, sourceDossierId)
      if (!existsSync(dir)) return false

      // Snapshot the sources that point at this source-dossier before mutating.
      const affectedSourceIds: string[] = []
      for (const meta of idx.listSourcesInProject(projectId)) {
        if ((meta.sourceDossierId ?? null) === sourceDossierId) {
          affectedSourceIds.push(meta.id)
        }
      }

      if (mode === 'orphan-sources') {
        // Clear the sourceDossierId on each affected source — they become
        // orphans (Sans dossier). The PDF files themselves don't move.
        for (const sourceId of affectedSourceIds) {
          const entry = idx.getSource(sourceId)
          if (!entry) continue
          const updated: SourceMetadata = {
            ...entry.meta,
            sourceDossierId: null,
          }
          writeJson(getSourceMetadataPath(projectId, sourceId), updated)
          patchSource(projectId, sourceId, updated)
        }
      } else {
        // 'delete-content': also delete the source folders. (Not used by the
        // UI yet — same dialog as articles for symmetry. Beware of articles
        // pointing at these sources: the article delete-source flow already
        // blocks deletion when articles depend on a source, so doing this
        // here would orphan article.sourceId references. Keep simple: only
        // orphan sources for now, refuse delete-content if any article is
        // linked.)
        const blockedBy = affectedSourceIds.find(
          (sid) => idx.countArticlesUsingSource(projectId, sid, { includeDrafts: true }) > 0
        )
        if (blockedBy) return false
        for (const sourceId of affectedSourceIds) {
          // We don't carry the source removal in this file — orphaning is
          // safer. The user can delete sources individually if needed.
          const entry = idx.getSource(sourceId)
          if (!entry) continue
          const updated: SourceMetadata = {
            ...entry.meta,
            sourceDossierId: null,
          }
          writeJson(getSourceMetadataPath(projectId, sourceId), updated)
          patchSource(projectId, sourceId, updated)
        }
      }

      try {
        rmSync(dir, { recursive: true, force: true })
        removeSourceDossierFromIndex(sourceDossierId)
        touchProject(projectId)
        return true
      } catch (err) {
        console.error('Source-dossier delete failed:', err)
        return false
      }
    }
  )
}
