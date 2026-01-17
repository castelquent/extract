import { useLocation, useNavigate } from 'react-router-dom'
import { Home, Scissors, FileText, Settings, PanelLeftClose, PanelLeft } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  useSidebar,
} from '@/components/ui/sidebar'
import { useProjectsStore, selectExtractionProjects, selectTranscriptionProjects, useUIStore } from '@/stores'

const navItems = [
  { to: '/', icon: Home, label: 'Accueil', filter: 'all' as const },
  { to: '/extraction', icon: Scissors, label: 'Extraction', filter: 'extraction' as const },
  { to: '/transcription', icon: FileText, label: 'Transcription', filter: 'transcription' as const },
]

export function NavigationDrawer() {
  const location = useLocation()
  const navigate = useNavigate()
  const { openSettings } = useUIStore()
  const { toggleSidebar, state } = useSidebar()
  const projects = useProjectsStore((state) => state.projects)
  const isCollapsed = state === 'collapsed'

  const getCounts = (filter: 'all' | 'extraction' | 'transcription') => {
    const state = { projects } as any
    switch (filter) {
      case 'extraction':
        return selectExtractionProjects(state).length
      case 'transcription':
        return selectTranscriptionProjects(state).length
      default:
        return projects.length
    }
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-2">
        <SidebarMenuButton tooltip={isCollapsed ? "Agrandir" : "Réduire"} onClick={toggleSidebar}>
          {isCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          <span>Réduire</span>
        </SidebarMenuButton>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        <SidebarMenu>
          {navItems.map((item) => {
            const isActive = location.pathname === item.to
            const count = getCounts(item.filter)

            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  isActive={isActive}
                  tooltip={item.label}
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
            <SidebarMenuButton tooltip="Paramètres" onClick={openSettings}>
              <Settings className="h-4 w-4" />
              <span>Paramètres</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
