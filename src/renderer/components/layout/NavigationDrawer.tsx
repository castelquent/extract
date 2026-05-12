import { useLocation, useNavigate } from 'react-router-dom'
import { Home, Scissors, FileText, FileStack, Settings, PanelLeftClose, PanelLeft, CheckCircle, Search } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  useSidebar,
} from '@/components/ui/sidebar'
import { useProjectsStore, selectExtractionProjects, selectTranscriptionProjects, selectCompletedProjects, useUIStore } from '@/stores'

const navItems = [
  { to: '/', icon: Home, label: 'Accueil', filter: 'all' as const },
  { to: '/extraction', icon: Scissors, label: 'Extraction', filter: 'extraction' as const },
  { to: '/transcription', icon: FileText, label: 'Transcription', filter: 'transcription' as const },
  { to: '/completed', icon: CheckCircle, label: 'Terminés', filter: 'completed' as const },
  { to: '/search', icon: Search, label: 'Recherche', filter: null },
  { to: '/templates', icon: FileStack, label: 'Modèles', filter: null },
]

export function NavigationDrawer() {
  const location = useLocation()
  const navigate = useNavigate()
  const { openSettings, updateStatus } = useUIStore()
  const { toggleSidebar, state } = useSidebar()
  const projects = useProjectsStore((state) => state.projects)
  const isCollapsed = state === 'collapsed'

  const hasUpdate = updateStatus === 'available' || updateStatus === 'ready'

  const getCounts = (filter: 'all' | 'extraction' | 'transcription' | 'completed' | null) => {
    if (filter === null) return 0
    const state = { projects } as any
    switch (filter) {
      case 'extraction':
        return selectExtractionProjects(state).length
      case 'transcription':
        return selectTranscriptionProjects(state).length
      case 'completed':
        return selectCompletedProjects(state).length
      default:
        return projects.length
    }
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="px-2 py-2">
        <SidebarMenu>
          {navItems.map((item) => {
            const isActive = location.pathname === item.to
            const count = getCounts(item.filter)

            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  isActive={isActive}
                  onClick={() => navigate(item.to)}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
                {count > 0 && (
                  <SidebarMenuBadge>{count}</SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-2 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={openSettings}>
              <div className="relative">
                <Settings className="h-4 w-4" />
                {hasUpdate && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />
                )}
              </div>
              <span>Paramètres</span>
            </SidebarMenuButton>
            {hasUpdate && (
              <SidebarMenuBadge className="bg-primary text-primary-foreground">!</SidebarMenuBadge>
            )}
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={toggleSidebar}>
              {isCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              <span>{isCollapsed ? "Agrandir" : "Réduire"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
