// v2 projects store. Holds the list of projects as ProjectView (aggregated
// counts, no per-PDF status). Backed by v2_projects* IPC handlers.
import { create } from 'zustand'
import { toast } from 'sonner'
import type { ProjectView } from '@shared/types'

interface ProjectsV2State {
  projects: ProjectView[]
  loading: boolean
  error: string | null

  loadProjects: () => Promise<void>
  createProject: (name: string, templateId: string) => Promise<ProjectView | null>
  renameProject: (projectId: string, name: string) => Promise<boolean>
  deleteProject: (projectId: string) => Promise<boolean>
  duplicateProject: (projectId: string) => Promise<ProjectView | null>
  openProjectFolder: (projectId: string) => Promise<void>
  clearError: () => void
}

export const useProjectsStoreV2 = create<ProjectsV2State>((set, get) => ({
  projects: [],
  loading: false,
  error: null,

  loadProjects: async () => {
    if (get().loading) return
    set({ loading: true, error: null })
    try {
      const projects = await window.api.v2_projectsList()
      set({ projects, loading: false })
    } catch (err) {
      console.error(err)
      toast.error('Erreur lors du chargement des projets')
      set({ error: 'Erreur lors du chargement des projets', loading: false })
    }
  },

  createProject: async (name, templateId) => {
    try {
      const project = await window.api.v2_projectsCreate(name, templateId)
      if (project) {
        set((s) => ({ projects: [project, ...s.projects] }))
        toast.success('Projet créé')
      }
      return project
    } catch (err) {
      console.error(err)
      toast.error('Erreur lors de la création du projet')
      return null
    }
  },

  renameProject: async (projectId, name) => {
    try {
      const ok = await window.api.v2_projectsRename(projectId, name)
      if (ok) {
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, name, modifiedAt: new Date().toISOString() } : p
          ),
        }))
        toast.success('Projet renommé')
      }
      return ok
    } catch (err) {
      console.error(err)
      toast.error('Erreur lors du renommage')
      return false
    }
  },

  deleteProject: async (projectId) => {
    try {
      const ok = await window.api.v2_projectsDelete(projectId)
      if (ok) {
        set((s) => ({ projects: s.projects.filter((p) => p.id !== projectId) }))
        toast.success('Projet supprimé')
      }
      return ok
    } catch (err) {
      console.error(err)
      toast.error('Erreur lors de la suppression')
      return false
    }
  },

  duplicateProject: async (projectId) => {
    try {
      const project = await window.api.v2_projectsDuplicate(projectId)
      if (project) {
        set((s) => ({ projects: [project, ...s.projects] }))
        toast.success('Projet dupliqué')
      }
      return project
    } catch (err) {
      console.error(err)
      toast.error('Erreur lors de la duplication')
      return null
    }
  },

  openProjectFolder: async (projectId) => {
    try {
      await window.api.v2_projectsOpenFolder(projectId)
    } catch (err) {
      console.error(err)
      toast.error("Impossible d'ouvrir le dossier")
    }
  },

  clearError: () => set({ error: null }),
}))

// Filtered selectors based on aggregated counts (replace the legacy
// selectExtractionProjects / selectTranscriptionProjects / selectCompletedProjects).
export const selectProjectsToExtract = (s: ProjectsV2State): ProjectView[] =>
  s.projects.filter((p) => p.articlesToExtract > 0)

export const selectProjectsToTranscribe = (s: ProjectsV2State): ProjectView[] =>
  s.projects.filter((p) => p.articlesToTranscribe > 0)

export const selectProjectsDone = (s: ProjectsV2State): ProjectView[] =>
  s.projects.filter((p) => p.articlesTotal > 0 && p.articlesToExtract === 0 && p.articlesToTranscribe === 0)
