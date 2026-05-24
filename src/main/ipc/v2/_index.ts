// In-memory index of every project, source, dossier and article on disk.
//
// Read IPC handlers (articles:list, projects:get, …) query this index
// instead of walking the filesystem, which would otherwise cost N file
// reads per call. Writes go to disk first; the chokidar watcher then
// rebuilds the affected project's slice of the cache.
//
// Coherence model: project-level rebuild on any change inside a project.
// Cheap (a few dozen reads, debounced to 250ms in the watcher) and avoids
// path-parsing fragility. The startup walk seeds the cache once.
import { existsSync } from 'fs'
import type {
  ArticleMetadata,
  ArticleScope,
  DossierMetadata,
  ProjectMetadataV2,
  SourceDossierMetadata,
  SourceMetadata,
} from '@shared/types'
import {
  getDossierArticlesDir,
  getDossiersDir,
  getOrphansDir,
  getProjectThumbnailPath,
  getProjectsRoot,
  getSourceDossiersDir,
  getSourceThumbnailPath,
  getSourcesDir,
  listSubdirs,
  readArticleMetadata,
  readDossierMetadata,
  readProjectMetadata,
  readSourceDossierMetadata,
  readSourceMetadata,
} from '../_fs'

interface ProjectEntry {
  meta: ProjectMetadataV2
  hasThumbnail: boolean
}
interface SourceEntry {
  meta: SourceMetadata
  projectId: string
  hasThumbnail: boolean
}
interface DossierEntry {
  meta: DossierMetadata
  projectId: string
}
interface SourceDossierEntry {
  meta: SourceDossierMetadata
  projectId: string
}
interface ArticleEntry {
  meta: ArticleMetadata
  projectId: string
}

// Primary tables — keyed by entity id.
const projects = new Map<string, ProjectEntry>()
const sources = new Map<string, SourceEntry>()
const dossiers = new Map<string, DossierEntry>()
const sourceDossiers = new Map<string, SourceDossierEntry>()
const articles = new Map<string, ArticleEntry>()

// Reverse indexes — Sets for O(1) add/remove during rebuilds.
const sourceIdsByProject = new Map<string, Set<string>>()
const dossierIdsByProject = new Map<string, Set<string>>()
const sourceDossierIdsByProject = new Map<string, Set<string>>()
const articleIdsByProject = new Map<string, Set<string>>()

const ensureSet = (m: Map<string, Set<string>>, k: string): Set<string> => {
  let s = m.get(k)
  if (!s) { s = new Set(); m.set(k, s) }
  return s
}

// ---------- Mutation helpers (used by rebuild) ----------

const clearProjectSlice = (projectId: string): void => {
  for (const id of sourceIdsByProject.get(projectId) ?? []) sources.delete(id)
  for (const id of dossierIdsByProject.get(projectId) ?? []) dossiers.delete(id)
  for (const id of sourceDossierIdsByProject.get(projectId) ?? []) sourceDossiers.delete(id)
  for (const id of articleIdsByProject.get(projectId) ?? []) articles.delete(id)
  sourceIdsByProject.delete(projectId)
  dossierIdsByProject.delete(projectId)
  sourceDossierIdsByProject.delete(projectId)
  articleIdsByProject.delete(projectId)
}

// Re-read everything under a project folder and replace its slice of the cache.
// Returns false when the project metadata is missing (caller should treat the
// project as removed).
export const rebuildProject = (projectId: string): boolean => {
  const projectMeta = readProjectMetadata(projectId)
  clearProjectSlice(projectId)

  if (!projectMeta) {
    projects.delete(projectId)
    return false
  }

  projects.set(projectId, {
    meta: projectMeta,
    hasThumbnail: existsSync(getProjectThumbnailPath(projectId)),
  })

  // Sources
  const sourceSet = ensureSet(sourceIdsByProject, projectId)
  for (const sourceId of listSubdirs(getSourcesDir(projectId))) {
    const meta = readSourceMetadata(projectId, sourceId)
    if (!meta) continue
    sources.set(sourceId, {
      meta,
      projectId,
      hasThumbnail: existsSync(getSourceThumbnailPath(projectId, sourceId)),
    })
    sourceSet.add(sourceId)
  }

  // Source-dossiers (organisational labels — no nested content on disk)
  const sourceDossierSet = ensureSet(sourceDossierIdsByProject, projectId)
  for (const sdId of listSubdirs(getSourceDossiersDir(projectId))) {
    const meta = readSourceDossierMetadata(projectId, sdId)
    if (!meta) continue
    sourceDossiers.set(sdId, { meta, projectId })
    sourceDossierSet.add(sdId)
  }

  // Dossiers + their articles
  const dossierSet = ensureSet(dossierIdsByProject, projectId)
  const articleSet = ensureSet(articleIdsByProject, projectId)
  for (const dossierId of listSubdirs(getDossiersDir(projectId))) {
    const meta = readDossierMetadata(projectId, dossierId)
    if (!meta) continue
    dossiers.set(dossierId, { meta, projectId })
    dossierSet.add(dossierId)

    for (const articleId of listSubdirs(getDossierArticlesDir(projectId, dossierId))) {
      const am = readArticleMetadata(projectId, dossierId, articleId)
      if (!am) continue
      articles.set(articleId, { meta: am, projectId })
      articleSet.add(articleId)
    }
  }

  // Orphans
  for (const articleId of listSubdirs(getOrphansDir(projectId))) {
    const am = readArticleMetadata(projectId, null, articleId)
    if (!am) continue
    articles.set(articleId, { meta: am, projectId })
    articleSet.add(articleId)
  }

  return true
}

// Drop a project entirely from the cache (project folder was removed).
export const removeProjectFromIndex = (projectId: string): void => {
  clearProjectSlice(projectId)
  projects.delete(projectId)
}

// ---------- Write-through patches ----------
// Write IPC handlers call these after a successful disk write so reads issued
// before the watcher's 250ms debounce fires see fresh data. The watcher's
// subsequent rebuild reconverges on the same state — a no-op for these
// patches in practice.

export const patchProject = (projectId: string, meta: ProjectMetadataV2): void => {
  const prev = projects.get(projectId)
  projects.set(projectId, {
    meta,
    hasThumbnail: prev?.hasThumbnail ?? existsSync(getProjectThumbnailPath(projectId)),
  })
  ensureSet(sourceIdsByProject, projectId)
  ensureSet(dossierIdsByProject, projectId)
  ensureSet(articleIdsByProject, projectId)
}

export const patchProjectThumbnail = (projectId: string, hasThumbnail: boolean): void => {
  const prev = projects.get(projectId)
  if (!prev) return
  projects.set(projectId, { ...prev, hasThumbnail })
}

export const patchSource = (projectId: string, sourceId: string, meta: SourceMetadata): void => {
  const prev = sources.get(sourceId)
  sources.set(sourceId, {
    meta,
    projectId,
    hasThumbnail: prev?.hasThumbnail ?? existsSync(getSourceThumbnailPath(projectId, sourceId)),
  })
  ensureSet(sourceIdsByProject, projectId).add(sourceId)
}

export const patchSourceThumbnail = (sourceId: string, hasThumbnail: boolean): void => {
  const prev = sources.get(sourceId)
  if (!prev) return
  sources.set(sourceId, { ...prev, hasThumbnail })
}

export const removeSourceFromIndex = (sourceId: string): void => {
  const entry = sources.get(sourceId)
  if (!entry) return
  sourceIdsByProject.get(entry.projectId)?.delete(sourceId)
  sources.delete(sourceId)
}

export const patchDossier = (projectId: string, dossierId: string, meta: DossierMetadata): void => {
  dossiers.set(dossierId, { meta, projectId })
  ensureSet(dossierIdsByProject, projectId).add(dossierId)
}

export const removeDossierFromIndex = (dossierId: string): void => {
  const entry = dossiers.get(dossierId)
  if (!entry) return
  dossierIdsByProject.get(entry.projectId)?.delete(dossierId)
  dossiers.delete(dossierId)
}

export const patchSourceDossier = (
  projectId: string,
  sourceDossierId: string,
  meta: SourceDossierMetadata
): void => {
  sourceDossiers.set(sourceDossierId, { meta, projectId })
  ensureSet(sourceDossierIdsByProject, projectId).add(sourceDossierId)
}

export const removeSourceDossierFromIndex = (sourceDossierId: string): void => {
  const entry = sourceDossiers.get(sourceDossierId)
  if (!entry) return
  sourceDossierIdsByProject.get(entry.projectId)?.delete(sourceDossierId)
  sourceDossiers.delete(sourceDossierId)
}

export const patchArticle = (projectId: string, articleId: string, meta: ArticleMetadata): void => {
  const prev = articles.get(articleId)
  // Cross-project move: tear down the old project's bucket entry first.
  if (prev && prev.projectId !== projectId) {
    articleIdsByProject.get(prev.projectId)?.delete(articleId)
  }
  articles.set(articleId, { meta, projectId })
  ensureSet(articleIdsByProject, projectId).add(articleId)
}

export const removeArticleFromIndex = (articleId: string): void => {
  const entry = articles.get(articleId)
  if (!entry) return
  articleIdsByProject.get(entry.projectId)?.delete(articleId)
  articles.delete(articleId)
}

// ---------- Initial walk ----------

export const buildIndex = (): void => {
  projects.clear()
  sources.clear()
  dossiers.clear()
  sourceDossiers.clear()
  articles.clear()
  sourceIdsByProject.clear()
  dossierIdsByProject.clear()
  sourceDossierIdsByProject.clear()
  articleIdsByProject.clear()

  for (const projectId of listSubdirs(getProjectsRoot())) {
    rebuildProject(projectId)
  }
}

// ---------- Read API ----------

// Sort helper: by `order` ascending, falling back to `createdAt`. Matches the
// renderer's compareArticles so list output stays consistent.
const compareArticles = (a: ArticleMetadata, b: ArticleMetadata): number => {
  const ao = typeof a.order === 'number' ? a.order : Number.POSITIVE_INFINITY
  const bo = typeof b.order === 'number' ? b.order : Number.POSITIVE_INFINITY
  if (ao !== bo) return ao - bo
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
}

const matchesScope = (article: ArticleMetadata, scope?: ArticleScope): boolean => {
  const wantsDrafts = scope?.includeDrafts === true || scope?.status === 'draft'
  if (!wantsDrafts && article.status === 'draft') return false
  if (!scope) return true
  if (scope.dossierId !== undefined && article.dossierId !== scope.dossierId) return false
  if (scope.sourceId !== undefined && article.sourceId !== scope.sourceId) return false
  if (scope.status !== undefined && article.status !== scope.status) return false
  return true
}

export const idx = {
  // Projects
  listProjectIds: (): string[] => [...projects.keys()],
  getProject: (projectId: string): ProjectEntry | undefined => projects.get(projectId),

  // Sources
  listSourcesInProject: (projectId: string): SourceMetadata[] => {
    const ids = sourceIdsByProject.get(projectId)
    if (!ids) return []
    const result: SourceMetadata[] = []
    for (const id of ids) {
      const e = sources.get(id)
      if (e) result.push(e.meta)
    }
    return result
  },
  getSource: (sourceId: string): SourceEntry | undefined => sources.get(sourceId),
  countSourcesInProject: (projectId: string): number =>
    sourceIdsByProject.get(projectId)?.size ?? 0,

  // Dossiers
  listDossiersInProject: (projectId: string): DossierMetadata[] => {
    const ids = dossierIdsByProject.get(projectId)
    if (!ids) return []
    const result: DossierMetadata[] = []
    for (const id of ids) {
      const e = dossiers.get(id)
      if (e) result.push(e.meta)
    }
    return result
  },
  getDossier: (dossierId: string): DossierEntry | undefined => dossiers.get(dossierId),
  countDossiersInProject: (projectId: string): number =>
    dossierIdsByProject.get(projectId)?.size ?? 0,

  // Source-dossiers
  listSourceDossiersInProject: (projectId: string): SourceDossierMetadata[] => {
    const ids = sourceDossierIdsByProject.get(projectId)
    if (!ids) return []
    const result: SourceDossierMetadata[] = []
    for (const id of ids) {
      const e = sourceDossiers.get(id)
      if (e) result.push(e.meta)
    }
    return result
  },
  getSourceDossier: (sourceDossierId: string): SourceDossierEntry | undefined =>
    sourceDossiers.get(sourceDossierId),
  countSourcesInSourceDossier: (projectId: string, sourceDossierId: string | null): number => {
    const ids = sourceIdsByProject.get(projectId)
    if (!ids) return 0
    let count = 0
    for (const id of ids) {
      const e = sources.get(id)
      if (!e) continue
      const sdId = e.meta.sourceDossierId ?? null
      if (sdId !== sourceDossierId) continue
      count += 1
    }
    return count
  },

  // Articles
  getArticle: (articleId: string): ArticleEntry | undefined => articles.get(articleId),

  // Filtered article list for one project. Applies the same scope semantics as
  // the previous filesystem-walking implementation in articles.ts.
  listArticlesInProject: (projectId: string, scope?: ArticleScope): ArticleMetadata[] => {
    const ids = articleIdsByProject.get(projectId)
    if (!ids) return []
    const result: ArticleMetadata[] = []
    for (const id of ids) {
      const e = articles.get(id)
      if (e && matchesScope(e.meta, scope)) result.push(e.meta)
    }
    return result.sort(compareArticles)
  },

  // For sources.ts: count articles backed by a given source. Drafts excluded
  // unless includeDrafts=true (the delete path needs to see them).
  countArticlesUsingSource: (
    projectId: string,
    sourceId: string,
    opts?: { includeDrafts?: boolean }
  ): number => {
    const ids = articleIdsByProject.get(projectId)
    if (!ids) return 0
    const includeDrafts = opts?.includeDrafts === true
    let count = 0
    for (const id of ids) {
      const e = articles.get(id)
      if (!e) continue
      if (e.meta.sourceId !== sourceId) continue
      if (!includeDrafts && e.meta.status === 'draft') continue
      count += 1
    }
    return count
  },

  // For dossiers.ts: count non-draft articles in a dossier.
  countArticlesInDossier: (projectId: string, dossierId: string): number => {
    const ids = articleIdsByProject.get(projectId)
    if (!ids) return 0
    let count = 0
    for (const id of ids) {
      const e = articles.get(id)
      if (!e) continue
      if (e.meta.dossierId !== dossierId) continue
      if (e.meta.status === 'draft') continue
      count += 1
    }
    return count
  },

  // Locate where an article lives (used to be locateArticle in _fs).
  // Returns undefined if not found, null if orphan, dossierId otherwise.
  locateArticle: (projectId: string, articleId: string): string | null | undefined => {
    const e = articles.get(articleId)
    if (!e || e.projectId !== projectId) return undefined
    return e.meta.dossierId
  },
}
