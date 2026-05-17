// In-memory state for the ExtractionV2 page: a working buffer of articles
// being drawn on a source PDF. Articles use a temporary integer id that lives
// only for the session.
//
// New articles (no persistedId): created on disk at Save time with
// skipExtractGeneration=true (status='draft', no extract.pdf). Generate later
// runs the PDF extraction and bumps to 'ready'.
//
// Persisted articles (persistedId set): hydrated from disk on mount. Edits
// flow through v2_articlesUpdate on Save; if zones changed, status resets
// to 'draft' so Generate regenerates the PDF.
import { create } from 'zustand'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import type { ArticleStatus, Template, TemplateField, Zone } from '@shared/types'
import { sameSchema } from '@/lib/templateMerge'

const t = (key: string, opts?: Record<string, unknown>): string =>
  i18n.t(key, opts ?? {}) as string

export interface WorkingArticle {
  id: number
  zones: Zone[]
  fields: Record<string, string>
  schema: TemplateField[]
  aiContext?: string
  templateId?: string
  // Disk-persistence markers (set when hydrated from an existing v2 article,
  // or after a successful Save of a new article).
  persistedId?: string
  persistedStatus?: ArticleStatus
  persistedDossierId?: string | null
}

// Destination intent passed to generateArticles. The dossier (if any) is
// created lazily by the store — only if at least one orphan-new article
// actually needs a home there. Prevents the "empty dossier" leak when
// nothing ends up being moved.
export type GenerateTarget =
  | { kind: 'no-dossier' }
  | { kind: 'new-dossier'; name: string }
  | { kind: 'existing-dossier'; dossierId: string }

interface ExtractionState {
  articles: WorkingArticle[]
  savedArticles: WorkingArticle[] // baseline to detect unsaved changes
  currentArticleId: number | null
  selectedZoneIndex: number | null
  currentPage: number
  totalPages: number
  exporting: boolean
  error: string | null

  // Session bindings (set by the page on mount, cleared on unmount).
  sessionProjectId: string | null
  sessionSourceId: string | null

  // Default model applied to every NEW WorkingArticle (drawn from scratch
  // this session). Persisted articles keep whatever schema they had on disk.
  defaultTemplateId?: string
  defaultSchema: TemplateField[]
  defaultAiContext?: string

  // Defaults
  setDefaultTemplate: (templateId: string, schema: TemplateField[], aiContext?: string) => void

  // Articles
  setArticles: (articles: WorkingArticle[]) => void
  addArticle: () => number
  removeArticle: (id: number) => void
  selectArticle: (id: number | null) => void
  updateArticle: (id: number, updates: Partial<WorkingArticle>) => void
  // Unlock = wipe fields + reset status to 'draft'. Used when the user
  // confirms they want to modify zones of a persisted ready element (zone
  // change invalidates the PDF, so fields might be stale too).
  unlockArticle: (id: number) => void

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

  // Lifecycle
  hydrateFromSource: (
    projectId: string,
    sourceId: string,
    templates: Template[]
  ) => Promise<void>

  // Persistence
  // saveArticles: persist the in-memory buffer without generating PDFs.
  //   New articles → created in orphans/ with status='draft'.
  //   Persisted articles → updated; if zones changed, status reset to 'draft'.
  saveArticles: () => Promise<boolean>
  // generateArticles: save first, then for every 'draft' article, optionally
  // move orphans to a chosen dossier and run extract PDF generation.
  // Takes an intent (not a dossierId), so the dossier is created lazily
  // — only if at least one orphan article needs a home.
  generateArticles: (target: GenerateTarget) => Promise<boolean>

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
  sessionProjectId: null as string | null,
  sessionSourceId: null as string | null,
  defaultTemplateId: undefined as string | undefined,
  defaultSchema: [] as TemplateField[],
  defaultAiContext: undefined as string | undefined,
}

const pagesFromZones = (zones: Zone[]): number[] =>
  Array.from(new Set(zones.map((z) => z.page))).sort((a, b) => a - b)

const deepClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

export const useExtractionStore = create<ExtractionState>((set, get) => ({
  ...initialState,

  setDefaultTemplate: (templateId, schema, aiContext) =>
    set({ defaultTemplateId: templateId, defaultSchema: schema, defaultAiContext: aiContext }),

  setArticles: (articles) => set({ articles }),

  addArticle: () => {
    const { articles, defaultTemplateId, defaultSchema, defaultAiContext } = get()
    const newId = articles.length > 0 ? Math.max(...articles.map((a) => a.id)) + 1 : 1
    const newArticle: WorkingArticle = {
      id: newId,
      zones: [],
      fields: {},
      schema: defaultSchema,
      aiContext: defaultAiContext,
      templateId: defaultTemplateId,
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
        // Removing the current article: clear selection (don't auto-pick
        // another — annoying UX, makes drawing-then-deleting a zone hop
        // to an unrelated element).
        currentArticleId: state.currentArticleId === id ? null : state.currentArticleId,
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

  unlockArticle: (id) => {
    set((state) => ({
      articles: state.articles.map((a) =>
        a.id === id ? { ...a, fields: {}, persistedStatus: 'draft' as const } : a
      ),
    }))
  },

  addZoneAsNewArticle: (zone) => {
    const { articles, defaultTemplateId, defaultSchema, defaultAiContext } = get()
    const newId = articles.length > 0 ? Math.max(...articles.map((a) => a.id)) + 1 : 1
    const newArticle: WorkingArticle = {
      id: newId,
      zones: [zone],
      fields: {},
      schema: defaultSchema,
      aiContext: defaultAiContext,
      templateId: defaultTemplateId,
    }
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
      set((state) => ({
        articles: state.articles.filter((a) => a.id !== currentArticleId),
        currentArticleId: null,
        selectedZoneIndex: null,
      }))
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
      set((state) => ({
        articles: state.articles.filter((a) => a.id !== articleId),
        // Clear selection if the just-removed article was the active one;
        // never auto-hop to another element.
        currentArticleId:
          state.currentArticleId === articleId ? null : state.currentArticleId,
        selectedZoneIndex: null,
      }))
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

  hydrateFromSource: async (projectId, sourceId, templates) => {
    set({ sessionProjectId: projectId, sessionSourceId: sourceId, error: null })
    try {
      // includeDrafts: extraction is the one context where status='draft'
      // articles SHOULD be visible (they're the in-progress saved work).
      const existing = await window.api.v2_articlesList(projectId, { sourceId, includeDrafts: true })
      let counter = 0
      const hydrated: WorkingArticle[] = existing.map((am) => {
        const matched = templates.find((t) => sameSchema(t.fields, am.schema ?? []))
        return {
          id: ++counter,
          zones: am.zones,
          fields: am.fields ?? {},
          schema: am.schema ?? [],
          aiContext: am.aiContext,
          templateId: matched?.id,
          persistedId: am.id,
          persistedStatus: am.status,
          persistedDossierId: am.dossierId,
        }
      })
      set({
        articles: hydrated,
        savedArticles: deepClone(hydrated),
        currentArticleId: null,
        selectedZoneIndex: null,
        // Reset to page 1 — currentPage is shared across the store and
        // would otherwise leak from the previously-open source.
        currentPage: 1,
      })
    } catch (err) {
      console.error(err)
      set({ error: 'Erreur lors du chargement des éléments existants' })
    }
  },

  saveArticles: async () => {
    const { sessionProjectId, sessionSourceId, articles, savedArticles } = get()
    if (!sessionProjectId || !sessionSourceId) {
      toast.error(t('extractor:toasts.sessionUnbound'))
      return false
    }
    if (articles.length === 0 && savedArticles.length === 0) return true

    set({ error: null })
    const baselineById = new Map(savedArticles.map((a) => [a.id, a]))
    const updated: WorkingArticle[] = []

    try {
      for (const article of articles) {
        if (!article.persistedId) {
          // New: create on disk without generating PDF.
          const created = await window.api.v2_articlesCreate(sessionProjectId, {
            sourceId: sessionSourceId,
            dossierId: null,
            zones: article.zones,
            pages: pagesFromZones(article.zones),
            fields: article.fields,
            schema: article.schema,
            aiContext: article.aiContext,
            skipExtractGeneration: true,
          })
          if (created) {
            updated.push({
              ...article,
              persistedId: created.id,
              persistedStatus: created.status,
              persistedDossierId: created.dossierId,
            })
          } else {
            updated.push(article)
          }
          continue
        }

        // Persisted: compare to baseline. Skip if unchanged.
        const baseline = baselineById.get(article.id)
        const same = baseline && JSON.stringify(article) === JSON.stringify(baseline)
        if (same) {
          updated.push(article)
          continue
        }

        const zonesChanged =
          JSON.stringify(article.zones) !== JSON.stringify(baseline?.zones ?? [])
        const newStatus: ArticleStatus = zonesChanged
          ? 'draft'
          : article.persistedStatus ?? 'ready'

        const ok = await window.api.v2_articlesUpdate(sessionProjectId, article.persistedId, {
          zones: article.zones,
          pages: pagesFromZones(article.zones),
          fields: article.fields,
          schema: article.schema,
          aiContext: article.aiContext,
          status: newStatus,
        })
        updated.push(ok ? { ...article, persistedStatus: newStatus } : article)
      }

      set({ articles: updated, savedArticles: deepClone(updated) })
      toast.success(t('extractor:toasts.saved'))
      return true
    } catch (err) {
      console.error(err)
      toast.error(t('extractor:toasts.saveError'))
      set({ error: 'Erreur lors de la sauvegarde' })
      return false
    }
  },

  generateArticles: async (target) => {
    const saved = await get().saveArticles()
    if (!saved) return false
    const { sessionProjectId, articles } = get()
    if (!sessionProjectId) return false

    // Determine if any orphan-new article actually needs a dossier. The
    // dossier is created lazily — only when at least one article is going
    // to land in it. Avoids leaking an empty dossier on disk if generation
    // somehow has nothing to place.
    const orphansToMove = articles.filter(
      (a) => a.persistedId && a.persistedStatus === 'draft' && a.persistedDossierId === null
    )
    let dossierIdForOrphans: string | null = null
    if (orphansToMove.length > 0) {
      if (target.kind === 'new-dossier') {
        const dossier = await window.api.v2_dossiersCreate(sessionProjectId, target.name)
        if (!dossier) {
          toast.error(t('extractor:toasts.folderCreateError'))
          return false
        }
        dossierIdForOrphans = dossier.id
      } else if (target.kind === 'existing-dossier') {
        dossierIdForOrphans = target.dossierId
      }
    }

    set({ exporting: true, error: null })
    try {
      const next: WorkingArticle[] = []
      for (const article of articles) {
        if (!article.persistedId || article.persistedStatus !== 'draft') {
          next.push(article)
          continue
        }
        // Move orphan → dossier if a destination was determined above.
        let dossierId = article.persistedDossierId
        if (article.persistedDossierId === null && dossierIdForOrphans !== null) {
          const moved = await window.api.v2_articlesMove(sessionProjectId, article.persistedId, {
            dossierId: dossierIdForOrphans,
          })
          if (moved) dossierId = dossierIdForOrphans
        }
        const regen = await window.api.v2_articlesRegenerateExtract(sessionProjectId, article.persistedId)
        next.push({
          ...article,
          persistedStatus: regen ? 'ready' : article.persistedStatus,
          persistedDossierId: dossierId,
        })
      }
      set({ articles: next, savedArticles: deepClone(next), exporting: false })
      const generatedCount = next.filter((a) => a.persistedStatus === 'ready').length -
        articles.filter((a) => a.persistedStatus === 'ready').length
      if (generatedCount > 0) {
        toast.success(t('extractor:toasts.generated', { count: generatedCount }))
      }
      return true
    } catch (err) {
      console.error(err)
      toast.error(t('extractor:toasts.generateError'))
      set({ exporting: false, error: 'Erreur lors de la génération' })
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

// An element is "locked" as soon as it has been generated on disk
// (status='ready'). Modifying its zones would invalidate the extract.pdf
// and silently demote it to draft (hidden from project views) — confusing
// for the user. The lock forces an explicit confirmation.
//
// Draft-persisted elements (status='draft': saved during extraction with
// no PDF yet) are NOT locked — they can be edited freely.
export const isArticleLocked = (a: WorkingArticle): boolean =>
  !!a.persistedId && a.persistedStatus === 'ready'
