// v2 projects store. Holds the list of projects as ProjectView (aggregated
// counts, no per-PDF status). Backed by v2_projects* IPC handlers.
import { create } from 'zustand'
import { toast } from 'sonner'
import i18n from '@/lib/i18n'
import type { ProjectView } from '@shared/types'

const t = (key: string, opts?: Record<string, unknown>): string =>
  i18n.t(key, opts ?? {}) as string

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
  exportProjectZip: (projectId: string) => Promise<boolean>
  importProjectZip: () => Promise<ProjectView | null>
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
      toast.error(t('projects:toasts.loadError'))
      set({ error: t('projects:toasts.loadError'), loading: false })
    }
  },

  createProject: async (name, templateId) => {
    try {
      const project = await window.api.v2_projectsCreate(name, templateId)
      if (project) {
        set((s) => ({ projects: [project, ...s.projects] }))
        toast.success(t('projects:toasts.created'))
      }
      return project
    } catch (err) {
      console.error(err)
      toast.error(t('projects:toasts.createError'))
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
        toast.success(t('projects:renamed'))
      }
      return ok
    } catch (err) {
      console.error(err)
      toast.error(t('projects:toasts.renameError'))
      return false
    }
  },

  deleteProject: async (projectId) => {
    try {
      const ok = await window.api.v2_projectsDelete(projectId)
      if (ok) {
        set((s) => ({ projects: s.projects.filter((p) => p.id !== projectId) }))
        toast.success(t('projects:toasts.deleted'))
      }
      return ok
    } catch (err) {
      console.error(err)
      toast.error(t('projects:toasts.deleteError'))
      return false
    }
  },

  duplicateProject: async (projectId) => {
    try {
      const project = await window.api.v2_projectsDuplicate(projectId)
      if (project) {
        set((s) => ({ projects: [project, ...s.projects] }))
        toast.success(t('projects:toasts.duplicated'))
      }
      return project
    } catch (err) {
      console.error(err)
      toast.error(t('projects:toasts.duplicateError'))
      return null
    }
  },

  openProjectFolder: async (projectId) => {
    try {
      await window.api.v2_projectsOpenFolder(projectId)
    } catch (err) {
      console.error(err)
      toast.error(t('projects:toasts.openFolderError'))
    }
  },

  exportProjectZip: async (projectId) => {
    try {
      const ok = await window.api.v2_projectsExportZip(projectId)
      if (ok) toast.success(t('projects:toasts.exported'))
      return ok
    } catch (err) {
      console.error(err)
      toast.error(t('projects:toasts.exportError'))
      return false
    }
  },

  importProjectZip: async () => {
    try {
      const project = await window.api.v2_projectsImportZip()
      if (project) {
        set((s) => ({ projects: [project, ...s.projects] }))
        toast.success(t('projects:toasts.imported'))
      }
      return project
    } catch (err) {
      console.error(err)
      toast.error(t('projects:toasts.importError'))
      return null
    }
  },

  clearError: () => set({ error: null }),
}))

