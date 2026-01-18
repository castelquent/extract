import { create } from 'zustand'
import { toast } from 'sonner'
import type { Article, Zone } from '@shared/types'

interface ExtractionState {
  articles: Article[]
  savedArticles: Article[] // Pour détecter les changements non sauvegardés
  currentArticleId: number | null
  selectedZoneIndex: number | null
  currentPage: number
  totalPages: number
  loading: boolean
  exporting: boolean
  error: string | null

  // Actions - Articles
  setArticles: (articles: Article[]) => void
  addArticle: () => number
  removeArticle: (id: number) => void
  selectArticle: (id: number | null) => void
  updateArticle: (id: number, updates: Partial<Article>) => void

  // Actions - Zones
  addZoneAsNewArticle: (zone: Zone) => void
  updateZone: (zoneIndex: number, zone: Zone) => void
  updateZoneInArticle: (articleId: number, zoneIndex: number, zone: Zone) => void
  removeZone: (zoneIndex: number) => void
  removeZoneFromArticle: (articleId: number, zoneIndex: number) => void
  selectZone: (index: number | null) => void
  selectZoneInArticle: (articleId: number, zoneIndex: number) => void

  // Actions - Drag & Drop
  mergeArticles: (sourceId: number, targetId: number) => void
  moveZone: (fromArticleId: number, zoneIndex: number, toArticleId: number) => void
  reorderZones: (articleId: number, fromIndex: number, toIndex: number) => void

  // Actions - Navigation
  setCurrentPage: (page: number) => void
  setTotalPages: (total: number) => void
  goToPage: (page: number) => void

  // Actions - Persistence
  loadExtraction: (projectId: string) => Promise<void>
  saveExtraction: (projectId: string) => Promise<boolean>
  exportImages: (projectId: string) => Promise<boolean>

  // Actions - State
  setExporting: (exporting: boolean) => void
  clearError: () => void
  reset: () => void
}

const initialState = {
  articles: [] as Article[],
  savedArticles: [] as Article[],
  currentArticleId: null,
  selectedZoneIndex: null,
  currentPage: 1,
  totalPages: 0,
  loading: false,
  exporting: false,
  error: null,
}

export const useExtractionStore = create<ExtractionState>((set, get) => ({
  ...initialState,

  // Articles
  setArticles: (articles) => set({ articles }),

  addArticle: () => {
    const { articles } = get()
    const newId = articles.length > 0 ? Math.max(...articles.map((a) => a.id)) + 1 : 1
    const newArticle: Article = {
      id: newId,
      zones: [],
      fields: {},
    }
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

  // Zones
  addZoneAsNewArticle: (zone) => {
    const { articles } = get()
    const newId = articles.length > 0 ? Math.max(...articles.map((a) => a.id)) + 1 : 1
    const newArticle: Article = {
      id: newId,
      zones: [zone],
      fields: {},
    }
    set((state) => ({
      articles: [...state.articles, newArticle],
      currentArticleId: newId,
      selectedZoneIndex: 0,
    }))
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

    // If this is the last zone, remove the article entirely
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

    // If this is the last zone, remove the article entirely
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

  selectZoneInArticle: (articleId, zoneIndex) => set({
    currentArticleId: articleId,
    selectedZoneIndex: zoneIndex,
  }),

  // Drag & Drop
  mergeArticles: (sourceId, targetId) => {
    if (sourceId === targetId) return

    const { articles } = get()
    const sourceArticle = articles.find((a) => a.id === sourceId)
    const targetArticle = articles.find((a) => a.id === targetId)

    if (!sourceArticle || !targetArticle) return

    set((state) => ({
      articles: state.articles
        .map((a) =>
          a.id === targetId
            ? { ...a, zones: [...a.zones, ...sourceArticle.zones] }
            : a
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
      let newArticles = state.articles
        .map((a) => {
          if (a.id === fromArticleId) {
            return { ...a, zones: a.zones.filter((_, i) => i !== zoneIndex) }
          }
          if (a.id === toArticleId) {
            return { ...a, zones: [...a.zones, zoneToMove] }
          }
          return a
        })
        // Remove articles with no zones
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

  // Navigation
  setCurrentPage: (page) => set({ currentPage: page, selectedZoneIndex: null }),
  setTotalPages: (total) => set({ totalPages: total }),

  goToPage: (page) => {
    const { totalPages } = get()
    if (page >= 1 && page <= totalPages) {
      set({ currentPage: page, selectedZoneIndex: null })
    }
  },

  // Persistence
  loadExtraction: async (projectId) => {
    set({ loading: true, error: null })
    try {
      const data = await window.api.loadExtraction(projectId)
      if (data?.articles) {
        // Deep copy pour savedArticles afin de détecter les changements
        const articlesCopy = JSON.parse(JSON.stringify(data.articles))
        set({
          articles: data.articles,
          savedArticles: articlesCopy,
          currentArticleId: data.articles.length > 0 ? data.articles[0].id : null,
          loading: false,
        })
      } else {
        set({ loading: false, savedArticles: [] })
      }
    } catch (err) {
      toast.error("Erreur lors du chargement de l'extraction")
      set({ error: "Erreur lors du chargement de l'extraction", loading: false })
    }
  },

  saveExtraction: async (projectId) => {
    const { articles } = get()
    if (articles.length === 0) {
      set({ savedArticles: [] })
      return true
    }

    try {
      const success = await window.api.saveExtraction(projectId, { articles })
      if (success) {
        // Mettre à jour savedArticles pour refléter l'état sauvegardé
        const articlesCopy = JSON.parse(JSON.stringify(articles))
        set({ savedArticles: articlesCopy })
        toast.success('Extraction sauvegardée')
      }
      return success
    } catch (err) {
      toast.error("Erreur lors de la sauvegarde de l'extraction")
      set({ error: "Erreur lors de la sauvegarde de l'extraction" })
      return false
    }
  },

  exportImages: async (projectId) => {
    const { articles } = get()
    if (articles.length === 0) return false

    set({ exporting: true, error: null })
    try {
      const updatedArticles = await window.api.exportImages(projectId, articles)
      if (updatedArticles) {
        // Mettre à jour directement avec les articles retournés (avec imagePath)
        const articlesCopy = JSON.parse(JSON.stringify(updatedArticles))
        set({ articles: updatedArticles, savedArticles: articlesCopy })
        toast.success('Images exportées')
      }
      set({ exporting: false })
      return !!updatedArticles
    } catch (err) {
      toast.error("Erreur lors de l'export des images")
      set({ error: "Erreur lors de l'export des images", exporting: false })
      return false
    }
  },

  // State
  setExporting: (exporting) => set({ exporting }),
  clearError: () => set({ error: null }),
  reset: () => set(initialState),
}))

// Selectors
export const selectCurrentArticle = (state: ExtractionState) =>
  state.articles.find((a) => a.id === state.currentArticleId) || null

export const selectCurrentZones = (state: ExtractionState) =>
  selectCurrentArticle(state)?.zones || []

export const selectTotalZonesCount = (state: ExtractionState) =>
  state.articles.reduce((acc, a) => acc + a.zones.length, 0)

export const selectHasUnsavedChanges = (state: ExtractionState) =>
  JSON.stringify(state.articles) !== JSON.stringify(state.savedArticles)
