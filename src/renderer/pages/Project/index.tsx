// Project detail page: shown when navigating to /project/:projectId.
// Header + tabs (Articles | Sources). Inside-project article/dossier/source
// management, multi-select bulk moves, etc.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useProjectStore, useTemplatesStore } from '@/stores'
import {
  Button,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui'
import { ArrowLeft, FolderOpen, Pencil } from 'lucide-react'
import { ArticlesView } from './ArticlesView'
import { SourcesView } from './SourcesView'

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { project, loadProject, loading, reset } = useProjectStore()
  const { templates, loadTemplates } = useTemplatesStore()
  const [tab, setTab] = useState<'articles' | 'sources'>('articles')
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState('')

  useEffect(() => {
    if (!projectId) return
    loadProject(projectId)
    return () => reset()
  }, [projectId, loadProject, reset])

  useEffect(() => {
    if (templates.length === 0) loadTemplates()
  }, [templates.length, loadTemplates])

  if (loading || !project) {
    if (!loading && !project) {
      return (
        <div className="p-8 flex flex-col items-center gap-4">
          <p className="text-muted-foreground">Projet introuvable</p>
          <Button onClick={() => navigate('/')}>Retour</Button>
        </div>
      )
    }
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Chargement...</div>
      </div>
    )
  }

  const templateName = templates.find((t) => t.id === project.defaultTemplateId)?.name

  const startEditingName = () => {
    setDraftName(project.name)
    setEditingName(true)
  }
  const commitRename = async () => {
    const name = draftName.trim()
    if (name && name !== project.name) {
      const ok = await window.api.v2_projectsRename(project.id, name)
      if (ok) await loadProject(project.id)
    }
    setEditingName(false)
  }

  return (
    <div className="min-h-screen p-8">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Projets
        </Button>
      </div>

      <header className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          {editingName ? (
            <Input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setEditingName(false)
              }}
              className="text-2xl font-bold h-auto py-1"
            />
          ) : (
            <>
              <h1 className="text-2xl font-bold">{project.name}</h1>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={startEditingName}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {templateName && <span>Modèle : {templateName}</span>}
          <span>·</span>
          <span>{project.sourcesCount} source{project.sourcesCount === 1 ? '' : 's'}</span>
          <span>·</span>
          <span>{project.dossiersCount} dossier{project.dossiersCount === 1 ? '' : 's'}</span>
          <span>·</span>
          <span>{project.articlesTotal} élément{project.articlesTotal === 1 ? '' : 's'}</span>
          <span className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.api.v2_projectsOpenFolder(project.id)}
          >
            <FolderOpen className="h-4 w-4 mr-1" />
            Dossier
          </Button>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'articles' | 'sources')}>
        <TabsList>
          <TabsTrigger value="articles">Éléments</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
        </TabsList>
        <TabsContent value="articles" className="pt-4">
          <ArticlesView projectId={project.id} />
        </TabsContent>
        <TabsContent value="sources" className="pt-4">
          <SourcesView projectId={project.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
