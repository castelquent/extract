// Project detail page: shown when navigating to /project/:projectId.
// Header + tabs (Articles | Sources). Inside-project article/dossier/source
// management, multi-select bulk moves, etc.
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useProjectStore, useTemplatesStore } from '@/stores'
import { isFieldFilled } from '@shared/fieldValue'
import {
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui'
import { Download, FileText, FolderOpen, Settings } from 'lucide-react'
import { ArticlesView } from './ArticlesView'
import { SourcesView } from './SourcesView'
import { ExportModal, ExportFormat } from '../Editor/ExportModal'

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { project, articles, loadProject, loading, reset } = useProjectStore()
  const { templates, loadTemplates } = useTemplatesStore()
  // Tab lives in the URL (?tab=articles|sources) so back-nav from the
  // editor / extractor lands on whatever tab the user left from.
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: 'articles' | 'sources' = tabParam === 'sources' ? 'sources' : 'articles'
  const setTab = (v: 'articles' | 'sources') => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', v)
        return next
      },
      { replace: true }
    )
  }
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftTemplateId, setDraftTemplateId] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  // "Show only incomplete" filter for the articles list. Session-only.
  const [incompleteOnly, setIncompleteOnly] = useState(false)

  useEffect(() => {
    if (!projectId) return
    // Only reset + reload when the project actually changes. Same-project
    // remount (Editor → back) keeps the cached articles, so the page paints
    // at full height immediately — that's what lets the browser's native
    // scroll restoration (Chrome on navigate(-1)) land at the right Y.
    const currentId = useProjectStore.getState().project?.id
    if (currentId !== projectId) {
      reset()
      loadProject(projectId)
    }
  }, [projectId, loadProject, reset])

  useEffect(() => {
    if (templates.length === 0) loadTemplates()
  }, [templates.length, loadTemplates])

  // Only show the spinner on the initial load (project still null). Once
  // we have a project, subsequent refreshes (watcher-triggered after a
  // metadata write, e.g. a DnD reorder) keep the current UI on-screen so
  // it doesn't flash to "Chargement..." every time something is saved.
  if (!project) {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Chargement...</div>
        </div>
      )
    }
    return (
      <div className="p-8 flex flex-col items-center gap-4">
        <p className="text-muted-foreground">Projet introuvable</p>
        <Button onClick={() => navigate('/')}>Retour</Button>
      </div>
    )
  }

  const openSettings = () => {
    setDraftName(project.name)
    setDraftTemplateId(project.defaultTemplateId)
    setSettingsOpen(true)
  }
  const saveSettings = async () => {
    const name = draftName.trim()
    const patch: { name?: string; defaultTemplateId?: string } = {}
    if (name && name !== project.name) patch.name = name
    if (draftTemplateId && draftTemplateId !== project.defaultTemplateId) {
      patch.defaultTemplateId = draftTemplateId
    }
    if (Object.keys(patch).length > 0) {
      const ok = await window.api.v2_projectsUpdate(project.id, patch)
      if (ok) await loadProject(project.id)
    }
    setSettingsOpen(false)
  }

  // Group by dossier (in dossiers list order) then orphans, so the exported
  // document follows the same layout as the project page. Without this we'd
  // pass `articles.map(a => a.id)` which is sorted by per-dossier `order`
  // globally → interleaves dossiers.
  const handleExportAll = async (
    format: ExportFormat,
    choices: { includeDossierTitles: boolean }
  ) => {
    if (!project) return
    const { dossiers } = useProjectStore.getState()
    const compare = (a: typeof articles[number], b: typeof articles[number]) => {
      const ao = typeof a.order === 'number' ? a.order : Number.POSITIVE_INFINITY
      const bo = typeof b.order === 'number' ? b.order : Number.POSITIVE_INFINITY
      if (ao !== bo) return ao - bo
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    }
    const ids: string[] = []
    const dossierTitles: { beforeArticleId: string; title: string }[] = []
    for (const d of dossiers) {
      const group = articles.filter((a) => a.dossierId === d.id).sort(compare)
      if (group.length === 0) continue
      if (choices.includeDossierTitles) {
        dossierTitles.push({ beforeArticleId: group[0].id, title: d.name })
      }
      for (const a of group) ids.push(a.id)
    }
    const orphans = articles.filter((a) => a.dossierId === null).sort(compare)
    if (orphans.length > 0) {
      if (choices.includeDossierTitles) {
        dossierTitles.push({ beforeArticleId: orphans[0].id, title: 'Sans dossier' })
      }
      for (const a of orphans) ids.push(a.id)
    }
    if (ids.length === 0) return
    const options = choices.includeDossierTitles ? { dossierTitles } : undefined
    switch (format) {
      case 'pdf':
        await window.api.v2_exportArticlesPdf(project.id, ids, options)
        break
      case 'docx':
        await window.api.v2_exportArticlesDocx(project.id, ids, options)
        break
      case 'txt':
        await window.api.v2_exportArticlesTxt(project.id, ids, options)
        break
    }
  }

  // Overall fill rate across ready articles' schemas — drafts have no
  // transcription yet so we exclude them.
  let fieldsFilled = 0
  let fieldsTotal = 0
  for (const a of articles) {
    if (a.status !== 'ready') continue
    const schema = a.schema ?? []
    fieldsTotal += schema.length
    fieldsFilled += schema.filter((f) => isFieldFilled(f, a.fields?.[f.name])).length
  }
  const fillPct = fieldsTotal > 0 ? Math.round((fieldsFilled / fieldsTotal) * 100) : 0

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="p-6 border-b shrink-0">
        <div className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center min-w-0 flex-1">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-6 p-0 ml-2"
              onClick={openSettings}
              title="Paramètres du projet"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-6 p-0"
              onClick={() => window.api.v2_projectsOpenFolder(project.id)}
              title="Ouvrir le dossier du projet"
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {project.articlesTotal > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/editor/${project.id}`)}
                title="Transcrire tout le projet"
              >
                <FileText className="h-4 w-4 mr-1" />
                Transcrire
              </Button>
            )}
            {project.articlesTotal > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportOpen(true)}
                title="Exporter tout le projet"
              >
                <Download className="h-4 w-4 mr-1" />
                Exporter
              </Button>
            )}
          </div>
        </div>
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as 'articles' | 'sources')}
        className="flex-1 min-h-0 flex flex-col"
      >
        <div className="border-b py-4 px-6 flex items-center justify-between gap-4 shrink-0">
          <TabsList className="bg-transparent p-0 h-auto gap-1">
            <TabsTrigger
              value="articles"
              className="gap-2 px-2.5 py-1 text-sm data-[state=active]:bg-muted data-[state=active]:shadow-none data-[state=inactive]:text-muted-foreground hover:text-foreground"
            >
              Éléments
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted-foreground/15 text-muted-foreground tabular-nums">
                {project.articlesTotal}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="sources"
              className="gap-2 px-2.5 py-1 text-sm data-[state=active]:bg-muted data-[state=active]:shadow-none data-[state=inactive]:text-muted-foreground hover:text-foreground"
            >
              Sources
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted-foreground/15 text-muted-foreground tabular-nums">
                {project.sourcesCount}
              </span>
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-4">
            {fieldsTotal > 0 && tab === 'articles' && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <Switch
                  checked={incompleteOnly}
                  onCheckedChange={setIncompleteOnly}
                  aria-label="Afficher uniquement les éléments incomplets"
                />
                <span>Incomplets seulement</span>
              </label>
            )}
            {fieldsTotal > 0 && (
              <div
                className="flex items-center gap-2"
                title={`${fieldsFilled} / ${fieldsTotal} champs remplis`}
              >
                <CircularProgress
                  value={fillPct}
                  size={28}
                  strokeWidth={3}
                  className="stroke-muted"
                  progressClassName="stroke-primary"
                />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {fillPct}%
                </span>
              </div>
            )}
          </div>
        </div>
        <TabsContent value="articles" className="flex-1 min-h-0 mt-0 overflow-hidden">
          <ArticlesView projectId={project.id} incompleteOnly={incompleteOnly} />
        </TabsContent>
        <TabsContent value="sources" className="flex-1 min-h-0 mt-0 overflow-y-auto">
          <SourcesView projectId={project.id} />
        </TabsContent>
      </Tabs>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paramètres du projet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="project-name">Nom</Label>
              <Input
                id="project-name"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && saveSettings()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-template">Modèle par défaut</Label>
              <Select value={draftTemplateId} onValueChange={setDraftTemplateId}>
                <SelectTrigger id="project-template">
                  <SelectValue placeholder="Choisir un modèle" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Appliqué aux nouveaux éléments. Les éléments existants gardent leur modèle.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              Annuler
            </Button>
            <Button onClick={saveSettings} disabled={!draftName.trim()}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onExport={handleExportAll}
        articleCount={articles.length}
        showDossierTitleOption
      />
    </div>
  )
}
