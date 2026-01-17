import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { Toaster } from 'sonner'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { NavigationDrawer } from './NavigationDrawer'
import { SettingsModal } from './SettingsModal'
import { useProjectsStore } from '@/stores'

export function AppLayout() {
  const loadProjects = useProjectsStore((state) => state.loadProjects)

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  return (
    <SidebarProvider>
      <NavigationDrawer />
      <SidebarInset>
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </SidebarInset>
      <SettingsModal />
      <Toaster position="bottom-right" richColors />
    </SidebarProvider>
  )
}
