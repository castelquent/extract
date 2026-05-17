import { create } from 'zustand'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import type { Settings, AISettings } from '@shared/types'
import { useTemplatesStore } from './templatesStore'

const t = (key: string, opts?: Record<string, unknown>): string =>
  i18n.t(key, opts ?? {}) as string

interface SettingsState {
  settings: Settings | null
  loading: boolean
  saving: boolean
  error: string | null

  // Actions
  loadSettings: () => Promise<void>
  saveSettings: (settings: Settings) => Promise<boolean>
  updateAI: <K extends keyof AISettings>(key: K, value: AISettings[K]) => void
  updateApp: <K extends keyof Settings['app']>(key: K, value: Settings['app'][K]) => void
  clearError: () => void
}

const defaultSettings: Settings = {
  ai: {
    provider: 'openai',
    apiKey: '',
    model: 'gpt-4o',
    prompt: `Transcris cet article de journal. Retourne un JSON avec les champs suivants:
- title: le titre de l'article
- author: l'auteur (ou vide si non trouvé)
- content: le contenu de l'article en HTML (utilise <p>, <strong>, <em>)

Réponds uniquement avec le JSON, sans explication.`,
  },
  app: {
    checkUpdatesOnStart: true,
    theme: 'dark',
    onboardingSeen: false,
  },
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  loading: false,
  saving: false,
  error: null,

  loadSettings: async () => {
    set({ loading: true, error: null })
    try {
      const settings = await window.api.getSettings()
      set({ settings: settings || defaultSettings, loading: false })
    } catch (err) {
      toast.error(t('settings:toasts.loadError'))
      set({ settings: defaultSettings, error: t('settings:toasts.loadError'), loading: false })
    }
  },

  saveSettings: async (settings) => {
    set({ saving: true, error: null })
    try {
      const success = await window.api.saveSettings(settings)
      if (success) {
        set({ settings, saving: false })
        toast.success(t('settings:toasts.saved'))
        // Disk has the new language now (if it changed). Always refetch
        // templates — the main process re-localizes default templates from
        // settings.json. Cheap no-op when the language didn't change.
        void useTemplatesStore.getState().loadTemplates()
      } else {
        toast.error(t('settings:toasts.saveError'))
        set({ error: t('settings:toasts.saveError'), saving: false })
      }
      return success
    } catch (err) {
      toast.error(t('settings:toasts.saveError'))
      set({ error: t('settings:toasts.saveError'), saving: false })
      return false
    }
  },

  updateAI: (key, value) => {
    const { settings } = get()
    if (!settings) return

    set({
      settings: {
        ...settings,
        ai: {
          ...settings.ai,
          [key]: value,
        },
      },
    })
  },

  updateApp: (key, value) => {
    const { settings } = get()
    if (!settings) return

    set({
      settings: {
        ...settings,
        app: {
          ...settings.app,
          [key]: value,
        },
      },
    })
  },

  clearError: () => set({ error: null }),
}))

// Selectors
export const selectAISettings = (state: SettingsState) => state.settings?.ai || null
export const selectAppSettings = (state: SettingsState) => state.settings?.app || null
export const selectHasAnyApiKey = (state: SettingsState) => {
  const ai = state.settings?.ai
  return !!(ai?.anthropicApiKey?.trim() || ai?.openaiApiKey?.trim())
}
