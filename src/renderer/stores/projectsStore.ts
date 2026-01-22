import { create } from 'zustand'
import { toast } from 'sonner'
import type { Project, ProjectMetadata } from '@shared/types'

interface ProjectsState {
  projects: Project[]
  currentProject: Project | null
  loading: boolean
  error: string | null

  // Actions
  loadProjects: () => Promise<void>
  setCurrentProject: (project: Project | null) => void
  loadProject: (projectId: string) => Promise<Project | null>
  createProject: (name: string, templateId: string) => Promise<Project | null>
  deleteProject: (id: string) => Promise<boolean>
  duplicateProject: (id: string) => Promise<Project | null>
  updateProject: (id: string, updates: Partial<ProjectMetadata>) => Promise<boolean>
  clearError: () => void
}

export const useProjectsStore = create<ProjectsState>((set) => ({
  projects: [],
  currentProject: null,
  loading: false,
  error: null,

  loadProjects: async () => {
    // Éviter les appels multiples simultanés
    const state = useProjectsStore.getState()
    if (state.loading) return

    set({ loading: true, error: null })
    try {
      const projects = await window.api.getProjects()
      set({ projects, loading: false })
    } catch (err) {
      toast.error('Erreur lors du chargement des projets')
      set({ error: 'Erreur lors du chargement des projets', loading: false })
    }
  },

  setCurrentProject: (project) => set({ currentProject: project }),

  loadProject: async (projectId) => {
    set({ loading: true, error: null })
    try {
      const project = await window.api.getProject(projectId)
      set({ currentProject: project, loading: false })
      return project
    } catch (err) {
      toast.error('Erreur lors du chargement du projet')
      set({ error: 'Erreur lors du chargement du projet', loading: false })
      return null
    }
  },

  createProject: async (name, templateId) => {
    set({ error: null })
    try {
      const project = await window.api.createProject(name, templateId)
      if (project) {
        set((state) => ({ projects: [project, ...state.projects] }))
        toast.success('Projet créé')
      }
      return project
    } catch (err) {
      toast.error('Erreur lors de la création du projet')
      set({ error: 'Erreur lors de la création du projet' })
      return null
    }
  },

  deleteProject: async (id) => {
    set({ error: null })
    try {
      const success = await window.api.deleteProject(id)
      if (success) {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          currentProject: state.currentProject?.id === id ? null : state.currentProject,
        }))
        toast.success('Projet supprimé')
      }
      return success
    } catch (err) {
      toast.error('Erreur lors de la suppression du projet')
      set({ error: 'Erreur lors de la suppression du projet' })
      return false
    }
  },

  duplicateProject: async (id) => {
    set({ error: null })
    try {
      const project = await window.api.duplicateProject(id)
      if (project) {
        set((state) => ({ projects: [project, ...state.projects] }))
        toast.success('Projet dupliqué')
      }
      return project
    } catch (err) {
      toast.error('Erreur lors de la duplication du projet')
      set({ error: 'Erreur lors de la duplication du projet' })
      return null
    }
  },

  updateProject: async (id, updates) => {
    set({ error: null })
    try {
      const success = await window.api.updateProject(id, updates)
      if (success) {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
          currentProject:
            state.currentProject?.id === id
              ? { ...state.currentProject, ...updates }
              : state.currentProject,
        }))
      }
      return success
    } catch (err) {
      toast.error('Erreur lors de la mise à jour du projet')
      set({ error: 'Erreur lors de la mise à jour du projet' })
      return false
    }
  },

  clearError: () => set({ error: null }),
}))

// Selectors pour filtrer les projets par catégorie
// Extraction: projets new ou extracting (pas encore exporté les images)
export const selectExtractionProjects = (state: ProjectsState) =>
  state.projects.filter((p) => p.status === 'new' || p.status === 'extracting')

// Transcription: projets extracted ou in_progress (en cours de transcription)
export const selectTranscriptionProjects = (state: ProjectsState) =>
  state.projects.filter((p) => p.status === 'extracted' || p.status === 'in_progress')

// Terminé: projets completed
export const selectCompletedProjects = (state: ProjectsState) =>
  state.projects.filter((p) => p.status === 'completed')
