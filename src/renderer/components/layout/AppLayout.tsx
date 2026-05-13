import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { NavigationDrawer } from './NavigationDrawer'
import { SettingsModal } from './SettingsModal'
import { HelpModal } from './HelpModal'
import {
  useProjectsStoreV2,
  useProjectStore,
  useTemplatesStore,
  useSettingsStore,
} from '@/stores'

export function AppLayout() {
  const navigate = useNavigate()
  const loadProjects = useProjectsStoreV2((state) => state.loadProjects)
  const loadTemplates = useTemplatesStore((state) => state.loadTemplates)
  const loadSettings = useSettingsStore((state) => state.loadSettings)
  const settings = useSettingsStore((state) => state.settings)

  useEffect(() => {
    loadProjects()
    loadTemplates()
    loadSettings()
  }, [loadProjects, loadTemplates, loadSettings])

  // Subscribe to filesystem watcher events so the UI reflects external
  // changes (manual edits in Explorer, articles moved between projects, etc.)
  // without polling. Editor drafts are intentionally NOT refreshed here —
  // we don't want to wipe in-flight edits.
  useEffect(() => {
    const unsubList = window.api.v2_onProjectsListChanged(() => {
      useProjectsStoreV2.getState().loadProjects()
    })
    const unsubProject = window.api.v2_onProjectChanged((projectId) => {
      const projectState = useProjectStore.getState()
      if (projectState.project?.id === projectId) {
        projectState.refresh()
      }
      useProjectsStoreV2.getState().loadProjects()
    })
    return () => {
      unsubList()
      unsubProject()
    }
  }, [])

  // Redirect to onboarding on first launch (once settings have loaded)
  useEffect(() => {
    if (settings && !settings.app.onboardingSeen) {
      navigate('/welcome', { replace: true })
    }
  }, [settings, navigate])

  return (
    <SidebarProvider>
      <NavigationDrawer />
      <SidebarInset>
        <main className="flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
          <Outlet />
        </main>
      </SidebarInset>
      <SettingsModal />
      <HelpModal />
      <Toaster position="bottom-right" richColors />
    </SidebarProvider>
  )
}
