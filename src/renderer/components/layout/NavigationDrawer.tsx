import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  FileStack,
  FolderOpen,
  HelpCircle,
  Home,
  PanelLeft,
  PanelLeftClose,
  Search,
  Settings,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useProjectsStoreV2, useUIStore } from '@/stores'
import type { ProjectView } from '@shared/types'

const RECENT_LIMIT = 5

export function NavigationDrawer() {
  const { t } = useTranslation('nav')
  const location = useLocation()
  const navigate = useNavigate()
  const { openSettings, openHelp, updateStatus } = useUIStore()
  const { toggleSidebar, state } = useSidebar()
  const projects = useProjectsStoreV2((s) => s.projects)
  const isCollapsed = state === 'collapsed'

  const hasUpdate = updateStatus === 'available' || updateStatus === 'ready'

  const recentProjects = [...projects]
    .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
    .slice(0, RECENT_LIMIT)

  const navItems: Array<{
    to: string
    icon: React.ElementType
    label: string
  }> = [
    { to: '/', icon: Home, label: t('allProjects') },
    { to: '/search', icon: Search, label: t('search') },
    { to: '/templates', icon: FileStack, label: t('templates') },
  ]

  const isActiveProject = (project: ProjectView): boolean =>
    location.pathname === `/project/${project.id}`

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="px-2 py-2">
        <SidebarMenu>
          {navItems.map((item) => {
            const isActive = location.pathname === item.to
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton isActive={isActive} onClick={() => navigate(item.to)}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>

        {recentProjects.length > 0 && !isCollapsed && (
          <SidebarGroup>
            <SidebarGroupLabel>{t('recent')}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {recentProjects.map((project) => (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton
                      isActive={isActiveProject(project)}
                      onClick={() => navigate(`/project/${project.id}`)}
                    >
                      <FolderOpen className="h-4 w-4 shrink-0" />
                      <span className="truncate">{project.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-2 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={openHelp}>
              <HelpCircle className="h-4 w-4" />
              <span>{t('help')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={openSettings}>
              <div className="relative">
                <Settings className="h-4 w-4" />
                {hasUpdate && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />
                )}
              </div>
              <span>{t('settings')}</span>
            </SidebarMenuButton>
            {hasUpdate && (
              <SidebarMenuBadge className="bg-primary text-primary-foreground">!</SidebarMenuBadge>
            )}
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={toggleSidebar}>
              {isCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              <span>{isCollapsed ? t('expand') : t('collapse')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
