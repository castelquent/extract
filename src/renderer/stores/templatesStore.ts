import { create } from 'zustand'
import { toast } from 'sonner'
import type { Template, DeleteTemplateResult } from '@shared/types'

interface TemplatesState {
  templates: Template[]
  loading: boolean
  error: string | null

  // Actions
  loadTemplates: () => Promise<void>
  getTemplate: (templateId: string) => Promise<Template | null>
  saveTemplate: (template: Template) => Promise<boolean>
  deleteTemplate: (templateId: string) => Promise<DeleteTemplateResult>
  clearError: () => void
}

export const useTemplatesStore = create<TemplatesState>((set, get) => ({
  templates: [],
  loading: false,
  error: null,

  loadTemplates: async () => {
    const state = get()
    if (state.loading) return

    set({ loading: true, error: null })
    try {
      const templates = await window.api.getTemplates()
      set({ templates, loading: false })
    } catch (err) {
      toast.error('Erreur lors du chargement des modèles')
      set({ error: 'Erreur lors du chargement des modèles', loading: false })
    }
  },

  getTemplate: async (templateId: string) => {
    // D'abord chercher dans le cache local
    const cached = get().templates.find(t => t.id === templateId)
    if (cached) return cached

    // Sinon charger depuis l'API
    try {
      const template = await window.api.getTemplate(templateId)
      return template
    } catch (err) {
      console.error('Error loading template:', err)
      return null
    }
  },

  saveTemplate: async (template: Template) => {
    set({ error: null })
    try {
      const success = await window.api.saveTemplate(template)
      if (success) {
        // Mettre à jour le cache local
        set((state) => {
          const existingIndex = state.templates.findIndex(t => t.id === template.id)
          if (existingIndex >= 0) {
            const updated = [...state.templates]
            updated[existingIndex] = template
            return { templates: updated }
          } else {
            return { templates: [...state.templates, template] }
          }
        })
        toast.success('Modèle enregistré')
      }
      return success
    } catch (err) {
      toast.error('Erreur lors de l\'enregistrement du modèle')
      set({ error: 'Erreur lors de l\'enregistrement du modèle' })
      return false
    }
  },

  deleteTemplate: async (templateId: string): Promise<DeleteTemplateResult> => {
    set({ error: null })
    try {
      const result = await window.api.deleteTemplate(templateId)
      if (result.success) {
        set((state) => ({
          templates: state.templates.filter(t => t.id !== templateId)
        }))
        toast.success('Modèle supprimé')
      } else if (result.reason === 'in_use') {
        const projectList = result.projectNames?.join(', ') || ''
        toast.error(`Ce modèle est utilisé par: ${projectList}`)
      } else if (result.reason === 'is_default') {
        toast.error('Impossible de supprimer un modèle par défaut')
      }
      return result
    } catch (err) {
      toast.error('Erreur lors de la suppression du modèle')
      set({ error: 'Erreur lors de la suppression du modèle' })
      return { success: false }
    }
  },

  clearError: () => set({ error: null }),
}))
