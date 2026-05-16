// v2 Editor page. Operates on string article IDs and reads from the v2
// filesystem-as-truth hierarchy.
import { useEffect, useMemo, useState } from 'react'
import { useBlocker, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import type {
  AIProvider,
  AISettings,
  ProjectView,
  TemplateField,
} from '@shared/types'
import { isFieldFilled } from '@shared/fieldValue'
import {
  selectV2CurrentArticle,
  selectV2CurrentFields,
  selectV2HasUnsavedChanges,
  useEditorStore,
  useTemplatesStore,
  useUIStore,
} from '@/stores'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  ScrollArea,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  ImageIcon,
  Save,
} from 'lucide-react'
import { findModel, getAvailableProviders } from '@/lib/aiModels'

import { Viewer, SpecialZoomLevel } from '@react-pdf-viewer/core'
import { toolbarPlugin } from '@react-pdf-viewer/toolbar'
import '@react-pdf-viewer/core/lib/styles/index.css'
import '@react-pdf-viewer/default-layout/lib/styles/index.css'

import { ArticleForm } from './ArticleForm'
import { ArticlesTableV2 } from './ArticlesTable'
import { ApplyTemplateDialog } from '@/components/ApplyTemplateDialog'

// Returns true when the two schema arrays match field-by-field by name/type/order.
const sameSchema = (a: TemplateField[], b: TemplateField[]): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const af = a[i], bf = b[i]
    if (af.name !== bf.name || af.type !== bf.type || af.order !== bf.order) return false
  }
  return true
}
import { TranscriptionModal } from '../Editor/TranscriptionModal'
import { ModelSelectionModal } from '../Editor/ModelSelectionModal'
import { UnsavedChangesModal } from '../Editor/UnsavedChangesModal'
import { ExportModal, ExportFormat } from '../Editor/ExportModal'

export function EditorV2Page() {
  const { projectId } = useParams<{ projectId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  // When the editor was opened from another page (e.g. /search), `state.from`
  // carries the URL to return to and `state.fromLabel` the button text. We
  // capture both on first mount only — subsequent `setSearchParams(...,
  // { replace: true })` calls (e.g. to strip the deep-link `?article=`)
  // clear `location.state`, so reading from it each render would lose the
  // info one frame in.
  const location = useLocation()
  const [navState] = useState(() => ({
    to: (location.state as { from?: string } | null)?.from ?? null,
    label: (location.state as { fromLabel?: string } | null)?.fromLabel ?? 'Projet',
  }))
  const backTo = navState.to
  const backLabel = navState.label

  const {
    articles,
    currentArticleId,
    drafts,
    loadScope,
    setCurrent,
    reset,
    updateField,
    saveAll,
    deleteArticle,
    transcribeArticle,
    applyTemplate,
  } = useEditorStore()

  const templates = useTemplatesStore((s) => s.templates)
  const loadTemplates = useTemplatesStore((s) => s.loadTemplates)

  const currentArticle = useEditorStore(selectV2CurrentArticle)
  const currentFields = useEditorStore(selectV2CurrentFields)
  const hasUnsavedChanges = useEditorStore(selectV2HasUnsavedChanges)

  const [project, setProject] = useState<ProjectView | null>(null)
  const [loading, setLoading] = useState(true)
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false)
  const [scopeLabel, setScopeLabel] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [bulkTranscribeProgress, setBulkTranscribeProgress] =
    useState<{ current: number; total: number } | null>(null)
  const [activeTab, setActiveTab] = useState('editor')
  const [currentPdfSrc, setCurrentPdfSrc] = useState<string | null>(null)
  const [copyingOcr, setCopyingOcr] = useState(false)

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null)

  // Model picker for transcription (single or bulk)
  const [pendingTranscribeIds, setPendingTranscribeIds] = useState<string[] | null>(null)
  const [defaultModelForModal, setDefaultModelForModal] = useState<string>('')
  const [availableProvidersForModal, setAvailableProvidersForModal] = useState<Set<AIProvider>>(
    new Set()
  )

  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportIds, setExportIds] = useState<string[]>([])

  const toolbarPluginInstance = toolbarPlugin()
  const { Toolbar } = toolbarPluginInstance
  const pageLayout = {
    transformSize: ({ size }: { size: any }) => ({
      height: size.height + 30,
      width: size.width + 30,
    }),
    buildPageStyles: () => ({
      alignItems: 'center',
      display: 'flex',
      justifyContent: 'center',
    }),
  }

  const blocker = useBlocker(hasUnsavedChanges && !loading)

  const { setHasUnsavedChanges, setOnSaveCallback } = useUIStore()

  useEffect(() => {
    setHasUnsavedChanges(hasUnsavedChanges)
    return () => setHasUnsavedChanges(false)
  }, [hasUnsavedChanges, setHasUnsavedChanges])

  // Initial load. Reads optional scope from query params:
  //   ?only=ID         → scope to a single article (no sidebar siblings)
  //   ?ids=ID1,ID2,... → scope to an arbitrary selection of articles
  //   ?dossier=ID      → scope to that dossier
  //   ?orphans=1       → scope to orphan elements (dossierId: null)
  //   (neither)        → entire project
  const dossierIdParam = searchParams.get('dossier')
  const orphansParam = searchParams.get('orphans') === '1'
  const onlyArticleParam = searchParams.get('only')
  const idsParam = searchParams.get('ids')

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const init = async () => {
      setLoading(true)
      const idList = idsParam ? idsParam.split(',').filter(Boolean) : null
      const scope = onlyArticleParam
        ? { articleId: onlyArticleParam }
        : idList && idList.length > 0
          ? { articleIds: idList }
          : dossierIdParam
            ? { dossierId: dossierIdParam }
            : orphansParam
              ? { dossierId: null }
              : undefined
      const [proj, , , dossier] = await Promise.all([
        window.api.v2_projectsGet(projectId),
        loadScope(projectId, scope),
        loadTemplates(),
        dossierIdParam ? window.api.v2_dossiersGet(projectId, dossierIdParam) : Promise.resolve(null),
      ])
      if (cancelled) return
      setProject(proj)

      if (onlyArticleParam) {
        const a = useEditorStore.getState().articles[0]
        const title = a ? (a.fields['Titre'] ?? a.fields['title'] ?? '').trim() : ''
        setScopeLabel(`Élément : ${title || 'Sans titre'}`)
      } else if (idList && idList.length > 0) {
        setScopeLabel('Sélection')
      } else if (dossierIdParam && dossier) {
        setScopeLabel(`Dossier : ${dossier.name}`)
      } else if (orphansParam) {
        setScopeLabel('Sans dossier')
      } else {
        setScopeLabel(null)
      }

      // Deep-link from search: open the requested article and strip the param.
      const requested = searchParams.get('article')
      if (requested) {
        const matches = useEditorStore.getState().articles.find((a) => a.id === requested)
        if (matches) setCurrent(matches.id)
        const next = new URLSearchParams(searchParams)
        next.delete('article')
        setSearchParams(next, { replace: true })
      }
      setLoading(false)
    }
    init()
    return () => {
      cancelled = true
      reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, dossierIdParam, orphansParam, onlyArticleParam, idsParam])

  // Load extract.pdf when current article changes
  useEffect(() => {
    if (!projectId || !currentArticleId) {
      setCurrentPdfSrc(null)
      return
    }
    window.api
      .v2_articlesGetExtractData(projectId, currentArticleId)
      .then(setCurrentPdfSrc)
      .catch(() => setCurrentPdfSrc(null))
  }, [projectId, currentArticleId])

  const handleSave = async () => {
    setSaving(true)
    await saveAll()
    setSaving(false)
  }

  useEffect(() => {
    setOnSaveCallback(handleSave)
    return () => setOnSaveCallback(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, drafts])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
        return
      }
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }
      if (!currentArticleId) return
      const idx = articles.findIndex((a) => a.id === currentArticleId)
      if (e.key === 'ArrowLeft' && idx > 0) setCurrent(articles[idx - 1].id)
      if (e.key === 'ArrowRight' && idx < articles.length - 1) setCurrent(articles[idx + 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articles, currentArticleId])

  const applyModelOverride = (ai: AISettings, modelOverride?: string): AISettings => {
    if (!modelOverride) return ai
    const found = findModel(modelOverride)
    if (!found) return { ...ai, model: modelOverride }
    return { ...ai, model: modelOverride, provider: found.provider }
  }

  const requestTranscribe = async (ids: string[]) => {
    if (ids.length === 0) return
    const settings = await window.api.getSettings()
    setDefaultModelForModal(settings.ai.model)
    setAvailableProvidersForModal(getAvailableProviders(settings.ai))
    setPendingTranscribeIds(ids)
  }

  const executePendingTranscribe = async (modelOverride: string) => {
    const ids = pendingTranscribeIds
    setPendingTranscribeIds(null)
    if (!ids || ids.length === 0) return
    const settings = await window.api.getSettings()
    const aiSettings = applyModelOverride(settings.ai, modelOverride)

    setTranscribing(true)
    let successCount = 0
    let errorCount = 0
    let lastError = ''
    if (ids.length > 1) setBulkTranscribeProgress({ current: 0, total: ids.length })

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      const result = await transcribeArticle(id, aiSettings)
      if (result.success) successCount++
      else {
        errorCount++
        lastError = result.error || 'Erreur inconnue'
      }
      if (ids.length > 1) setBulkTranscribeProgress({ current: i + 1, total: ids.length })
      if (i < ids.length - 1) await new Promise((r) => setTimeout(r, 500))
    }

    setBulkTranscribeProgress(null)
    setTranscribing(false)

    if (ids.length > 1) {
      if (errorCount === 0) {
        toast.success(`${successCount} élément${successCount > 1 ? 's' : ''} transcrit${successCount > 1 ? 's' : ''}`)
      } else if (successCount === 0) {
        toast.error(`Échec de la transcription: ${lastError}`)
      } else {
        toast.warning(`${successCount} réussi, ${errorCount} échec: ${lastError}`)
      }
    } else if (errorCount > 0) {
      toast.error(lastError)
    }
  }

  const handleCopyOcr = async () => {
    if (!projectId || !currentArticleId) return
    setCopyingOcr(true)
    try {
      // Extract the embedded text layer from the article's extract.pdf and
      // copy it to the clipboard. "OCR" is a misnomer kept for UI continuity
      // — this reads the text PyMuPDF already baked into the PDF at
      // extraction time, no Tesseract pass.
      const dataUrl = await window.api.v2_articlesGetExtractData(projectId, currentArticleId)
      if (!dataUrl) {
        toast.error('Aucun PDF généré pour cet élément')
        return
      }
      const pdfjsLib = await import('pdfjs-dist')
      const PdfWorker = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default
      pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker
      const base64 = dataUrl.split(',')[1] ?? ''
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const doc = await pdfjsLib.getDocument({ data: bytes }).promise
      const pageTexts: string[] = []
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p)
        const tc = await page.getTextContent()
        const text = tc.items
          .map((it) => ('str' in it ? it.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (text) pageTexts.push(text)
      }
      const full = pageTexts.join('\n\n')
      if (!full) {
        toast.error('Aucun texte sélectionnable dans ce PDF')
        return
      }
      await navigator.clipboard.writeText(full)
      toast.success('Texte du PDF copié')
    } catch (err) {
      console.error(err)
      toast.error('Erreur lors de la copie du texte')
    } finally {
      setCopyingOcr(false)
    }
  }

  const handleDeleteCurrent = async () => {
    if (!deleteConfirmId) return
    const wasLast = articles.length === 1
    await deleteArticle(deleteConfirmId)
    setDeleteConfirmId(null)
    if (wasLast && projectId) navigate(-1)
  }

  const handleBulkDelete = async () => {
    if (!bulkDeleteIds) return
    for (const id of bulkDeleteIds) {
      await deleteArticle(id)
    }
    setBulkDeleteIds(null)
    if (useEditorStore.getState().articles.length === 0 && projectId) {
      navigate(-1)
    }
  }

  const handleExport = async (format: ExportFormat) => {
    if (!projectId || exportIds.length === 0) return
    switch (format) {
      case 'pdf':
        await window.api.v2_exportArticlesPdf(projectId, exportIds)
        break
      case 'docx':
        await window.api.v2_exportArticlesDocx(projectId, exportIds)
        break
      case 'txt':
        await window.api.v2_exportArticlesTxt(projectId, exportIds)
        break
    }
  }

  const openExportSingle = () => {
    if (!currentArticleId) return
    setExportIds([currentArticleId])
    setExportModalOpen(true)
  }

  const openExportBatch = (ids: string[]) => {
    setExportIds(ids)
    setExportModalOpen(true)
  }

  const openExportAll = () => {
    setExportIds(articles.map((a) => a.id))
    setExportModalOpen(true)
  }

  // Per-article completion: each element has its own snapshot schema.
  const currentSchema: TemplateField[] = currentArticle?.schema ?? []
  const totalFields = currentSchema.length
  const currentCompletion = currentArticle
    ? currentSchema.filter((f) => isFieldFilled(f, currentArticle.fields?.[f.name])).length
    : 0

  // Find which template (if any) matches the current article's schema for
  // display in the form header. Exact match on field shape.
  const currentTemplateName = useMemo(() => {
    if (!currentArticle) return undefined
    const matched = templates.find((t) => sameSchema(t.fields, currentArticle.schema))
    return matched?.name ?? 'Personnalisé'
  }, [currentArticle, templates])

  const handleApplyTemplate = async (
    template: { fields: TemplateField[]; aiContext?: string },
    mergedFields: Record<string, string>
  ) => {
    if (!currentArticleId) return
    await applyTemplate(currentArticleId, template.fields, mergedFields, template.aiContext)
  }

  const currentIndex = currentArticleId
    ? articles.findIndex((a) => a.id === currentArticleId)
    : -1

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Projet introuvable</p>
        <Button onClick={() => navigate('/')}>Retour aux projets</Button>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      <TranscriptionModal open={transcribing} progress={bulkTranscribeProgress} />
      <ModelSelectionModal
        open={pendingTranscribeIds !== null}
        articleCount={pendingTranscribeIds?.length ?? 0}
        defaultModel={defaultModelForModal}
        availableProviders={availableProvidersForModal}
        onCancel={() => setPendingTranscribeIds(null)}
        onConfirm={executePendingTranscribe}
      />
      <ExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        onExport={handleExport}
        articleCount={exportIds.length}
      />

      {currentArticle && (
        <ApplyTemplateDialog
          open={applyTemplateOpen}
          onOpenChange={setApplyTemplateOpen}
          templates={templates}
          currentTemplateId={undefined}
          currentSchema={currentArticle.schema}
          currentFields={currentArticle.fields}
          onConfirm={handleApplyTemplate}
        />
      )}

      <AlertDialog open={!!bulkDeleteIds} onOpenChange={(open) => !open && setBulkDeleteIds(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {bulkDeleteIds?.length} élément(s) ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'élément ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCurrent}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UnsavedChangesModal
        open={blocker.state === 'blocked'}
        onSave={async () => {
          await handleSave()
          blocker.proceed?.()
        }}
        onDiscard={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />

      <header className="bg-card border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Prefer browser-style back: it restores the previous page's
              // scroll position natively (no custom state-save dance needed).
              // location.key === 'default' means we're on the first history
              // entry (deep link / Ctrl+R while in the editor) — there's
              // nowhere to go back, so fall back to a direct navigate.
              if (backTo) {
                navigate(backTo)
              } else if (location.key !== 'default') {
                navigate(-1)
              } else {
                navigate(`/project/${project.id}`)
              }
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {backTo ? backLabel : 'Projet'}
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex flex-col leading-tight">
            <h1 className="text-lg font-semibold">{project.name}</h1>
            {scopeLabel && (
              <span className="text-xs text-muted-foreground">{scopeLabel}</span>
            )}
          </div>
          {articles.length > 1 && (
            <Badge variant="secondary" className="tabular-nums">
              {currentIndex >= 0 ? currentIndex + 1 : 0} / {articles.length}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={openExportAll} disabled={articles.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Exporter tout
          </Button>
          <Button onClick={handleSave} disabled={saving || !hasUnsavedChanges}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </Button>
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1 flex overflow-hidden">
        <ResizablePanel minSize={20} className="flex-1 bg-muted/30 flex flex-col overflow-hidden">
          {currentPdfSrc ? (
            <div className="flex flex-col h-full">
              <div className="border-b p-1">
                <Toolbar>
                  {(slots: any) => {
                    const { ZoomOut, Zoom, ZoomIn } = slots
                    return (
                      <div className="flex items-center justify-center gap-4 h-8">
                        <div className="flex items-center gap-1">
                          <ZoomOut />
                          <div className="w-16"><Zoom /></div>
                          <ZoomIn />
                        </div>
                      </div>
                    )
                  }}
                </Toolbar>
              </div>
              <div className="flex-1 overflow-hidden">
                <Viewer
                  fileUrl={currentPdfSrc}
                  plugins={[toolbarPluginInstance]}
                  pageLayout={pageLayout}
                  defaultScale={SpecialZoomLevel.PageWidth}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <ImageIcon className="h-16 w-16 mb-4" />
              <p>Aucun élément sélectionné</p>
            </div>
          )}
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel minSize={20} className="min-w-[375px] border-l bg-card flex flex-col h-full">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 h-full min-h-0">
            <TabsContent value="editor" className="flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden m-0">
              <div className="p-4 border-b shrink-0">
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => currentIndex > 0 && setCurrent(articles[currentIndex - 1].id)}
                    disabled={currentIndex <= 0}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Précédent
                  </Button>
                  <Badge variant={currentCompletion === totalFields ? 'success' : 'secondary'}>
                    {currentCompletion}/{totalFields}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      currentIndex < articles.length - 1 && setCurrent(articles[currentIndex + 1].id)
                    }
                    disabled={currentIndex >= articles.length - 1}
                  >
                    Suivant
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                <ArticleForm
                  key={currentArticleId ?? 'none'}
                  fields={currentFields}
                  schema={currentSchema}
                  currentTemplateName={currentTemplateName}
                  transcribing={transcribing}
                  copyingOcr={copyingOcr}
                  onUpdate={(fieldName, value) =>
                    currentArticleId && updateField(currentArticleId, fieldName, value)
                  }
                  onTranscribe={() => currentArticleId && requestTranscribe([currentArticleId])}
                  onCopyOcr={handleCopyOcr}
                  onExport={openExportSingle}
                  onApplyTemplate={
                    currentArticleId && templates.length > 0
                      ? () => setApplyTemplateOpen(true)
                      : undefined
                  }
                />
              </div>
            </TabsContent>
            <TabsContent value="summary" className="flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden m-0">
              <div className="flex flex-col h-full">
                <div className="p-3 border-b">
                  <p className="text-sm font-medium">Éléments du projet</p>
                </div>
                <ScrollArea className="flex-1">
                  <ArticlesTableV2
                    articles={articles}
                    currentArticleId={currentArticleId}
                    draftIds={new Set(Object.keys(drafts))}
                    onSelectArticle={(id) => {
                      setCurrent(id)
                      setActiveTab('editor')
                    }}
                    onTranscribe={(id) => requestTranscribe([id])}
                    onDelete={setDeleteConfirmId}
                    onBulkTranscribe={(ids) => requestTranscribe(ids)}
                    onBulkDelete={setBulkDeleteIds}
                    onBulkExport={openExportBatch}
                  />
                </ScrollArea>
              </div>
            </TabsContent>
            <TabsList className="flex-shrink-0 p-7">
              <TabsTrigger value="editor">Editeur</TabsTrigger>
              <TabsTrigger value="summary">Sommaire</TabsTrigger>
            </TabsList>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
