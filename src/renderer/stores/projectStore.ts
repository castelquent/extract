// Per-project store. Loads the detailed view of one project: its metadata,
// sources, dossiers, and (optionally) the full article list inside the project.
import { create } from 'zustand'
import { toast } from 'sonner'
import type {
  ArticleMetadata,
  ArticleMoveTarget,
  DossierDeleteMode,
  DossierView,
  ProjectView,
  SourceView,
} from '@shared/types'

interface ProjectState {
  project: ProjectView | null
  sources: SourceView[]
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

  // Dossiers
  createDossier: (name: string) => Promise<DossierView | null>
  renameDossier: (dossierId: string, name: string) => Promise<boolean>
  deleteDossier: (dossierId: string, mode: DossierDeleteMode) => Promise<boolean>

  // Articles
  deleteArticle: (articleId: string) => Promise<boolean>
  moveArticle: (articleId: string, target: ArticleMoveTarget) => Promise<boolean>
  moveArticlesBulk: (articleIds: string[], target: ArticleMoveTarget) => Promise<boolean>
}

const initialState = {
  project: null as ProjectView | null,
  sources: [] as SourceView[],
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
      const [project, sources, dossiers, articles] = await Promise.all([
        window.api.v2_projectsGet(projectId),
        window.api.v2_sourcesList(projectId),
        window.api.v2_dossiersList(projectId),
        window.api.v2_articlesList(projectId),
      ])
      set({ project, sources, dossiers, articles, loading: false })
    } catch (err) {
      console.error(err)
      toast.error('Erreur lors du chargement du projet')
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
        toast.success(
          created.length === 1
            ? '1 source importée'
            : `${created.length} sources importées`
        )
        await get().refresh()
      }
      return created
    } catch (err) {
      console.error(err)
      toast.error("Erreur lors de l'import")
      return []
    }
  },

  deleteSource: async (sourceId, force) => {
    const projectId = get().project?.id
    if (!projectId) return false
    try {
      const result = await window.api.v2_sourcesDelete(projectId, sourceId, force)
      if (result.ok) {
        toast.success('Source supprimée')
        await get().refresh()
        return true
      } else if (result.reason === 'has-articles') {
        toast.error(
          `Cette source est utilisée par ${result.articlesCount} article(s). Supprimez-les d'abord.`
        )
      }
      return false
    } catch (err) {
      console.error(err)
      toast.error('Erreur lors de la suppression')
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
        toast.success('Dossier créé')
      }
      return dossier
    } catch (err) {
      console.error(err)
      toast.error('Erreur lors de la création du dossier')
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
        toast.success('Dossier renommé')
      }
      return ok
    } catch (err) {
      console.error(err)
      toast.error('Erreur lors du renommage')
      return false
    }
  },

  deleteDossier: async (dossierId, mode) => {
    const projectId = get().project?.id
    if (!projectId) return false
    try {
      const ok = await window.api.v2_dossiersDelete(projectId, dossierId, mode)
      if (ok) {
        toast.success(mode === 'orphan-articles' ? 'Dossier supprimé, articles rendus orphelins' : 'Dossier et articles supprimés')
        await get().refresh()
      }
      return ok
    } catch (err) {
      console.error(err)
      toast.error('Erreur lors de la suppression du dossier')
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
      toast.error("Erreur lors de la suppression de l'article")
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
      toast.error('Erreur lors du déplacement')
      return false
    }
  },

  moveArticlesBulk: async (articleIds, target) => {
    const projectId = get().project?.id
    if (!projectId) return false
    try {
      const ok = await window.api.v2_articlesMoveBulk(projectId, articleIds, target)
      if (ok) {
        toast.success(`${articleIds.length} article(s) déplacé(s)`)
        await get().refresh()
      }
      return ok
    } catch (err) {
      console.error(err)
      toast.error('Erreur lors du déplacement')
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
