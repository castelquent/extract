// v2 article handlers. Articles are portable units. They live under either
//   projects/{p}/orphans/{a}/                   (no dossier)
// or
//   projects/{p}/dossiers/{d}/articles/{a}/     (in a dossier)
//
// Each article folder contains:
//   metadata.json   (the ArticleMetadata)
//   extract.pdf     (PDF of the article's zones, generated from the source)
import { ipcMain } from 'electron'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'fs'
import { join } from 'path'
import type {
  ArticleMetadata,
  ArticleMoveTarget,
  ArticleScope,
  TemplateField,
  Zone,
} from '@shared/types'
import {
  ensureDir,
  getArticleDir,
  getArticleExtractPdfPath,
  getArticleMetadataPath,
  getSourceDir,
  getSourcePdfPath,
  newId,
  readArticleMetadata,
  writeJson,
} from '../_fs'
import { generateArticleExtract } from './_python'
import { touchProject } from './projects'
import { idx, patchArticle, removeArticleFromIndex } from './_index'

// Cache-backed locator. The on-disk locateArticle in _fs.ts walks dossiers
// every call; the in-memory index returns the answer directly.
const locateArticle = (projectId: string, articleId: string): string | null | undefined =>
  idx.locateArticle(projectId, articleId)

// Recursive directory copy (used for cross-project moves when source must follow).
const copyDirRecursive = (src: string, dest: string): void => {
  ensureDir(dest)
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name)
    const d = join(dest, entry.name)
    if (entry.isDirectory()) copyDirRecursive(s, d)
    else if (entry.isFile()) copyFileSync(s, d)
  }
}

// Best-effort rename, falling back to copy-and-remove if rename crosses drives.
const moveDir = (src: string, dest: string): void => {
  try {
    renameSync(src, dest)
  } catch {
    copyDirRecursive(src, dest)
    rmSync(src, { recursive: true, force: true })
  }
}

// Compute the next order index for an article being added to a dossier
// (or to the orphans section when dossierId is null). Returns max(order)+1,
// or 0 when no article in that section has an order yet. Reads from the
// in-memory index (avoids N file reads per create/move).
const nextOrderInDossier = (projectId: string, dossierId: string | null): number => {
  const articles = idx.listArticlesInProject(projectId, {
    dossierId,
    includeDrafts: true,
  })
  let max = -1
  for (const am of articles) {
    if (typeof am.order === 'number' && am.order > max) max = am.order
  }
  return max + 1
}

export function setupV2ArticleHandlers(): void {
  ipcMain.handle(
    'v2:articles:list',
    async (_, projectId: string, scope?: ArticleScope): Promise<ArticleMetadata[]> =>
      idx.listArticlesInProject(projectId, scope)
  )

  ipcMain.handle(
    'v2:articles:get',
    async (_, projectId: string, articleId: string): Promise<ArticleMetadata | null> => {
      const e = idx.getArticle(articleId)
      if (!e || e.projectId !== projectId) return null
      return e.meta
    }
  )

  ipcMain.handle(
    'v2:articles:create',
    async (
      _,
      projectId: string,
      payload: {
        sourceId: string
        dossierId: string | null
        zones: Zone[]
        pages: number[]
        fields?: Record<string, string>
        schema: TemplateField[]
        aiContext?: string
        skipExtractGeneration?: boolean
      }
    ): Promise<ArticleMetadata | null> => {
      const id = newId()
      const now = new Date().toISOString()
      const articleDir = getArticleDir(projectId, payload.dossierId, id)
      ensureDir(articleDir)

      const metadata: ArticleMetadata = {
        id,
        sourceId: payload.sourceId,
        dossierId: payload.dossierId,
        order: nextOrderInDossier(projectId, payload.dossierId),
        zones: payload.zones,
        pages: payload.pages,
        fields: payload.fields ?? {},
        status: 'draft',
        schema: payload.schema,
        aiContext: payload.aiContext,
        createdAt: now,
        modifiedAt: now,
      }
      writeJson(getArticleMetadataPath(projectId, payload.dossierId, id), metadata)
      patchArticle(projectId, id, metadata)

      // Skip PDF generation when the caller is just persisting in-progress
      // work (Sauvegarder during extraction). Status stays 'draft'.
      if (payload.skipExtractGeneration) {
        touchProject(projectId)
        return metadata
      }

      const sourcePdf = getSourcePdfPath(projectId, payload.sourceId)
      const outputPdf = getArticleExtractPdfPath(projectId, payload.dossierId, id)
      if (existsSync(sourcePdf)) {
        const ok = await generateArticleExtract(sourcePdf, payload.zones, outputPdf)
        if (ok) {
          const ready: ArticleMetadata = { ...metadata, status: 'ready', modifiedAt: new Date().toISOString() }
          writeJson(getArticleMetadataPath(projectId, payload.dossierId, id), ready)
          patchArticle(projectId, id, ready)
          touchProject(projectId)
          return ready
        }
      }
      touchProject(projectId)
      return metadata
    }
  )

  ipcMain.handle(
    'v2:articles:update',
    async (
      _,
      projectId: string,
      articleId: string,
      patch: Partial<Pick<ArticleMetadata, 'fields' | 'zones' | 'pages' | 'status' | 'sourceId' | 'dossierId' | 'schema' | 'aiContext'>>
    ): Promise<boolean> => {
      const dossierId = locateArticle(projectId, articleId)
      if (dossierId === undefined) return false
      const current = readArticleMetadata(projectId, dossierId, articleId)
      if (!current) return false

      // dossierId in patch is a move — reject here (use articles:move).
      if (patch.dossierId !== undefined && patch.dossierId !== current.dossierId) {
        return false
      }

      const updated: ArticleMetadata = {
        ...current,
        ...patch,
        dossierId: current.dossierId,
        modifiedAt: new Date().toISOString(),
      }
      const ok = writeJson(getArticleMetadataPath(projectId, dossierId, articleId), updated)
      if (ok) {
        patchArticle(projectId, articleId, updated)
        touchProject(projectId)
      }
      return ok
    }
  )

  ipcMain.handle(
    'v2:articles:delete',
    async (_, projectId: string, articleId: string): Promise<boolean> => {
      const dossierId = locateArticle(projectId, articleId)
      if (dossierId === undefined) return false
      const dir = getArticleDir(projectId, dossierId, articleId)
      try {
        rmSync(dir, { recursive: true, force: true })
        removeArticleFromIndex(articleId)
        touchProject(projectId)
        return true
      } catch (err) {
        console.error('Article delete failed:', err)
        return false
      }
    }
  )

  // Move logic:
  //   - target.targetProjectId set → cross-project move (target.targetDossierId optional, null = orphan)
  //   - else → intra-project move (target.dossierId optional, null = orphan)
  ipcMain.handle(
    'v2:articles:move',
    async (
      _,
      projectId: string,
      articleId: string,
      target: ArticleMoveTarget
    ): Promise<boolean> => {
      return moveOneArticle(projectId, articleId, target)
    }
  )

  ipcMain.handle(
    'v2:articles:moveBulk',
    async (
      _,
      projectId: string,
      articleIds: string[],
      target: ArticleMoveTarget
    ): Promise<boolean> => {
      let allOk = true
      // Cache: when moving cross-project, multiple articles may share a source —
      // copy each source only once.
      for (const articleId of articleIds) {
        const ok = await moveOneArticle(projectId, articleId, target)
        if (!ok) allOk = false
      }
      return allOk
    }
  )

  ipcMain.handle(
    'v2:articles:reorder',
    async (
      _,
      projectId: string,
      dossierId: string | null,
      orderedIds: string[]
    ): Promise<boolean> => {
      let allOk = true
      // Re-number every id in the provided list to its index. This also
      // backfills `order` for articles that didn't have one before.
      orderedIds.forEach((articleId, index) => {
        // Confirm the article actually lives in the targeted dossier;
        // ignore stale ids silently rather than failing the whole batch.
        const actual = locateArticle(projectId, articleId)
        if (actual !== dossierId) return
        const am = readArticleMetadata(projectId, dossierId, articleId)
        if (!am) {
          allOk = false
          return
        }
        if (am.order === index) return
        const updated: ArticleMetadata = {
          ...am,
          order: index,
          modifiedAt: new Date().toISOString(),
        }
        const ok = writeJson(
          getArticleMetadataPath(projectId, dossierId, articleId),
          updated
        )
        if (ok) patchArticle(projectId, articleId, updated)
        else allOk = false
      })
      if (allOk) touchProject(projectId)
      return allOk
    }
  )

  ipcMain.handle(
    'v2:articles:getExtractData',
    async (_, projectId: string, articleId: string): Promise<string | null> => {
      const dossierId = locateArticle(projectId, articleId)
      if (dossierId === undefined) return null
      const pdfPath = getArticleExtractPdfPath(projectId, dossierId, articleId)
      if (!existsSync(pdfPath)) return null
      try {
        const buffer = readFileSync(pdfPath)
        return `data:application/pdf;base64,${buffer.toString('base64')}`
      } catch {
        return null
      }
    }
  )

  ipcMain.handle(
    'v2:articles:regenerateExtract',
    async (_, projectId: string, articleId: string): Promise<boolean> => {
      const dossierId = locateArticle(projectId, articleId)
      if (dossierId === undefined) return false
      const am = readArticleMetadata(projectId, dossierId, articleId)
      if (!am) return false
      const sourcePdf = getSourcePdfPath(projectId, am.sourceId)
      if (!existsSync(sourcePdf)) return false
      const outputPdf = getArticleExtractPdfPath(projectId, dossierId, articleId)
      const ok = await generateArticleExtract(sourcePdf, am.zones, outputPdf)
      if (ok) {
        const updated: ArticleMetadata = {
          ...am,
          status: 'ready',
          modifiedAt: new Date().toISOString(),
        }
        writeJson(getArticleMetadataPath(projectId, dossierId, articleId), updated)
        patchArticle(projectId, articleId, updated)
        touchProject(projectId)
      }
      return ok
    }
  )
}

// Move a single article according to an ArticleMoveTarget.
// Returns true on success.
async function moveOneArticle(
  projectId: string,
  articleId: string,
  target: ArticleMoveTarget
): Promise<boolean> {
  const currentDossier = locateArticle(projectId, articleId)
  if (currentDossier === undefined) return false
  const current = readArticleMetadata(projectId, currentDossier, articleId)
  if (!current) return false

  const isCrossProject = !!target.targetProjectId && target.targetProjectId !== projectId
  const destProjectId = isCrossProject ? target.targetProjectId! : projectId
  const destDossierId = isCrossProject
    ? (target.targetDossierId ?? null)
    : (target.dossierId ?? null)

  // No-op if same destination
  if (!isCrossProject && destDossierId === currentDossier) return true

  // Cross-project: ensure target source exists. If not, copy it from source project.
  if (isCrossProject) {
    const targetSourceDir = getSourceDir(destProjectId, current.sourceId)
    if (!existsSync(targetSourceDir)) {
      const srcSourceDir = getSourceDir(projectId, current.sourceId)
      if (!existsSync(srcSourceDir)) {
        console.error('Source missing in origin project; cannot move article cross-project')
        return false
      }
      try {
        copyDirRecursiveLocal(srcSourceDir, targetSourceDir)
      } catch (err) {
        console.error('Failed to copy source on cross-project move:', err)
        return false
      }
    }
  }

  const srcDir = getArticleDir(projectId, currentDossier, articleId)
  const destDir = getArticleDir(destProjectId, destDossierId, articleId)

  // Ensure destination parent exists
  mkdirSync(join(destDir, '..'), { recursive: true })

  try {
    moveDirCompat(srcDir, destDir)
  } catch (err) {
    console.error('Article move failed:', err)
    return false
  }

  // Rewrite metadata at the new location with updated dossierId. Reset
  // `order` to "append to end of destination" — preserving the old order
  // wouldn't be meaningful in a different list, and a stale value would
  // collide with destination siblings.
  const updated: ArticleMetadata = {
    ...current,
    dossierId: destDossierId,
    order: nextOrderInDossier(destProjectId, destDossierId),
    modifiedAt: new Date().toISOString(),
  }
  writeJson(getArticleMetadataPath(destProjectId, destDossierId, articleId), updated)
  patchArticle(destProjectId, articleId, updated)

  touchProject(projectId)
  if (isCrossProject) touchProject(destProjectId)
  return true
}

// Local helpers (duplicated to avoid circular imports with the file at the top)
function copyDirRecursiveLocal(src: string, dest: string): void {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name)
    const d = join(dest, entry.name)
    if (entry.isDirectory()) copyDirRecursiveLocal(s, d)
    else if (entry.isFile()) copyFileSync(s, d)
  }
}

function moveDirCompat(src: string, dest: string): void {
  try {
    renameSync(src, dest)
  } catch {
    copyDirRecursiveLocal(src, dest)
    rmSync(src, { recursive: true, force: true })
  }
}

// Suppress unused warnings for helpers exported only to make the file's intent
// clearer to future readers. (Kept inline above.)
void statSync
void moveDir
