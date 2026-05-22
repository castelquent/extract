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
  // Per-article content (markdown) drafts. Tracked separately from `drafts`
  // because content lives in its own file (content.md) and changes
  // independently.
  contentDrafts: Record<string, string>
  error: string | null

  // Lifecycle
  loadScope: (projectId: string, scope?: ArticleScope) => Promise<void>
  setCurrent: (articleId: string | null) => void
  reset: () => void

  // Mutations
  updateField: (articleId: string, fieldName: string, value: string) => void
  updateContent: (articleId: string, value: string) => void
  saveArticle: (articleId: string) => Promise<boolean>
  saveAll: () => Promise<boolean>
  deleteArticle: (articleId: string) => Promise<boolean>
  transcribeArticle: (
    articleId: string,
    settings: AISettings
  ) => Promise<TranscriptionResult>
  reextractField: (
    articleId: string,
    fieldName: string,
    settings: AISettings
  ) => Promise<{ success: boolean; value?: string; error?: string }>
  applyTemplate: (
    articleId: string,
    newSchema: TemplateField[],
    newFields: Record<string, string>,
    newAiContext: string | undefined,
    newTemplateId: string | undefined
  ) => Promise<boolean>
}

const initialState = {
  projectId: null as string | null,
  scope: null as ArticleScope | null,
  articles: [] as ArticleMetadata[],
  currentArticleId: null as string | null,
  loading: false,
  drafts: {} as Record<string, Record<string, string>>,
  contentDrafts: {} as Record<string, string>,
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
        contentDrafts: {},
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

  updateContent: (articleId, value) => {
    set((s) => {
      const article = s.articles.find((a) => a.id === articleId)
      if (!article) return s
      return { contentDrafts: { ...s.contentDrafts, [articleId]: value } }
    })
  },

  saveArticle: async (articleId) => {
    const { projectId, drafts, contentDrafts } = get()
    if (!projectId) return false
    const draft = drafts[articleId]
    const contentDraft = contentDrafts[articleId]
    if (!draft && contentDraft === undefined) return true // nothing to save

    try {
      const patch: { fields?: Record<string, string>; content?: string } = {}
      if (draft) patch.fields = draft
      if (contentDraft !== undefined) patch.content = contentDraft
      const ok = await window.api.v2_articlesUpdate(projectId, articleId, patch)
      if (ok) {
        set((s) => {
          const { [articleId]: _droppedFields, ...remainingDrafts } = s.drafts
          const { [articleId]: _droppedContent, ...remainingContentDrafts } = s.contentDrafts
          return {
            drafts: remainingDrafts,
            contentDrafts: remainingContentDrafts,
            articles: s.articles.map((a) =>
              a.id === articleId
                ? {
                    ...a,
                    fields: draft ?? a.fields,
                    content: contentDraft ?? a.content,
                    modifiedAt: new Date().toISOString(),
                  }
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
    const state = get()
    const ids = Array.from(new Set([
      ...Object.keys(state.drafts),
      ...Object.keys(state.contentDrafts),
    ]))
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
          const { [articleId]: _droppedFields, ...drafts } = s.drafts
          const { [articleId]: _droppedContent, ...contentDrafts } = s.contentDrafts
          const newCurrent =
            s.currentArticleId === articleId ? remaining[0]?.id ?? null : s.currentArticleId
          return { articles: remaining, drafts, contentDrafts, currentArticleId: newCurrent }
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
      if (result.success && result.data) {
        const fields = result.data.fields ?? {}
        const newContent = result.data.content
        set((s) => ({
          articles: s.articles.map((a) =>
            a.id === articleId
              ? {
                  ...a,
                  fields: { ...a.fields, ...fields },
                  content: newContent ?? a.content,
                  modifiedAt: new Date().toISOString(),
                }
              : a
          ),
          // Drop any stale drafts for this article: server is now authoritative.
          drafts: Object.fromEntries(Object.entries(s.drafts).filter(([k]) => k !== articleId)),
          contentDrafts: Object.fromEntries(
            Object.entries(s.contentDrafts).filter(([k]) => k !== articleId)
          ),
        }))
      }
      return result
    } catch (err: any) {
      console.error(err)
      return { success: false, error: err?.message ?? 'Erreur lors de la transcription' }
    }
  },

  reextractField: async (articleId, fieldName, settings) => {
    const projectId = get().projectId
    if (!projectId) return { success: false, error: 'Aucun projet chargé' }
    try {
      const result = await window.api.v2_transcribeReextractField(
        projectId,
        articleId,
        fieldName,
        settings
      )
      if (result.success && result.value !== undefined) {
        const newValue = result.value
        set((s) => ({
          articles: s.articles.map((a) =>
            a.id === articleId
              ? {
                  ...a,
                  fields: { ...a.fields, [fieldName]: newValue },
                  modifiedAt: new Date().toISOString(),
                }
              : a
          ),
          // Clear any draft for this specific field so the freshly extracted
          // value shows up in the UI without being shadowed by stale edits.
          drafts: Object.fromEntries(
            Object.entries(s.drafts).map(([aid, d]) =>
              aid === articleId ? [aid, { ...d, [fieldName]: newValue }] : [aid, d]
            )
          ),
        }))
      }
      return result
    } catch (err: any) {
      console.error(err)
      return { success: false, error: err?.message ?? 'Erreur lors de la ré-extraction' }
    }
  },

  applyTemplate: async (articleId, newSchema, newFields, newAiContext, newTemplateId) => {
    const projectId = get().projectId
    if (!projectId) return false
    try {
      const ok = await window.api.v2_articlesUpdate(projectId, articleId, {
        schema: newSchema,
        aiContext: newAiContext,
        fields: newFields,
        templateId: newTemplateId,
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
                templateId: newTemplateId,
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

export const selectCurrentContent = (s: EditorState): string => {
  if (!s.currentArticleId) return ''
  const draft = s.contentDrafts[s.currentArticleId]
  if (draft !== undefined) return draft
  return s.articles.find((a) => a.id === s.currentArticleId)?.content ?? ''
}

export const selectHasUnsavedChanges = (s: EditorState): boolean =>
  Object.keys(s.drafts).length > 0 || Object.keys(s.contentDrafts).length > 0

export const selectArticleHasDraft = (articleId: string) => (s: EditorState): boolean =>
  s.drafts[articleId] !== undefined || s.contentDrafts[articleId] !== undefined
