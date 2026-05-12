import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'

type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'

interface UIState {
  drawerCollapsed: boolean
  settingsOpen: boolean
  helpOpen: boolean
  theme: Theme

  // Window close state
  pendingClose: boolean
  hasUnsavedChanges: boolean
  onSaveCallback: (() => Promise<void>) | null

  // Update state
  updateStatus: UpdateStatus
  updateVersion: string | null
  updateProgress: number
  updateError: string | null

  // Actions
  toggleDrawer: () => void
  setDrawerCollapsed: (collapsed: boolean) => void
  openSettings: () => void
  closeSettings: () => void
  openHelp: () => void
  closeHelp: () => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void

  // Window close actions
  setPendingClose: (pending: boolean) => void
  setHasUnsavedChanges: (hasChanges: boolean) => void
  setOnSaveCallback: (callback: (() => Promise<void>) | null) => void

  // Update actions
  setUpdateStatus: (status: UpdateStatus) => void
  setUpdateVersion: (version: string | null) => void
  setUpdateProgress: (progress: number) => void
  setUpdateError: (error: string | null) => void
}

// Apply theme to document
const applyTheme = (theme: Theme) => {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      drawerCollapsed: false,
      settingsOpen: false,
      helpOpen: false,
      theme: 'dark', // Dark by default

      // Window close state
      pendingClose: false,
      hasUnsavedChanges: false,
      onSaveCallback: null,

      // Update state
      updateStatus: 'idle',
      updateVersion: null,
      updateProgress: 0,
      updateError: null,

      toggleDrawer: () => set((state) => ({ drawerCollapsed: !state.drawerCollapsed })),
      setDrawerCollapsed: (collapsed) => set({ drawerCollapsed: collapsed }),
      openSettings: () => set({ settingsOpen: true }),
      closeSettings: () => set({ settingsOpen: false }),
      openHelp: () => set({ helpOpen: true }),
      closeHelp: () => set({ helpOpen: false }),
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
      toggleTheme: () => {
        const newTheme = get().theme === 'dark' ? 'light' : 'dark'
        applyTheme(newTheme)
        set({ theme: newTheme })
      },

      // Window close actions
      setPendingClose: (pending) => set({ pendingClose: pending }),
      setHasUnsavedChanges: (hasChanges) => set({ hasUnsavedChanges: hasChanges }),
      setOnSaveCallback: (callback) => set({ onSaveCallback: callback }),

      // Update actions
      setUpdateStatus: (status) => set({ updateStatus: status }),
      setUpdateVersion: (version) => set({ updateVersion: version }),
      setUpdateProgress: (progress) => set({ updateProgress: progress }),
      setUpdateError: (error) => set({ updateError: error }),
    }),
    {
      name: 'extract-ui-storage',
      partialize: (state) => ({
        drawerCollapsed: state.drawerCollapsed,
        theme: state.theme,
      }),
      onRehydrateStorage: () => (state) => {
        // Apply theme on app load
        if (state?.theme) {
          applyTheme(state.theme)
        } else {
          // Default to dark
          applyTheme('dark')
        }
      },
    }
  )
)
