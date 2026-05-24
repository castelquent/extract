import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ProjectView } from '@shared/types'
import {
  selectHasAnyApiKey,
  useProjectsStoreV2,
  useSettingsStore,
  useUIStore,
} from '@/stores'
import { ProjectCard } from './ProjectCard'
import { CreateProjectModal } from './CreateProjectModal'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@/components/ui'
import { AlertTriangle, FolderOpen, Home, Plus, Upload } from 'lucide-react'
import { toast } from 'sonner'

export function ProjectsPage() {
  const { t } = useTranslation(['projects', 'common'])
  const navigate = useNavigate()
  const {
    projects,
    loading,
    loadProjects,
    createProject,
    deleteProject,
    duplicateProject,
    renameProject,
    openProjectFolder,
    exportProjectZip,
    importProjectZip,
  } = useProjectsStoreV2()
  const hasAnyApiKey = useSettingsStore(selectHasAnyApiKey)
  const settingsLoaded = useSettingsStore((s) => s.settings !== null)
  const openSettings = useUIStore((s) => s.openSettings)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProjectView | null>(null)
  const [renameTarget, setRenameTarget] = useState<ProjectView | null>(null)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const filteredProjects = projects

  const handleCreateProject = async (name: string, templateId: string) => {
    const project = await createProject(name, templateId)
    if (project) {
      setShowCreateModal(false)
      navigate(`/project/${project.id}`)
    }
  }

  const handleRename = async () => {
    if (!renameTarget || !newName.trim()) return
    const ok = await renameProject(renameTarget.id, newName.trim())
    if (ok) toast.success(t('projects:renamed'))
    setRenameTarget(null)
    setNewName('')
  }

  const openRenameDialog = (project: ProjectView) => {
    setRenameTarget(project)
    setNewName(project.name)
  }

  return (
    <div className="min-h-screen p-8">
      {settingsLoaded && !hasAnyApiKey && (
        <div className="mb-4 flex items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0" />
          <p className="flex-1 text-muted-foreground">
            {t('projects:noApiKeyWarning')}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-amber-700 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
            onClick={openSettings}
          >
            {t('projects:configure')}
          </Button>
        </div>
      )}

      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Home className="h-8 w-8 text-foreground" />
          <div>
            <h1 className="text-2xl font-bold">{t('projects:title')}</h1>
            <p className="text-muted-foreground text-sm">{t('projects:subtitle')}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => importProjectZip()}>
            <Upload className="h-4 w-4 mr-2" />
            {t('projects:importZip')}
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('projects:newProject')}
          </Button>
        </div>
      </header>

      {/* Spinner only on the very first load. Subsequent reloads triggered
          by the chokidar watcher swap the array atomically without showing
          the "Chargement..." state, which otherwise flashes whenever a
          project is created/deleted/imported. */}
      {loading && projects.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">{t('common:loading')}</div>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <FolderOpen className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground mb-4">{t('projects:empty')}</p>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('projects:createFirst')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => navigate(`/project/${project.id}`)}
              onDelete={() => setDeleteTarget(project)}
              onDuplicate={() => duplicateProject(project.id)}
              onRename={() => openRenameDialog(project)}
              onOpenFolder={() => openProjectFolder(project.id)}
              onExportZip={() => exportProjectZip(project.id)}
            />
          ))}
        </div>
      )}

      <CreateProjectModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onCreate={handleCreateProject}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('projects:deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('projects:deleteDialog.description', { name: deleteTarget?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault()
                if (!deleteTarget) return
                await deleteProject(deleteTarget.id)
                setDeleteTarget(null)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common:delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('projects:renameDialog.title')}</DialogTitle>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('projects:renameDialog.namePlaceholder')}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              {t('common:cancel')}
            </Button>
            <Button onClick={handleRename} disabled={!newName.trim()}>
              {t('projects:renameDialog.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
