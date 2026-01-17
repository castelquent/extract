import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Project } from '@shared/types'
import { useProjectsStore, selectExtractionProjects, selectTranscriptionProjects } from '@/stores'
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
} from '@/components/ui'
import { Plus, FolderOpen, Scissors, FileText, Home } from 'lucide-react'

export type ProjectFilter = 'all' | 'extraction' | 'transcription'

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
}

export function ProjectsPage({ filter = 'all' }: ProjectsPageProps) {
  const navigate = useNavigate()
  const { projects, loading, createProject, deleteProject } = useProjectsStore()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)

  const filteredProjects = useMemo(() => {
    const state = { projects } as any
    switch (filter) {
      case 'extraction':
        return selectExtractionProjects(state)
      case 'transcription':
        return selectTranscriptionProjects(state)
      default:
        return projects
    }
  }, [projects, filter])

  const config = filterConfig[filter]

  const handleCreateProject = async (name: string) => {
    const project = await createProject(name)
    if (project) {
      setShowCreateModal(false)
    }
  }

  const handleDeleteProject = async () => {
    if (!deleteTarget) return
    await deleteProject(deleteTarget.id)
    setDeleteTarget(null)
  }

  const handleOpenProject = (project: Project) => {
    if (project.status === 'new' || project.status === 'extracting') {
      navigate(`/extraction/${project.id}`)
    } else {
      navigate(`/editor/${project.id}`)
    }
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
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nouveau projet
        </Button>
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
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
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
              onClick={(e) => {
                e.preventDefault()
                handleDeleteProject()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
