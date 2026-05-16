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
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { ulid } from 'ulid'
import type {
  ArticleMetadata,
  DossierMetadata,
  ProjectMetadataV2,
  SourceDossierMetadata,
  SourceMetadata,
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

export const readArticleMetadata = (
  projectId: string,
  dossierId: string | null,
  articleId: string
): ArticleMetadata | null =>
  readJson<ArticleMetadata>(getArticleMetadataPath(projectId, dossierId, articleId))

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
