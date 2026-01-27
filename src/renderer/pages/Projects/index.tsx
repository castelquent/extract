import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Project } from '@shared/types'
import { useProjectsStore, selectExtractionProjects, selectTranscriptionProjects, selectCompletedProjects } from '@/stores'
import { ProjectCard } from './ProjectCard'
import { CreateProjectModal } from './CreateProjectModal'
import {
  Button,
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
} from '@/components/ui'
import { Plus, FolderOpen, Scissors, FileText, Home, CheckCircle, Upload } from 'lucide-react'
import { toast } from 'sonner'

export type ProjectFilter = 'all' | 'extraction' | 'transcription' | 'completed'

interface ProjectsPageProps {
  filter?: ProjectFilter
}

const filterConfig: Record<ProjectFilter, { title: string; subtitle: string; icon: React.ElementType; emptyMessage: string }> = {
  all: {
    title: 'Tous les projets',
    subtitle: 'Vue d\'ensemble de tous vos projets',
    icon: Home,
    emptyMessage: 'Aucun projet',
  },
  extraction: {
    title: 'Extraction',
    subtitle: 'Projets à extraire',
    icon: Scissors,
    emptyMessage: 'Aucun projet à extraire',
  },
  transcription: {
    title: 'Transcription',
    subtitle: 'Projets à transcrire',
    icon: FileText,
    emptyMessage: 'Aucun projet à transcrire',
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
  const { projects, loading, createProject, deleteProject, duplicateProject, updateProject } = useProjectsStore()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [renameTarget, setRenameTarget] = useState<Project | null>(null)
  const [newName, setNewName] = useState('')

  const filteredProjects = useMemo(() => {
    const state = { projects } as any
    switch (filter) {
      case 'extraction':
        return selectExtractionProjects(state)
      case 'transcription':
        return selectTranscriptionProjects(state)
      case 'completed':
        return selectCompletedProjects(state)
      default:
        return projects
    }
  }, [projects, filter])

  const config = filterConfig[filter]

  const handleCreateProject = async (name: string, templateId: string) => {
    const project = await createProject(name, templateId)
    if (project) {
      setShowCreateModal(false)
    }
  }

  const handleOpenProject = (project: Project) => {
    if (project.status === 'new' || project.status === 'extracting') {
      navigate(`/extraction/${project.id}`)
    } else {
      navigate(`/editor/${project.id}`)
    }
  }

  const handleExportZip = async (projectId: string) => {
    const success = await window.api.exportProjectZip(projectId)
    if (success) {
      toast.success('Projet exporté')
    }
  }

  const handleImportZip = async () => {
    const project = await window.api.importProjectZip()
    if (project) {
      // Refresh projects list
      await useProjectsStore.getState().loadProjects()
      toast.success('Projet importé')
    }
  }

  const handleRename = async () => {
    if (!renameTarget || !newName.trim()) return
    const success = await updateProject(renameTarget.id, { name: newName.trim() })
    if (success) {
      toast.success('Projet renommé')
    }
    setRenameTarget(null)
    setNewName('')
  }

  const openRenameDialog = (project: Project) => {
    setRenameTarget(project)
    setNewName(project.name)
  }

  const Icon = config.icon

  return (
    <div className="min-h-screen p-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Icon className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">{config.title}</h1>
            <p className="text-muted-foreground text-sm">{config.subtitle}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleImportZip}>
            <Upload className="h-4 w-4 mr-2" />
            Importer
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau projet
          </Button>
        </div>
      </header>

      {/* Projects Grid */}
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
          {filteredProjects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => handleOpenProject(project)}
              onDelete={() => setDeleteTarget(project)}
              onDuplicate={() => duplicateProject(project.id)}
              onExportZip={() => handleExportZip(project.id)}
              onRename={() => openRenameDialog(project)}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      <CreateProjectModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onCreate={handleCreateProject}
      />

      {/* Delete Confirmation */}
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

      {/* Rename Dialog */}
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
