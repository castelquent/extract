import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ProjectView } from '@shared/types'
import {
  selectHasAnyApiKey,
  selectProjectsDone,
  selectProjectsToExtract,
  selectProjectsToTranscribe,
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
import { AlertTriangle, CheckCircle, FileText, FolderOpen, Home, Plus, Scissors, Upload } from 'lucide-react'
import { toast } from 'sonner'

export type ProjectFilter = 'all' | 'extraction' | 'transcription' | 'completed'

interface ProjectsPageProps {
  filter?: ProjectFilter
}

const filterConfig: Record<ProjectFilter, { title: string; subtitle: string; icon: React.ElementType; emptyMessage: string }> = {
  all: {
    title: 'Tous les projets',
    subtitle: "Vue d'ensemble de tous vos projets",
    icon: Home,
    emptyMessage: 'Aucun projet',
  },
  extraction: {
    title: 'Extraction',
    subtitle: 'Projets avec des éléments à extraire',
    icon: Scissors,
    emptyMessage: 'Aucun élément à extraire',
  },
  transcription: {
    title: 'Transcription',
    subtitle: 'Projets avec des éléments à transcrire',
    icon: FileText,
    emptyMessage: 'Aucun élément à transcrire',
  },
  completed: {
    title: 'Terminés',
    subtitle: 'Projets complétés',
    icon: CheckCircle,
    emptyMessage: 'Aucun projet terminé',
  },
}

export function ProjectsPage({ filter = 'all' }: ProjectsPageProps) {
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

  const filteredProjects = useMemo(() => {
    const state = { projects } as Parameters<typeof selectProjectsToExtract>[0]
    switch (filter) {
      case 'extraction':
        return selectProjectsToExtract(state)
      case 'transcription':
        return selectProjectsToTranscribe(state)
      case 'completed':
        return selectProjectsDone(state)
      default:
        return projects
    }
  }, [projects, filter])

  const config = filterConfig[filter]
  const Icon = config.icon

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
    if (ok) toast.success('Projet renommé')
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
            Aucune clé API configurée. La transcription IA est désactivée.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-amber-700 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300"
            onClick={openSettings}
          >
            Configurer
          </Button>
        </div>
      )}

      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Icon className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">{config.title}</h1>
            <p className="text-muted-foreground text-sm">{config.subtitle}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => importProjectZip()}>
            <Upload className="h-4 w-4 mr-2" />
            Importer ZIP
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau projet
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Chargement...</div>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <FolderOpen className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground mb-4">{config.emptyMessage}</p>
          {filter === 'all' && (
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Créer votre premier projet
            </Button>
          )}
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
            <AlertDialogTitle>Supprimer le projet ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le projet "{deleteTarget?.name}" et tous ses fichiers seront supprimés définitivement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault()
                if (!deleteTarget) return
                await deleteProject(deleteTarget.id)
                setDeleteTarget(null)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renommer le projet</DialogTitle>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nom du projet"
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Annuler
            </Button>
            <Button onClick={handleRename} disabled={!newName.trim()}>
              Renommer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
