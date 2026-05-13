// In-memory state for the ExtractionV2 page: a working buffer of articles
// being drawn on a source PDF. Articles use a temporary integer id that lives
// only for the session — at "Generate" time, each article is persisted via
// v2_articlesCreate which mints a ULID and writes the article folder.
import { create } from 'zustand'
import { toast } from 'sonner'
import type { Zone } from '@shared/types'

// In-memory article shape (numeric id is a session-local handle).
export interface WorkingArticle {
  id: number
  zones: Zone[]
  fields: Record<string, string>
}

interface ExtractionState {
  articles: WorkingArticle[]
  savedArticles: WorkingArticle[] // baseline to detect unsaved changes
  currentArticleId: number | null
  selectedZoneIndex: number | null
  currentPage: number
  totalPages: number
  exporting: boolean
  error: string | null

  // Articles
  setArticles: (articles: WorkingArticle[]) => void
  addArticle: () => number
  removeArticle: (id: number) => void
  selectArticle: (id: number | null) => void
  updateArticle: (id: number, updates: Partial<WorkingArticle>) => void

  // Zones
  addZoneAsNewArticle: (zone: Zone) => void
  addZoneToArticle: (articleId: number, zone: Zone) => void
  updateZone: (zoneIndex: number, zone: Zone) => void
  updateZoneInArticle: (articleId: number, zoneIndex: number, zone: Zone) => void
  removeZone: (zoneIndex: number) => void
  removeZoneFromArticle: (articleId: number, zoneIndex: number) => void
  selectZone: (index: number | null) => void
  selectZoneInArticle: (articleId: number, zoneIndex: number) => void

  // Drag & Drop
  mergeArticles: (sourceId: number, targetId: number) => void
  moveZone: (fromArticleId: number, zoneIndex: number, toArticleId: number) => void
  reorderZones: (articleId: number, fromIndex: number, toIndex: number) => void

  // Navigation
  setCurrentPage: (page: number) => void
  setTotalPages: (total: number) => void
  goToPage: (page: number) => void

  // Persistence — create v2 articles from the working buffer
  generateV2Articles: (
    projectId: string,
    sourceId: string,
    dossierId: string | null
  ) => Promise<boolean>

  // State
  setExporting: (exporting: boolean) => void
  clearError: () => void
  reset: () => void
}

const initialState = {
  articles: [] as WorkingArticle[],
  savedArticles: [] as WorkingArticle[],
  currentArticleId: null as number | null,
  selectedZoneIndex: null as number | null,
  currentPage: 1,
  totalPages: 0,
  exporting: false,
  error: null as string | null,
}

export const useExtractionStore = create<ExtractionState>((set, get) => ({
  ...initialState,

  setArticles: (articles) => set({ articles }),

  addArticle: () => {
    const { articles } = get()
    const newId = articles.length > 0 ? Math.max(...articles.map((a) => a.id)) + 1 : 1
    const newArticle: WorkingArticle = { id: newId, zones: [], fields: {} }
    set((state) => ({
      articles: [...state.articles, newArticle],
      currentArticleId: newId,
      selectedZoneIndex: null,
    }))
    return newId
  },

  removeArticle: (id) => {
    set((state) => {
      const remaining = state.articles.filter((a) => a.id !== id)
      return {
        articles: remaining,
        currentArticleId:
          state.currentArticleId === id
            ? remaining.length > 0
              ? remaining[0].id
              : null
            : state.currentArticleId,
        selectedZoneIndex: state.currentArticleId === id ? null : state.selectedZoneIndex,
      }
    })
  },

  selectArticle: (id) => set({ currentArticleId: id, selectedZoneIndex: null }),

  updateArticle: (id, updates) => {
    set((state) => ({
      articles: state.articles.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    }))
  },

  addZoneAsNewArticle: (zone) => {
    const { articles } = get()
    const newId = articles.length > 0 ? Math.max(...articles.map((a) => a.id)) + 1 : 1
    const newArticle: WorkingArticle = { id: newId, zones: [zone], fields: {} }
    set((state) => ({
      articles: [...state.articles, newArticle],
      currentArticleId: null,
      selectedZoneIndex: null,
    }))
  },

  addZoneToArticle: (articleId, zone) => {
    set((state) => {
      const article = state.articles.find((a) => a.id === articleId)
      if (!article) return state
      const newZoneIndex = article.zones.length
      return {
        articles: state.articles.map((a) =>
          a.id === articleId ? { ...a, zones: [...a.zones, zone] } : a
        ),
        currentArticleId: articleId,
        selectedZoneIndex: newZoneIndex,
      }
    })
  },

  updateZone: (zoneIndex, zone) => {
    const { currentArticleId } = get()
    if (currentArticleId === null) return
    set((state) => ({
      articles: state.articles.map((a) =>
        a.id === currentArticleId
          ? { ...a, zones: a.zones.map((z, i) => (i === zoneIndex ? zone : z)) }
          : a
      ),
    }))
  },

  updateZoneInArticle: (articleId, zoneIndex, zone) => {
    set((state) => ({
      articles: state.articles.map((a) =>
        a.id === articleId
          ? { ...a, zones: a.zones.map((z, i) => (i === zoneIndex ? zone : z)) }
          : a
      ),
    }))
  },

  removeZone: (zoneIndex) => {
    const { currentArticleId, articles } = get()
    if (currentArticleId === null) return
    const article = articles.find((a) => a.id === currentArticleId)
    if (!article) return
    if (article.zones.length === 1) {
      set((state) => {
        const remaining = state.articles.filter((a) => a.id !== currentArticleId)
        return {
          articles: remaining,
          currentArticleId: remaining.length > 0 ? remaining[0].id : null,
          selectedZoneIndex: null,
        }
      })
    } else {
      set((state) => ({
        articles: state.articles.map((a) =>
          a.id === currentArticleId
            ? { ...a, zones: a.zones.filter((_, i) => i !== zoneIndex) }
            : a
        ),
        selectedZoneIndex: null,
      }))
    }
  },

  removeZoneFromArticle: (articleId, zoneIndex) => {
    const { articles } = get()
    const article = articles.find((a) => a.id === articleId)
    if (!article) return
    if (article.zones.length === 1) {
      set((state) => {
        const remaining = state.articles.filter((a) => a.id !== articleId)
        return {
          articles: remaining,
          currentArticleId:
            state.currentArticleId === articleId
              ? remaining.length > 0
                ? remaining[0].id
                : null
              : state.currentArticleId,
          selectedZoneIndex: null,
        }
      })
    } else {
      set((state) => ({
        articles: state.articles.map((a) =>
          a.id === articleId ? { ...a, zones: a.zones.filter((_, i) => i !== zoneIndex) } : a
        ),
        selectedZoneIndex: null,
      }))
    }
  },

  selectZone: (index) => set({ selectedZoneIndex: index }),

  selectZoneInArticle: (articleId, zoneIndex) =>
    set({ currentArticleId: articleId, selectedZoneIndex: zoneIndex }),

  mergeArticles: (sourceId, targetId) => {
    if (sourceId === targetId) return
    const { articles } = get()
    const sourceArticle = articles.find((a) => a.id === sourceId)
    const targetArticle = articles.find((a) => a.id === targetId)
    if (!sourceArticle || !targetArticle) return
    set((state) => ({
      articles: state.articles
        .map((a) =>
          a.id === targetId ? { ...a, zones: [...a.zones, ...sourceArticle.zones] } : a
        )
        .filter((a) => a.id !== sourceId),
      currentArticleId: targetId,
      selectedZoneIndex: null,
    }))
  },

  moveZone: (fromArticleId, zoneIndex, toArticleId) => {
    if (fromArticleId === toArticleId) return
    const { articles } = get()
    const fromArticle = articles.find((a) => a.id === fromArticleId)
    const toArticle = articles.find((a) => a.id === toArticleId)
    if (!fromArticle || !toArticle) return
    if (zoneIndex < 0 || zoneIndex >= fromArticle.zones.length) return
    const zoneToMove = fromArticle.zones[zoneIndex]
    set((state) => {
      const newArticles = state.articles
        .map((a) => {
          if (a.id === fromArticleId) {
            return { ...a, zones: a.zones.filter((_, i) => i !== zoneIndex) }
          }
          if (a.id === toArticleId) {
            return { ...a, zones: [...a.zones, zoneToMove] }
          }
          return a
        })
        .filter((a) => a.zones.length > 0)
      return {
        articles: newArticles,
        currentArticleId: toArticleId,
        selectedZoneIndex: null,
      }
    })
  },

  reorderZones: (articleId, fromIndex, toIndex) => {
    if (fromIndex === toIndex) return
    set((state) => ({
      articles: state.articles.map((a) => {
        if (a.id !== articleId) return a
        const newZones = [...a.zones]
        const [movedZone] = newZones.splice(fromIndex, 1)
        newZones.splice(toIndex, 0, movedZone)
        return { ...a, zones: newZones }
      }),
    }))
  },

  setCurrentPage: (page) => set({ currentPage: page, selectedZoneIndex: null }),
  setTotalPages: (total) => set({ totalPages: total }),

  goToPage: (page) => {
    const { totalPages } = get()
    if (page >= 1 && page <= totalPages) {
      set({ currentPage: page, selectedZoneIndex: null })
    }
  },

  generateV2Articles: async (projectId, sourceId, dossierId) => {
    const { articles } = get()
    if (articles.length === 0) return false
    set({ exporting: true, error: null })
    try {
      for (const article of articles) {
        const pages = Array.from(new Set(article.zones.map((z) => z.page))).sort(
          (a, b) => a - b
        )
        await window.api.v2_articlesCreate(projectId, {
          sourceId,
          dossierId,
          zones: article.zones,
          pages,
        })
      }
      const empty: WorkingArticle[] = []
      set({
        articles: empty,
        savedArticles: empty,
        exporting: false,
        currentArticleId: null,
        selectedZoneIndex: null,
      })
      toast.success(`${articles.length} article(s) générés`)
      return true
    } catch (err) {
      console.error(err)
      toast.error('Erreur lors de la génération des articles')
      set({ error: 'Erreur lors de la génération', exporting: false })
      return false
    }
  },

  setExporting: (exporting) => set({ exporting }),
  clearError: () => set({ error: null }),
  reset: () => set(initialState),
}))

// Selectors
export const selectCurrentArticle = (state: ExtractionState): WorkingArticle | null =>
  state.articles.find((a) => a.id === state.currentArticleId) ?? null

export const selectCurrentZones = (state: ExtractionState): Zone[] =>
  selectCurrentArticle(state)?.zones ?? []

export const selectTotalZonesCount = (state: ExtractionState): number =>
  state.articles.reduce((acc, a) => acc + a.zones.length, 0)

export const selectHasUnsavedChanges = (state: ExtractionState): boolean =>
  JSON.stringify(state.articles) !== JSON.stringify(state.savedArticles)
