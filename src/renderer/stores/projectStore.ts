// Per-project store. Loads the detailed view of one project: its metadata,
// sources, dossiers, and (optionally) the full article list inside the project.
import { create } from 'zustand'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import type {
  ArticleMetadata,
  ArticleMoveTarget,
  DossierDeleteMode,
  DossierView,
  ProjectView,
  SourceDossierDeleteMode,
  SourceDossierView,
  SourceMoveTarget,
  SourceView,
} from '@shared/types'

const t = (key: string, opts?: Record<string, unknown>): string =>
  i18n.t(key, opts ?? {}) as string

interface ProjectState {
  project: ProjectView | null
  sources: SourceView[]
  sourceDossiers: SourceDossierView[]
  dossiers: DossierView[]
  articles: ArticleMetadata[]
  loading: boolean
  error: string | null

  // Actions
  loadProject: (projectId: string) => Promise<void>
  refresh: () => Promise<void>
  reset: () => void

  // Sources
  addSources: () => Promise<SourceView[]>
  deleteSource: (sourceId: string, force?: boolean) => Promise<boolean>
  renameSource: (sourceId: string, name: string) => Promise<boolean>
  replaceSourcePdf: (sourceId: string) => Promise<SourceView | null>
  moveSourcesBulk: (sourceIds: string[], target: SourceMoveTarget) => Promise<boolean>

  // Source-dossiers
  createSourceDossier: (name: string) => Promise<SourceDossierView | null>
  renameSourceDossier: (sourceDossierId: string, name: string) => Promise<boolean>
  deleteSourceDossier: (
    sourceDossierId: string,
    mode: SourceDossierDeleteMode
  ) => Promise<boolean>

  // Dossiers
  createDossier: (name: string) => Promise<DossierView | null>
  renameDossier: (dossierId: string, name: string) => Promise<boolean>
  deleteDossier: (dossierId: string, mode: DossierDeleteMode) => Promise<boolean>

  // Articles
  deleteArticle: (articleId: string) => Promise<boolean>
  moveArticle: (articleId: string, target: ArticleMoveTarget) => Promise<boolean>
  moveArticlesBulk: (articleIds: string[], target: ArticleMoveTarget) => Promise<boolean>
  reorderArticles: (dossierId: string | null, orderedIds: string[]) => Promise<boolean>
}

const initialState = {
  project: null as ProjectView | null,
  sources: [] as SourceView[],
  sourceDossiers: [] as SourceDossierView[],
  dossiers: [] as DossierView[],
  articles: [] as ArticleMetadata[],
  loading: false,
  error: null as string | null,
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  ...initialState,

  loadProject: async (projectId) => {
    set({ loading: true, error: null })
    try {
      const [project, sources, sourceDossiers, dossiers, articles] = await Promise.all([
        window.api.v2_projectsGet(projectId),
        window.api.v2_sourcesList(projectId),
        window.api.v2_sourceDossiersList(projectId),
        window.api.v2_dossiersList(projectId),
        window.api.v2_articlesList(projectId),
      ])
      set({ project, sources, sourceDossiers, dossiers, articles, loading: false })
    } catch (err) {
      console.error(err)
      toast.error(t('project:toasts.loadError'))
      set({ error: 'Erreur lors du chargement du projet', loading: false })
    }
  },

  refresh: async () => {
    const id = get().project?.id
    if (!id) return
    await get().loadProject(id)
  },

  reset: () => set(initialState),

  addSources: async () => {
    const projectId = get().project?.id
    if (!projectId) return []
    try {
      const created = await window.api.v2_sourcesAdd(projectId)
      if (created.length > 0) {
        toast.success(t('sources:toasts.imported', { count: created.length }))
        await get().refresh()
      }
      return created
    } catch (err) {
      console.error(err)
      toast.error(t('sources:toasts.importError'))
      return []
    }
  },

  deleteSource: async (sourceId, force) => {
    const projectId = get().project?.id
    if (!projectId) return false
    try {
      const result = await window.api.v2_sourcesDelete(projectId, sourceId, force)
      if (result.ok) {
        toast.success(t('sources:toasts.deleted'))
        await get().refresh()
        return true
      } else if (result.reason === 'has-articles') {
        toast.error(t('sources:toasts.deleteHasArticles', { count: result.articlesCount }))
      }
      return false
    } catch (err) {
      console.error(err)
      toast.error(t('sources:toasts.deleteError'))
      return false
    }
  },

  renameSource: async (sourceId, name) => {
    const projectId = get().project?.id
    if (!projectId) return false
    try {
      const ok = await window.api.v2_sourcesUpdate(projectId, sourceId, { name })
      if (ok) {
        set((s) => ({
          sources: s.sources.map((src) =>
            src.id === sourceId ? { ...src, name: name.trim() || undefined } : src
          ),
        }))
        toast.success(t('sources:toasts.renamed'))
      }
      return ok
    } catch (err) {
      console.error(err)
      toast.error(t('sources:toasts.renameError'))
      return false
    }
  },

  replaceSourcePdf: async (sourceId) => {
    const projectId = get().project?.id
    if (!projectId) return null
    try {
      const view = await window.api.v2_sourcesReplacePdf(projectId, sourceId)
      if (view) {
        toast.success(t('sources:toasts.pdfReplaced'))
        await get().refresh()
      }
      return view
    } catch (err) {
      console.error(err)
      toast.error(t('sources:toasts.pdfReplaceError'))
      return null
    }
  },

  moveSourcesBulk: async (sourceIds, target) => {
    const projectId = get().project?.id
    if (!projectId) return false
    // Optimistic: patch local sources so the sidebar regroups before the
    // watcher round-trip lands.
    const idSet = new Set(sourceIds)
    set((s) => ({
      sources: s.sources.map((src) =>
        idSet.has(src.id) ? { ...src, sourceDossierId: target.sourceDossierId } : src
      ),
    }))
    try {
      const ok = await window.api.v2_sourcesMoveBulk(projectId, sourceIds, target)
      if (!ok) {
        toast.error(t('sources:toasts.moveError'))
        await get().refresh()
      } else {
        toast.success(t('sources:toasts.moved', { count: sourceIds.length }))
      }
      return ok
    } catch (err) {
      console.error(err)
      toast.error(t('sources:toasts.moveError'))
      await get().refresh()
      return false
    }
  },

  createSourceDossier: async (name) => {
    const projectId = get().project?.id
    if (!projectId) return null
    try {
      const view = await window.api.v2_sourceDossiersCreate(projectId, name)
      if (view) {
        set((s) => ({ sourceDossiers: [...s.sourceDossiers, view] }))
        toast.success(t('sources:toasts.folderCreated'))
      }
      return view
    } catch (err) {
      console.error(err)
      toast.error(t('sources:toasts.folderCreateError'))
      return null
    }
  },

  renameSourceDossier: async (sourceDossierId, name) => {
    const projectId = get().project?.id
    if (!projectId) return false
    try {
      const ok = await window.api.v2_sourceDossiersRename(projectId, sourceDossierId, name)
      if (ok) {
        set((s) => ({
          sourceDossiers: s.sourceDossiers.map((d) =>
            d.id === sourceDossierId
              ? { ...d, name, modifiedAt: new Date().toISOString() }
              : d
          ),
        }))
        toast.success(t('sources:toasts.folderRenamed'))
      }
      return ok
    } catch (err) {
      console.error(err)
      toast.error(t('sources:toasts.folderRenameError'))
      return false
    }
  },

  deleteSourceDossier: async (sourceDossierId, mode) => {
    const projectId = get().project?.id
    if (!projectId) return false
    try {
      const ok = await window.api.v2_sourceDossiersDelete(projectId, sourceDossierId, mode)
      if (ok) {
        toast.success(
          mode === 'orphan-sources'
            ? t('sources:toasts.folderDeletedOrphan')
            : t('sources:toasts.folderDeletedAll')
        )
        await get().refresh()
      }
      return ok
    } catch (err) {
      console.error(err)
      toast.error(t('sources:toasts.folderDeleteError'))
      return false
    }
  },

  createDossier: async (name) => {
    const projectId = get().project?.id
    if (!projectId) return null
    try {
      const dossier = await window.api.v2_dossiersCreate(projectId, name)
      if (dossier) {
        set((s) => ({ dossiers: [...s.dossiers, dossier] }))
        toast.success(t('articles:toasts.folderCreated'))
      }
      return dossier
    } catch (err) {
      console.error(err)
      toast.error(t('articles:toasts.folderCreateError'))
      return null
    }
  },

  renameDossier: async (dossierId, name) => {
    const projectId = get().project?.id
    if (!projectId) return false
    try {
      const ok = await window.api.v2_dossiersRename(projectId, dossierId, name)
      if (ok) {
        set((s) => ({
          dossiers: s.dossiers.map((d) =>
            d.id === dossierId ? { ...d, name, modifiedAt: new Date().toISOString() } : d
          ),
        }))
        toast.success(t('articles:toasts.folderRenamed'))
      }
      return ok
    } catch (err) {
      console.error(err)
      toast.error(t('articles:toasts.folderRenameError'))
      return false
    }
  },

  deleteDossier: async (dossierId, mode) => {
    const projectId = get().project?.id
    if (!projectId) return false
    try {
      const ok = await window.api.v2_dossiersDelete(projectId, dossierId, mode)
      if (ok) {
        toast.success(
          mode === 'orphan-articles'
            ? t('articles:toasts.folderDeletedOrphan')
            : t('articles:toasts.folderDeletedAll')
        )
        await get().refresh()
      }
      return ok
    } catch (err) {
      console.error(err)
      toast.error(t('articles:toasts.folderDeleteError'))
      return false
    }
  },

  deleteArticle: async (articleId) => {
    const projectId = get().project?.id
    if (!projectId) return false
    try {
      const ok = await window.api.v2_articlesDelete(projectId, articleId)
      if (ok) {
        set((s) => ({ articles: s.articles.filter((a) => a.id !== articleId) }))
      }
      return ok
    } catch (err) {
      console.error(err)
      toast.error(t('articles:toasts.deleteError'))
      return false
    }
  },

  moveArticle: async (articleId, target) => {
    const projectId = get().project?.id
    if (!projectId) return false
    try {
      const ok = await window.api.v2_articlesMove(projectId, articleId, target)
      if (ok) await get().refresh()
      return ok
    } catch (err) {
      console.error(err)
      toast.error(t('articles:toasts.moveError'))
      return false
    }
  },

  moveArticlesBulk: async (articleIds, target) => {
    const projectId = get().project?.id
    if (!projectId) return false
    try {
      const ok = await window.api.v2_articlesMoveBulk(projectId, articleIds, target)
      if (ok) {
        toast.success(t('articles:toasts.moved', { count: articleIds.length }))
        await get().refresh()
      }
      return ok
    } catch (err) {
      console.error(err)
      toast.error(t('articles:toasts.moveError'))
      return false
    }
  },

  reorderArticles: async (dossierId, orderedIds) => {
    const projectId = get().project?.id
    if (!projectId) return false
    // Optimistic update: re-stamp local `order` so the UI reflects the new
    // sequence before the watcher round-trip lands. The backend writes the
    // same values so the eventual refresh is a no-op for these articles.
    const idIndex = new Map(orderedIds.map((id, i) => [id, i]))
    set((s) => ({
      articles: s.articles.map((a) =>
        a.dossierId === dossierId && idIndex.has(a.id)
          ? { ...a, order: idIndex.get(a.id)! }
          : a
      ),
    }))
    try {
      const ok = await window.api.v2_articlesReorder(projectId, dossierId, orderedIds)
      if (!ok) {
        toast.error(t('articles:toasts.reorderError'))
        await get().refresh()
      }
      return ok
    } catch (err) {
      console.error(err)
      toast.error(t('articles:toasts.reorderError'))
      await get().refresh()
      return false
    }
  },
}))

// Selectors
export const selectArticlesInDossier =
  (dossierId: string | null) => (s: ProjectState): ArticleMetadata[] =>
    s.articles.filter((a) => a.dossierId === dossierId)

export const selectArticlesBySource =
  (sourceId: string) => (s: ProjectState): ArticleMetadata[] =>
    s.articles.filter((a) => a.sourceId === sourceId)

export const selectArticlesByStatus =
  (status: ArticleMetadata['status']) => (s: ProjectState): ArticleMetadata[] =>
    s.articles.filter((a) => a.status === status)

export const selectOrphanArticles = (s: ProjectState): ArticleMetadata[] =>
  s.articles.filter((a) => a.dossierId === null)
