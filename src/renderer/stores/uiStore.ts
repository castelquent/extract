import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  drawerCollapsed: boolean
  settingsOpen: boolean

  // Actions
  toggleDrawer: () => void
  setDrawerCollapsed: (collapsed: boolean) => void
  openSettings: () => void
  closeSettings: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      drawerCollapsed: false,
      settingsOpen: false,

      toggleDrawer: () => set((state) => ({ drawerCollapsed: !state.drawerCollapsed })),
      setDrawerCollapsed: (collapsed) => set({ drawerCollapsed: collapsed }),
      openSettings: () => set({ settingsOpen: true }),
      closeSettings: () => set({ settingsOpen: false }),
    }),
    {
      name: 'extract-ui-storage',
      partialize: (state) => ({ drawerCollapsed: state.drawerCollapsed }),
    }
  )
)
