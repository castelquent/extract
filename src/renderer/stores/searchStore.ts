import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Tiny store that keeps the last search query alive across navigation so
// hitting "Recherche" in the sidebar (or coming back from the editor) brings
// the user back to their last query instead of an empty input. Persisted to
// localStorage so it also survives a full app restart.
interface SearchState {
  lastQuery: string
  setLastQuery: (q: string) => void
}

export const useSearchStore = create<SearchState>()(
  persist(
    (set) => ({
      lastQuery: '',
      setLastQuery: (q) => set({ lastQuery: q }),
    }),
    { name: 'extract-search-storage' }
  )
)
