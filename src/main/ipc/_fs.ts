// Filesystem helpers for the v2 hierarchy:
//   projects/{projectId}/
//     metadata.json
//     thumbnail.png
//     sources/{sourceId}/
//       source.pdf
//       thumbnail.png
//       metadata.json
//     dossiers/{dossierId}/
//       metadata.json
//       articles/{articleId}/
//         metadata.json
//         extract.pdf
//     orphans/{articleId}/
//       metadata.json
//       extract.pdf
//
// IDs are ULIDs (26 chars, sortable). All user-supplied names live in metadata.json,
// never in folder names — so Windows path limits and special characters never bite.

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import { ulid } from 'ulid'
import type {
  ArticleMetadata,
  DossierMetadata,
  ProjectMetadataV2,
  SourceDossierMetadata,
  SourceMetadata,
  TemplateField,
} from '@shared/types'

// ---- ID generation ----
export const newId = (): string => ulid()

// ---- Root paths ----
export const getAppDataRoot = (): string => app.getPath('userData')

export const getProjectsRoot = (): string => {
  const p = join(getAppDataRoot(), 'projects')
  if (!existsSync(p)) mkdirSync(p, { recursive: true })
  return p
}

// ---- Project paths ----
export const getProjectDir = (projectId: string): string =>
  join(getProjectsRoot(), projectId)
export const getProjectMetadataPath = (projectId: string): string =>
  join(getProjectDir(projectId), 'metadata.json')
export const getProjectThumbnailPath = (projectId: string): string =>
  join(getProjectDir(projectId), 'thumbnail.png')

// ---- Source paths ----
export const getSourcesDir = (projectId: string): string =>
  join(getProjectDir(projectId), 'sources')
export const getSourceDir = (projectId: string, sourceId: string): string =>
  join(getSourcesDir(projectId), sourceId)
export const getSourceMetadataPath = (projectId: string, sourceId: string): string =>
  join(getSourceDir(projectId, sourceId), 'metadata.json')
export const getSourcePdfPath = (projectId: string, sourceId: string): string =>
  join(getSourceDir(projectId, sourceId), 'source.pdf')
export const getSourceThumbnailPath = (projectId: string, sourceId: string): string =>
  join(getSourceDir(projectId, sourceId), 'thumbnail.png')

// ---- Source-dossier paths (parallel to dossier paths; for grouping sources) ----
export const getSourceDossiersDir = (projectId: string): string =>
  join(getProjectDir(projectId), 'source-dossiers')
export const getSourceDossierDir = (projectId: string, sourceDossierId: string): string =>
  join(getSourceDossiersDir(projectId), sourceDossierId)
export const getSourceDossierMetadataPath = (projectId: string, sourceDossierId: string): string =>
  join(getSourceDossierDir(projectId, sourceDossierId), 'metadata.json')

// ---- Dossier paths ----
export const getDossiersDir = (projectId: string): string =>
  join(getProjectDir(projectId), 'dossiers')
export const getDossierDir = (projectId: string, dossierId: string): string =>
  join(getDossiersDir(projectId), dossierId)
export const getDossierMetadataPath = (projectId: string, dossierId: string): string =>
  join(getDossierDir(projectId, dossierId), 'metadata.json')
export const getDossierArticlesDir = (projectId: string, dossierId: string): string =>
  join(getDossierDir(projectId, dossierId), 'articles')

// ---- Orphans paths (articles without a dossier) ----
export const getOrphansDir = (projectId: string): string =>
  join(getProjectDir(projectId), 'orphans')

// ---- Article paths ----
// dossierId === null → orphan in projects/{p}/orphans/{a}/
// dossierId !== null → projects/{p}/dossiers/{d}/articles/{a}/
export const getArticleDir = (
  projectId: string,
  dossierId: string | null,
  articleId: string
): string => {
  if (dossierId === null) return join(getOrphansDir(projectId), articleId)
  return join(getDossierArticlesDir(projectId, dossierId), articleId)
}
export const getArticleMetadataPath = (
  projectId: string,
  dossierId: string | null,
  articleId: string
): string => join(getArticleDir(projectId, dossierId, articleId), 'metadata.json')
export const getArticleExtractPdfPath = (
  projectId: string,
  dossierId: string | null,
  articleId: string
): string => join(getArticleDir(projectId, dossierId, articleId), 'extract.pdf')

// Mandatory raw transcription content (markdown). Always at content.md.
export const getArticleContentMdPath = (
  projectId: string,
  dossierId: string | null,
  articleId: string
): string => join(getArticleDir(projectId, dossierId, articleId), 'content.md')

// Debug-only sidecar: raw OCR markdown as returned by Mistral OCR (before
// the chat cleanup step). Lets us diff content.md against the original to
// see what the LLM dropped / hallucinated. Temporary — remove once the
// cleanup pipeline is trustworthy.
export const getArticleOcrOriginalMdPath = (
  projectId: string,
  dossierId: string | null,
  articleId: string
): string => join(getArticleDir(projectId, dossierId, articleId), 'ocr_original.md')

// Debug-only sidecar: the raw `pages[].tables[]` array as returned by Mistral
// OCR when `table_format` is enabled. Dumped as JSON so we can inspect what
// Mistral actually emitted (ids, content) when a placeholder doesn't get
// substituted in content.md.
export const getArticleOcrTablesJsonPath = (
  projectId: string,
  dossierId: string | null,
  articleId: string
): string => join(getArticleDir(projectId, dossierId, articleId), 'ocr_tables.json')

// Per-article folder for extracted images / embedded media (Mistral OCR
// returns inline images as base64; we decode them into individual files
// here). Referenced from content.md via the custom `extract-asset://` URL
// scheme so the markdown stays portable across project moves and ZIP
// export/import.
export const getArticleAssetsDir = (
  projectId: string,
  dossierId: string | null,
  articleId: string
): string => join(getArticleDir(projectId, dossierId, articleId), 'assets')

export const getArticleAssetPath = (
  projectId: string,
  dossierId: string | null,
  articleId: string,
  filename: string
): string => join(getArticleAssetsDir(projectId, dossierId, articleId), filename)

// Slugify a field name into a safe filesystem name. We avoid normalising
// accents away (keeps "Étapes" readable as "etapes") but strip everything
// that's not a-z 0-9 dash. Snapshotted schema names are stable per article,
// so collisions across templates aren't a concern.
const slugFieldName = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'field'

// One .md file per markdown sub-field, filename derived from the field name.
export const getArticleMdFieldPath = (
  projectId: string,
  dossierId: string | null,
  articleId: string,
  fieldName: string
): string =>
  join(getArticleDir(projectId, dossierId, articleId), `${slugFieldName(fieldName)}.md`)

// ============================================================
// Small filesystem utilities
// ============================================================

export const ensureDir = (path: string): void => {
  if (!existsSync(path)) mkdirSync(path, { recursive: true })
}

export const readJson = <T>(path: string): T | null => {
  try {
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch {
    return null
  }
}

export const writeJson = (path: string, data: unknown): boolean => {
  try {
    ensureDir(join(path, '..'))
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch {
    return false
  }
}

// Read a .md file (or any text file) returning empty string when missing.
// We intentionally do NOT return null on missing files: an article without a
// content.md yet (e.g. just-saved draft pre-transcription) has empty content,
// not "unknown".
export const readMdFile = (path: string): string => {
  try {
    if (!existsSync(path)) return ''
    return readFileSync(path, 'utf-8')
  } catch {
    return ''
  }
}

export const writeMdFile = (path: string, content: string): boolean => {
  try {
    ensureDir(join(path, '..'))
    writeFileSync(path, content ?? '', 'utf-8')
    return true
  } catch {
    return false
  }
}

export const deleteFileIfExists = (path: string): void => {
  try {
    if (existsSync(path)) unlinkSync(path)
  } catch {
    // ignore
  }
}

export const listSubdirs = (path: string): string[] => {
  if (!existsSync(path)) return []
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return []
  }
}

// ============================================================
// Locator: find which dossier (or orphan) an article lives in.
// Used by article handlers when only articleId is known.
// Returns dossierId (null for orphan) or undefined if not found.
// ============================================================
export const locateArticle = (
  projectId: string,
  articleId: string
): string | null | undefined => {
  // Check orphans first (cheap, single dir)
  const orphanDir = join(getOrphansDir(projectId), articleId)
  if (existsSync(orphanDir)) return null

  // Walk dossiers
  const dossiersRoot = getDossiersDir(projectId)
  if (!existsSync(dossiersRoot)) return undefined
  for (const dossierId of listSubdirs(dossiersRoot)) {
    const candidate = join(getDossierArticlesDir(projectId, dossierId), articleId)
    if (existsSync(candidate)) return dossierId
  }
  return undefined
}

// ============================================================
// Aggregated readers — used to build *View types
// ============================================================

export const readProjectMetadata = (projectId: string): ProjectMetadataV2 | null =>
  readJson<ProjectMetadataV2>(getProjectMetadataPath(projectId))

export const readSourceMetadata = (
  projectId: string,
  sourceId: string
): SourceMetadata | null =>
  readJson<SourceMetadata>(getSourceMetadataPath(projectId, sourceId))

export const readDossierMetadata = (
  projectId: string,
  dossierId: string
): DossierMetadata | null =>
  readJson<DossierMetadata>(getDossierMetadataPath(projectId, dossierId))

export const readSourceDossierMetadata = (
  projectId: string,
  sourceDossierId: string
): SourceDossierMetadata | null =>
  readJson<SourceDossierMetadata>(getSourceDossierMetadataPath(projectId, sourceDossierId))

// Hydrates an article: reads metadata.json, then loads content.md into
// `content` and each markdown sub-field into `fields[fieldName]`. The
// returned object is the runtime shape the renderer expects.
export const readArticleMetadata = (
  projectId: string,
  dossierId: string | null,
  articleId: string
): ArticleMetadata | null => {
  const meta = readJson<ArticleMetadata>(getArticleMetadataPath(projectId, dossierId, articleId))
  if (!meta) return null
  // Migration safety: older articles on disk won't have `content` yet.
  if (typeof meta.content !== 'string') meta.content = ''
  // Always read content.md (empty string if not present yet).
  meta.content = readMdFile(getArticleContentMdPath(projectId, dossierId, articleId))
  // Hydrate markdown sub-fields by name from per-field .md files.
  const fields: Record<string, string> = { ...(meta.fields ?? {}) }
  for (const field of meta.schema ?? []) {
    if (field.type === 'markdown') {
      fields[field.name] = readMdFile(
        getArticleMdFieldPath(projectId, dossierId, articleId, field.name)
      )
    }
  }
  meta.fields = fields
  return meta
}

// Persist an article: splits fields by type. text/textarea + structural data
// go to metadata.json; markdown sub-fields go to their own .md files; the
// always-present `content` goes to content.md.
export const writeArticleMetadata = (
  projectId: string,
  dossierId: string | null,
  articleId: string,
  article: ArticleMetadata
): boolean => {
  const schema: TemplateField[] = article.schema ?? []
  const mdNames = new Set(schema.filter((f) => f.type === 'markdown').map((f) => f.name))
  const textFields: Record<string, string> = {}
  const mdFields: Record<string, string> = {}
  for (const [name, value] of Object.entries(article.fields ?? {})) {
    if (mdNames.has(name)) mdFields[name] = value
    else textFields[name] = value
  }
  // The on-disk metadata.json contains text/textarea values only and no
  // `content` (which lives in content.md).
  const onDisk = { ...article, fields: textFields }
  delete (onDisk as Partial<ArticleMetadata>).content
  const okJson = writeJson(getArticleMetadataPath(projectId, dossierId, articleId), onDisk)
  const okContent = writeMdFile(
    getArticleContentMdPath(projectId, dossierId, articleId),
    article.content ?? ''
  )
  let okFields = true
  for (const [name, value] of Object.entries(mdFields)) {
    if (!writeMdFile(getArticleMdFieldPath(projectId, dossierId, articleId, name), value)) {
      okFields = false
    }
  }
  return okJson && okContent && okFields
}

// ============================================================
// Folder size helper (used by project info / export size hints)
// ============================================================
export const dirSize = (path: string): number => {
  if (!existsSync(path)) return 0
  let total = 0
  try {
    const entries = readdirSync(path, { withFileTypes: true })
    for (const entry of entries) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) total += dirSize(child)
      else total += statSync(child).size
    }
  } catch {
    // ignore
  }
  return total
}
