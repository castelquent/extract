// Editor store. Holds the list of articles being edited (scoped to a project,
// optionally further filtered by dossier/source/status), the currently
// selected article, and a draft buffer for unsaved changes per article.
import { create } from 'zustand'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import type {
  AISettings,
  ArticleMetadata,
  ArticleScope,
  TemplateField,
  TranscriptionResult,
} from '@shared/types'

const t = (key: string, opts?: Record<string, unknown>): string =>
  i18n.t(key, opts ?? {}) as string

interface EditorState {
  projectId: string | null
  scope: ArticleScope | null
  articles: ArticleMetadata[]
  currentArticleId: string | null
  loading: boolean
  // Per-article field drafts (unsaved buffer). Articles not in this map have
  // no pending changes.
  drafts: Record<string, Record<string, string>>
  error: string | null

  // Lifecycle
  loadScope: (projectId: string, scope?: ArticleScope) => Promise<void>
  setCurrent: (articleId: string | null) => void
  reset: () => void

  // Mutations
  updateField: (articleId: string, fieldName: string, value: string) => void
  saveArticle: (articleId: string) => Promise<boolean>
  saveAll: () => Promise<boolean>
  deleteArticle: (articleId: string) => Promise<boolean>
  transcribeArticle: (
    articleId: string,
    settings: AISettings
  ) => Promise<TranscriptionResult>
  applyTemplate: (
    articleId: string,
    newSchema: TemplateField[],
    newFields: Record<string, string>,
    newAiContext: string | undefined
  ) => Promise<boolean>
}

const initialState = {
  projectId: null as string | null,
  scope: null as ArticleScope | null,
  articles: [] as ArticleMetadata[],
  currentArticleId: null as string | null,
  loading: false,
  drafts: {} as Record<string, Record<string, string>>,
  error: null as string | null,
}

export const useEditorStore = create<EditorState>((set, get) => ({
  ...initialState,

  loadScope: async (projectId, scope) => {
    set({ loading: true, error: null, projectId, scope: scope ?? null })
    try {
      const articles = await window.api.v2_articlesList(projectId, scope)
      set({
        articles,
        currentArticleId: articles[0]?.id ?? null,
        drafts: {},
        loading: false,
      })
    } catch (err) {
      console.error(err)
      toast.error(t('editor:toasts.loadError'))
      set({ loading: false, error: t('editor:toasts.loadError') })
    }
  },

  setCurrent: (articleId) => set({ currentArticleId: articleId }),

  reset: () => set(initialState),

  updateField: (articleId, fieldName, value) => {
    set((s) => {
      const article = s.articles.find((a) => a.id === articleId)
      if (!article) return s
      const existingDraft = s.drafts[articleId] ?? article.fields
      const newDraft = { ...existingDraft, [fieldName]: value }
      return { drafts: { ...s.drafts, [articleId]: newDraft } }
    })
  },

  saveArticle: async (articleId) => {
    const { projectId, drafts } = get()
    if (!projectId) return false
    const draft = drafts[articleId]
    if (!draft) return true // nothing to save

    try {
      const ok = await window.api.v2_articlesUpdate(projectId, articleId, { fields: draft })
      if (ok) {
        set((s) => {
          const { [articleId]: _, ...rest } = s.drafts
          return {
            drafts: rest,
            articles: s.articles.map((a) =>
              a.id === articleId
                ? { ...a, fields: draft, modifiedAt: new Date().toISOString() }
                : a
            ),
          }
        })
      }
      return ok
    } catch (err) {
      console.error(err)
      toast.error(t('editor:toasts.saveError'))
      return false
    }
  },

  saveAll: async () => {
    const ids = Object.keys(get().drafts)
    if (ids.length === 0) return true
    let allOk = true
    for (const id of ids) {
      const ok = await get().saveArticle(id)
      if (!ok) allOk = false
    }
    if (allOk) toast.success(t('editor:toasts.saved', { count: ids.length }))
    return allOk
  },

  deleteArticle: async (articleId) => {
    const projectId = get().projectId
    if (!projectId) return false
    try {
      const ok = await window.api.v2_articlesDelete(projectId, articleId)
      if (ok) {
        set((s) => {
          const remaining = s.articles.filter((a) => a.id !== articleId)
          const { [articleId]: _, ...drafts } = s.drafts
          const newCurrent =
            s.currentArticleId === articleId ? remaining[0]?.id ?? null : s.currentArticleId
          return { articles: remaining, drafts, currentArticleId: newCurrent }
        })
        toast.success(t('editor:toasts.deleted'))
      }
      return ok
    } catch (err) {
      console.error(err)
      toast.error(t('editor:toasts.deleteError'))
      return false
    }
  },

  transcribeArticle: async (articleId, settings) => {
    const projectId = get().projectId
    if (!projectId) {
      return { success: false, error: 'Aucun projet chargé' }
    }
    try {
      const result = await window.api.v2_transcribe(projectId, articleId, settings)
      if (result.success && result.data?.fields) {
        const fields = result.data.fields
        set((s) => ({
          articles: s.articles.map((a) =>
            a.id === articleId
              ? {
                  ...a,
                  fields: { ...a.fields, ...fields },
                  modifiedAt: new Date().toISOString(),
                }
              : a
          ),
          // Drop any stale draft for this article — server has the truth now.
          drafts: Object.fromEntries(Object.entries(s.drafts).filter(([k]) => k !== articleId)),
        }))
      }
      return result
    } catch (err: any) {
      console.error(err)
      return { success: false, error: err?.message ?? 'Erreur lors de la transcription' }
    }
  },

  applyTemplate: async (articleId, newSchema, newFields, newAiContext) => {
    const projectId = get().projectId
    if (!projectId) return false
    try {
      const ok = await window.api.v2_articlesUpdate(projectId, articleId, {
        schema: newSchema,
        aiContext: newAiContext,
        fields: newFields,
      })
      if (!ok) return false
      set((s) => ({
        articles: s.articles.map((a) =>
          a.id === articleId
            ? {
                ...a,
                schema: newSchema,
                aiContext: newAiContext,
                fields: newFields,
                modifiedAt: new Date().toISOString(),
              }
            : a
        ),
        // Replace any pending draft with the merged fields so the form
        // reflects the new state cleanly.
        drafts: { ...s.drafts, [articleId]: newFields },
      }))
      // After applyTemplate, the draft equals the persisted fields — nothing
      // to save. Clear the draft to mark "clean".
      set((s) => {
        const { [articleId]: _, ...rest } = s.drafts
        return { drafts: rest }
      })
      toast.success(t('editor:toasts.templateApplied'))
      return true
    } catch (err) {
      console.error(err)
      toast.error(t('editor:toasts.templateApplyError'))
      return false
    }
  },
}))

// Selectors
export const selectCurrentArticle = (s: EditorState): ArticleMetadata | null =>
  s.articles.find((a) => a.id === s.currentArticleId) ?? null

export const selectCurrentFields = (s: EditorState): Record<string, string> => {
  if (!s.currentArticleId) return {}
  const draft = s.drafts[s.currentArticleId]
  if (draft) return draft
  return s.articles.find((a) => a.id === s.currentArticleId)?.fields ?? {}
}

export const selectHasUnsavedChanges = (s: EditorState): boolean =>
  Object.keys(s.drafts).length > 0

export const selectArticleHasDraft = (articleId: string) => (s: EditorState): boolean =>
  s.drafts[articleId] !== undefined
