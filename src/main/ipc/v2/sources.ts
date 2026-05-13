// v2 sources handlers. A source = a PDF imported into a project. Stored under
// projects/{projectId}/sources/{sourceId}/source.pdf with a metadata.json.
import { ipcMain, dialog } from 'electron'
import { copyFileSync, existsSync, readFileSync, rmSync } from 'fs'
import type { SourceMetadata, SourceView } from '@shared/types'
import {
  ensureDir,
  getProjectThumbnailPath,
  getSourceDir,
  getSourceMetadataPath,
  getSourcePdfPath,
  getSourceThumbnailPath,
  newId,
  writeJson,
} from '../_fs'
import { convertImageToPdf, generateThumbnail, getPdfPageCount } from './_python'
import { touchProject } from './projects'
import {
  idx,
  patchProjectThumbnail,
  patchSource,
  patchSourceThumbnail,
  removeSourceFromIndex,
} from './_index'

// Build the source view from the in-memory index (no file walk).
const buildSourceView = (projectId: string, sourceId: string): SourceView | null => {
  const entry = idx.getSource(sourceId)
  if (!entry || entry.projectId !== projectId) return null
  return {
    ...entry.meta,
    thumbnailPath: entry.hasThumbnail ? getSourceThumbnailPath(projectId, sourceId) : null,
    articlesCount: idx.countArticlesUsingSource(projectId, sourceId),
  }
}

// Import one file (PDF or image) into a project as a source.
// Returns the created SourceView, or null on failure.
const importFileAsSource = async (
  projectId: string,
  filePath: string
): Promise<SourceView | null> => {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const isImage = ['jpg', 'jpeg', 'png'].includes(ext)
  const originalFilename = filePath.split(/[/\\]/).pop() ?? 'source.pdf'

  const sourceId = newId()
  const sourceDir = getSourceDir(projectId, sourceId)
  ensureDir(sourceDir)

  const sourcePdfPath = getSourcePdfPath(projectId, sourceId)

  if (isImage) {
    const ok = await convertImageToPdf(filePath, sourcePdfPath)
    if (!ok) {
      try { rmSync(sourceDir, { recursive: true, force: true }) } catch {}
      return null
    }
  } else {
    try {
      copyFileSync(filePath, sourcePdfPath)
    } catch (err) {
      console.error('Failed to copy source PDF:', err)
      try { rmSync(sourceDir, { recursive: true, force: true }) } catch {}
      return null
    }
  }

  const pageCount = await getPdfPageCount(sourcePdfPath)

  const metadata: SourceMetadata = {
    id: sourceId,
    originalFilename,
    pageCount,
    importedAt: new Date().toISOString(),
  }
  writeJson(getSourceMetadataPath(projectId, sourceId), metadata)
  patchSource(projectId, sourceId, metadata)

  // Generate thumbnail for the source
  const sourceThumbPath = getSourceThumbnailPath(projectId, sourceId)
  const thumbOk = await generateThumbnail(sourcePdfPath, sourceThumbPath)
  if (thumbOk) patchSourceThumbnail(sourceId, true)

  // If the project doesn't have its own thumbnail yet, use this source's thumbnail.
  if (thumbOk && !existsSync(getProjectThumbnailPath(projectId))) {
    try {
      copyFileSync(sourceThumbPath, getProjectThumbnailPath(projectId))
      patchProjectThumbnail(projectId, true)
    } catch {
      /* ignore */
    }
  }

  touchProject(projectId)
  return buildSourceView(projectId, sourceId)
}

export function setupV2SourceHandlers(): void {
  ipcMain.handle('v2:sources:add', async (_, projectId: string): Promise<SourceView[]> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'jpg', 'jpeg', 'png'] },
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) return []

    const created: SourceView[] = []
    for (const filePath of result.filePaths) {
      const view = await importFileAsSource(projectId, filePath)
      if (view) created.push(view)
    }
    return created
  })

  ipcMain.handle('v2:sources:list', async (_, projectId: string): Promise<SourceView[]> => {
    const views: SourceView[] = []
    for (const meta of idx.listSourcesInProject(projectId)) {
      const v = buildSourceView(projectId, meta.id)
      if (v) views.push(v)
    }
    return views.sort((a, b) =>
      new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime()
    )
  })

  ipcMain.handle(
    'v2:sources:get',
    async (_, projectId: string, sourceId: string): Promise<SourceView | null> =>
      buildSourceView(projectId, sourceId)
  )

  ipcMain.handle(
    'v2:sources:delete',
    async (
      _,
      projectId: string,
      sourceId: string,
      force?: boolean
    ): Promise<{ ok: boolean; reason?: 'has-articles'; articlesCount?: number }> => {
      const dir = getSourceDir(projectId, sourceId)
      if (!existsSync(dir)) return { ok: false }

      // Delete check counts drafts too — we don't want to leave drafts pointing
      // at a deleted source.
      const articlesCount = idx.countArticlesUsingSource(projectId, sourceId, { includeDrafts: true })
      if (articlesCount > 0 && !force) {
        return { ok: false, reason: 'has-articles', articlesCount }
      }
      // Force delete: caller is responsible for purging articles (or we could
      // walk and remove articles with this sourceId here). Keep it simple:
      // only remove the source folder. Articles with dangling sourceId surface
      // as "broken" in the UI.
      try {
        rmSync(dir, { recursive: true, force: true })
        removeSourceFromIndex(sourceId)
        touchProject(projectId)
        return { ok: true }
      } catch (err) {
        console.error('Source delete failed:', err)
        return { ok: false }
      }
    }
  )

  ipcMain.handle(
    'v2:sources:getPdfData',
    async (_, projectId: string, sourceId: string): Promise<ArrayBuffer | null> => {
      const pdfPath = getSourcePdfPath(projectId, sourceId)
      if (!existsSync(pdfPath)) return null
      try {
        const buffer = readFileSync(pdfPath)
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      } catch (err) {
        console.error('Failed to read source PDF:', err)
        return null
      }
    }
  )

  ipcMain.handle(
    'v2:sources:getThumbnail',
    async (_, projectId: string, sourceId: string): Promise<string | null> => {
      const thumbPath = getSourceThumbnailPath(projectId, sourceId)
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
