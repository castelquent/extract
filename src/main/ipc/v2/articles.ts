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
  getDossierArticlesDir,
  getDossiersDir,
  getOrphansDir,
  getSourceDir,
  getSourcePdfPath,
  listSubdirs,
  locateArticle,
  newId,
  readArticleMetadata,
  writeJson,
} from '../_fs'
import { generateArticleExtract } from './_python'
import { touchProject } from './projects'

// Walk all articles in a project, yielding {dossierId, articleId}.
const walkArticles = function* (projectId: string): Generator<{ dossierId: string | null; articleId: string }> {
  for (const articleId of listSubdirs(getOrphansDir(projectId))) {
    yield { dossierId: null, articleId }
  }
  for (const dossierId of listSubdirs(getDossiersDir(projectId))) {
    for (const articleId of listSubdirs(getDossierArticlesDir(projectId, dossierId))) {
      yield { dossierId, articleId }
    }
  }
}

// Apply an ArticleScope filter.
const matchesScope = (article: ArticleMetadata, scope?: ArticleScope): boolean => {
  if (!scope) return true
  if (scope.dossierId !== undefined && article.dossierId !== scope.dossierId) return false
  if (scope.sourceId !== undefined && article.sourceId !== scope.sourceId) return false
  if (scope.status !== undefined && article.status !== scope.status) return false
  return true
}

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

export function setupV2ArticleHandlers(): void {
  ipcMain.handle(
    'v2:articles:list',
    async (_, projectId: string, scope?: ArticleScope): Promise<ArticleMetadata[]> => {
      const result: ArticleMetadata[] = []
      for (const { dossierId, articleId } of walkArticles(projectId)) {
        const am = readArticleMetadata(projectId, dossierId, articleId)
        if (am && matchesScope(am, scope)) result.push(am)
      }
      // Stable order: createdAt ascending
      return result.sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
    }
  )

  ipcMain.handle(
    'v2:articles:get',
    async (_, projectId: string, articleId: string): Promise<ArticleMetadata | null> => {
      const dossierId = locateArticle(projectId, articleId)
      if (dossierId === undefined) return null
      return readArticleMetadata(projectId, dossierId, articleId)
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
        zones: payload.zones,
        pages: payload.pages,
        fields: payload.fields ?? {},
        status: 'new',
        schema: payload.schema,
        aiContext: payload.aiContext,
        createdAt: now,
        modifiedAt: now,
      }
      writeJson(getArticleMetadataPath(projectId, payload.dossierId, id), metadata)

      // Generate extract.pdf from the source
      const sourcePdf = getSourcePdfPath(projectId, payload.sourceId)
      const outputPdf = getArticleExtractPdfPath(projectId, payload.dossierId, id)
      if (existsSync(sourcePdf)) {
        const ok = await generateArticleExtract(sourcePdf, payload.zones, outputPdf)
        if (ok) {
          // Bump status to 'extracted' since the PDF is ready
          const extracted: ArticleMetadata = { ...metadata, status: 'extracted', modifiedAt: new Date().toISOString() }
          writeJson(getArticleMetadataPath(projectId, payload.dossierId, id), extracted)
          touchProject(projectId)
          return extracted
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
      if (ok) touchProject(projectId)
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
          status: am.status === 'transcribed' ? 'transcribed' : 'extracted',
          modifiedAt: new Date().toISOString(),
        }
        writeJson(getArticleMetadataPath(projectId, dossierId, articleId), updated)
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

  // Rewrite metadata at the new location with updated dossierId
  const updated: ArticleMetadata = {
    ...current,
    dossierId: destDossierId,
    modifiedAt: new Date().toISOString(),
  }
  writeJson(getArticleMetadataPath(destProjectId, destDossierId, articleId), updated)

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
