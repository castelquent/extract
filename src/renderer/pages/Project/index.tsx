// Placeholder for the ProjectDetail page. The real implementation lands in
// step 5 of the refactor.
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useProjectStore } from '@/stores'
import { Button } from '@/components/ui'
import { ArrowLeft } from 'lucide-react'

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { project, loadProject, loading, reset } = useProjectStore()

  useEffect(() => {
    if (!projectId) return
    loadProject(projectId)
    return () => reset()
  }, [projectId, loadProject, reset])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Chargement...</div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="p-8 flex flex-col items-center gap-4">
        <p className="text-muted-foreground">Projet introuvable</p>
        <Button onClick={() => navigate('/')}>Retour</Button>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Projets
        </Button>
      </div>
      <h1 className="text-2xl font-bold mb-2">{project.name}</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Page de détail en construction. Sources : {project.sourcesCount} · Dossiers :{' '}
        {project.dossiersCount} · Articles : {project.articlesTotal}
      </p>
    </div>
  )
}
