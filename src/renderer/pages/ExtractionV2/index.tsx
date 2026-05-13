// v2 extraction page. Scoped to one Source inside a Project. The user draws
// zones on the source's PDF and groups them into articles; on "Generate", a
// dialog asks where the articles go (new dossier / existing / orphan).
import { useEffect, useRef, useState } from 'react'
import { useBlocker, useNavigate, useParams } from 'react-router-dom'
import type { Template, Zone } from '@shared/types'
import {
  selectHasUnsavedChanges,
  useExtractionStore,
  useProjectStore,
  useTemplatesStore,
  useUIStore,
} from '@/stores'
import { isArticleLocked } from '@/stores/extractionStore'
import type { WorkingArticle } from '@/stores/extractionStore'
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
  ScrollArea,
  Separator,
} from '@/components/ui'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileImage,
  Layers,
  MousePointer2,
  Save,
  Square,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { ApplyTemplateDialog } from '@/components/ApplyTemplateDialog'
import { PdfViewer } from '../Extraction/PdfViewer'
import { ZonesOverlay } from '../Extraction/ZonesOverlay'
import { ArticleItem } from '../Extraction/ArticleItem'
import { ZoneItem } from '../Extraction/ZoneItem'
import { UnsavedChangesModal } from '../Editor/UnsavedChangesModal'
import { GenerateDialog } from './GenerateDialog'

export function ExtractionV2Page() {
  const { projectId, sourceId } = useParams<{ projectId: string; sourceId: string }>()
  const navigate = useNavigate()
  const viewerContainerRef = useRef<HTMLDivElement>(null)
  const articleRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const scrollTargetRef = useRef<number | null>(null)

  const {
    project,
    sources,
    dossiers,
    loadProject,
    reset: resetProject,
  } = useProjectStore()

  const {
    articles,
    currentArticleId,
    selectedZoneIndex,
    currentPage,
    totalPages,
    exporting,
    setCurrentPage,
    setTotalPages,
    removeArticle,
    selectArticle,
    addZoneAsNewArticle,
    addZoneToArticle,
    updateZoneInArticle,
    removeZoneFromArticle,
    selectZoneInArticle,
    moveZone,
    reorderZones,
    updateArticle,
    unlockArticle,
    setDefaultTemplate,
    reset: resetExtraction,
    hydrateFromSource,
    saveArticles,
    generateArticles,
  } = useExtractionStore()

  const templates = useTemplatesStore((s) => s.templates)
  const loadTemplates = useTemplatesStore((s) => s.loadTemplates)

  const [pdfCanvas, setPdfCanvas] = useState<HTMLCanvasElement | null>(null)
  const [pdfLoaded, setPdfLoaded] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [unlockTarget, setUnlockTarget] = useState<WorkingArticle | null>(null)
  const [changeModelTarget, setChangeModelTarget] = useState<WorkingArticle | null>(null)

  const ZOOM_MIN = 1
  const ZOOM_MAX = 5
  const ZOOM_STEP = 0.25

  useEffect(() => {
    setZoomLevel(1)
  }, [currentPage])

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      const container = viewerContainerRef.current
      if (!container) return
      const target = e.target as Node | null
      if (!target || !container.contains(target)) return
      e.preventDefault()
      const delta = -e.deltaY * 0.005
      setZoomLevel((z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, +(z + delta).toFixed(2))))
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  // Load project + templates list on mount. Hydration of existing v2
  // articles happens once both are ready.
  useEffect(() => {
    if (!projectId) return
    loadProject(projectId)
    loadTemplates()
    return () => {
      resetProject()
      resetExtraction()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // Hydrate working buffer from existing v2 articles for this source, once
  // templates are loaded (so we can attach a templateId for the UI label).
  const hydratedKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!projectId || !sourceId || templates.length === 0) return
    const key = `${projectId}:${sourceId}`
    if (hydratedKeyRef.current === key) return
    hydratedKeyRef.current = key
    hydrateFromSource(projectId, sourceId, templates)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sourceId, templates])

  // Seed the store's default model (used by addZoneAsNewArticle) once we
  // know both the project's defaultTemplateId and the templates list.
  useEffect(() => {
    if (!project || templates.length === 0) return
    const defaultTpl =
      templates.find((t) => t.id === project.defaultTemplateId) ??
      templates.find((t) => t.id === 'press-article') ??
      templates[0]
    if (!defaultTpl) return
    setDefaultTemplate(defaultTpl.id, defaultTpl.fields, defaultTpl.aiContext)
  }, [project, templates, setDefaultTemplate])

  const handleTemplateChange = (articleId: number, template: Template) => {
    updateArticle(articleId, {
      templateId: template.id,
      schema: template.fields,
      aiContext: template.aiContext,
    })
  }

  useEffect(() => {
    setPdfLoaded(!!sourceId)
  }, [sourceId])

  const hasUnsavedChanges = useExtractionStore(selectHasUnsavedChanges)
  const blocker = useBlocker(hasUnsavedChanges && !exporting)
  const { setHasUnsavedChanges } = useUIStore()
  useEffect(() => {
    setHasUnsavedChanges(hasUnsavedChanges)
    return () => setHasUnsavedChanges(false)
  }, [hasUnsavedChanges, setHasUnsavedChanges])

  const source = sources.find((s) => s.id === sourceId) ?? null
  const defaultDossierName = source
    ? source.originalFilename.replace(/\.[^.]+$/, '')
    : 'Nouveau dossier'

  const handleZoneCreated = (zone: Zone) => {
    const activeArticle =
      currentArticleId !== null ? articles.find((a) => a.id === currentArticleId) ?? null : null
    // Locked active element → never append; spawn a fresh one instead.
    if (activeArticle && !isArticleLocked(activeArticle)) {
      scrollTargetRef.current = activeArticle.id
      addZoneToArticle(activeArticle.id, zone)
    } else {
      const newId = articles.length > 0 ? Math.max(...articles.map((a) => a.id)) + 1 : 1
      scrollTargetRef.current = newId
      addZoneAsNewArticle(zone)
    }
  }

  useEffect(() => {
    const target = scrollTargetRef.current
    if (target === null) return
    scrollTargetRef.current = null
    articleRefs.current.get(target)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [articles])

  const activeArticle =
    currentArticleId !== null ? articles.find((a) => a.id === currentArticleId) ?? null : null

  const goToPrevPage = () => currentPage > 1 && setCurrentPage(currentPage - 1)
  const goToNextPage = () => currentPage < totalPages && setCurrentPage(currentPage + 1)
  const handleZoomIn = () => setZoomLevel((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))
  const handleZoomOut = () => setZoomLevel((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl/Cmd+S → save current state without generating PDFs
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        saveArticles()
        return
      }
      if (e.key === 'Delete' && currentArticleId !== null && selectedZoneIndex !== null) {
        removeZoneFromArticle(currentArticleId, selectedZoneIndex)
      }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && currentPage > 1) {
        setCurrentPage(currentPage - 1)
      }
      if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && currentPage < totalPages) {
        setCurrentPage(currentPage + 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [currentArticleId, selectedZoneIndex, removeZoneFromArticle, currentPage, totalPages, setCurrentPage, saveArticles])

  const handleSelectEntirePage = () => {
    handleZoneCreated({ page: currentPage, x1: 0, y1: 0, x2: 1, y2: 1 })
  }

  // Number of orphan 'new' articles needing a dossier choice at Generate time.
  // (Persisted articles already in a dossier keep their place.)
  const orphanNewCount = articles.filter(
    (a) =>
      (a.persistedDossierId === null || a.persistedDossierId === undefined) &&
      a.persistedStatus !== 'extracted' &&
      a.persistedStatus !== 'transcribed'
  ).length

  // Working articles never saved yet (no persistedId) — they'll be created
  // as orphan 'new' at Save time, so they also need a dossier choice on Generate.
  const unsavedNewCount = articles.filter((a) => !a.persistedId).length

  const handleGenerateClick = async () => {
    if (!projectId || !sourceId) return
    // If there are unsaved new articles OR orphan-new persisted, ask dossier.
    if (orphanNewCount > 0 || unsavedNewCount > 0) {
      setGenerateOpen(true)
      return
    }
    // Otherwise just regen (modifications on existing dossiered articles).
    const ok = await generateArticles(null)
    if (ok) navigate(`/project/${projectId}`)
  }

  const handleConfirmGenerate = async (target: {
    choice: 'new-dossier' | 'existing-dossier' | 'no-dossier'
    newDossierName?: string
    existingDossierId?: string
  }) => {
    if (!projectId || !sourceId) return
    let dossierId: string | null = null
    if (target.choice === 'new-dossier' && target.newDossierName) {
      const dossier = await window.api.v2_dossiersCreate(projectId, target.newDossierName)
      if (!dossier) return
      dossierId = dossier.id
    } else if (target.choice === 'existing-dossier' && target.existingDossierId) {
      dossierId = target.existingDossierId
    }
    const ok = await generateArticles(dossierId)
    if (ok) navigate(`/project/${projectId}`)
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <UnsavedChangesModal
        open={blocker.state === 'blocked'}
        onSave={async () => {
          await saveArticles()
          blocker.proceed?.()
        }}
        onDiscard={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />

      <header className="bg-card border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate(`/project/${projectId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Projet
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div>
            <h1 className="text-base font-semibold leading-tight">{project.name}</h1>
            {source && (
              <p className="text-xs text-muted-foreground">{source.originalFilename}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {totalPages > 0 && (
            <div className="flex items-center gap-2 mr-4">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={goToPrevPage}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm min-w-[80px] text-center">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={goToNextPage}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          <Button
            variant="outline"
            onClick={saveArticles}
            disabled={!hasUnsavedChanges || exporting}
            title="Ctrl+S — persiste l'avancement sans générer les PDFs"
          >
            <Save className="h-4 w-4 mr-2" />
            Sauvegarder
          </Button>

          <Button
            onClick={handleGenerateClick}
            disabled={articles.length === 0 || exporting}
          >
            <FileImage className="h-4 w-4 mr-2" />
            {exporting ? 'Génération...' : 'Générer les éléments'}
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 bg-muted/30 relative">
          <div ref={viewerContainerRef} className="absolute inset-0 overflow-auto">
            <div className="min-w-full min-h-full grid place-items-center p-4">
              <div className="relative">
                {projectId && sourceId && (
                  <PdfViewer
                    projectId={projectId}
                    sourceId={sourceId}
                    currentPage={currentPage}
                    zoomLevel={zoomLevel}
                    onTotalPagesChange={setTotalPages}
                    onCanvasReady={setPdfCanvas}
                    containerRef={viewerContainerRef as React.RefObject<HTMLDivElement>}
                  />
                )}
                <ZonesOverlay
                  pdfCanvas={pdfCanvas}
                  currentPage={currentPage}
                  articles={articles}
                  currentArticleId={currentArticleId}
                  selectedZoneIndex={selectedZoneIndex}
                  onZoneCreated={handleZoneCreated}
                  onZoneUpdated={updateZoneInArticle}
                  onZoneDeleted={removeZoneFromArticle}
                  onZoneSelected={selectZoneInArticle}
                  onZoneMoveToArticle={moveZone}
                />
              </div>
            </div>
          </div>

          {pdfLoaded && (
            <div className="absolute top-4 right-4 flex items-center gap-1 bg-background/90 backdrop-blur-sm rounded-lg shadow-lg border p-1 z-10">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut} disabled={zoomLevel <= ZOOM_MIN}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-xs font-mono w-10 text-center select-none">
                {Math.round(zoomLevel * 100)}%
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn} disabled={zoomLevel >= ZOOM_MAX}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
          )}

          {pdfLoaded && articles.length === 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg border z-10">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <MousePointer2 className="h-4 w-4" />
                Dessinez un rectangle sur le PDF pour créer votre premier élément
              </p>
            </div>
          )}

          {pdfLoaded && (
            <Button
              variant="secondary"
              size="sm"
              className="absolute bottom-4 right-4 shadow-lg z-10"
              onClick={handleSelectEntirePage}
            >
              <Square className="h-4 w-4 mr-2" />
              Sélectionner toute la page
            </Button>
          )}
        </div>

        <aside className="w-80 border-l bg-card flex flex-col overflow-hidden">
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Éléments
              </h2>
              <Badge variant="outline">{articles.length}</Badge>
            </div>
            {activeArticle && (
              <Button
                variant="default"
                size="sm"
                className="w-full"
                onClick={() => selectArticle(null)}
              >
                <X className="h-4 w-4 mr-2" />
                Terminer l'élément en cours
              </Button>
            )}
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4">
              {articles.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                    <MousePointer2 className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Sélectionnez des zones sur le PDF pour créer des éléments.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {articles.map((article, index) => (
                    <ArticleItem
                      key={article.id}
                      article={article}
                      index={index}
                      isActive={currentArticleId === article.id}
                      setRef={(el) => {
                        if (el) articleRefs.current.set(article.id, el)
                        else articleRefs.current.delete(article.id)
                      }}
                      onSelect={() => selectArticle(article.id)}
                      onRemove={() => removeArticle(article.id)}
                      onReorderZones={(fromIndex, toIndex) =>
                        reorderZones(article.id, fromIndex, toIndex)
                      }
                      templates={templates}
                      onTemplateChange={(template) => handleTemplateChange(article.id, template)}
                      onChangeModelRequest={() => setChangeModelTarget(article)}
                      locked={isArticleLocked(article)}
                      onUnlockRequest={() => setUnlockTarget(article)}
                    >
                      {article.zones.map((zone, zoneIndex) => (
                        <ZoneItem
                          key={`${article.id}-${zoneIndex}`}
                          zone={zone}
                          zoneIndex={zoneIndex}
                          articleId={article.id}
                          isSelected={
                            currentArticleId === article.id && selectedZoneIndex === zoneIndex
                          }
                          articles={articles}
                          locked={isArticleLocked(article)}
                          onSelect={() => selectZoneInArticle(article.id, zoneIndex)}
                          onDelete={() => removeZoneFromArticle(article.id, zoneIndex)}
                          onMoveToArticle={(targetId) =>
                            moveZone(article.id, zoneIndex, targetId)
                          }
                          onJumpToPage={() => {
                            setCurrentPage(zone.page)
                            selectZoneInArticle(article.id, zoneIndex)
                          }}
                        />
                      ))}
                    </ArticleItem>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </aside>
      </div>

      <GenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        articleCount={articles.length}
        defaultDossierName={defaultDossierName}
        dossiers={dossiers}
        onConfirm={handleConfirmGenerate}
      />

      {changeModelTarget && (
        <ApplyTemplateDialog
          open={!!changeModelTarget}
          onOpenChange={(open) => !open && setChangeModelTarget(null)}
          templates={templates}
          currentTemplateId={changeModelTarget.templateId}
          currentSchema={changeModelTarget.schema}
          currentFields={changeModelTarget.fields}
          onConfirm={(template, mergedFields) => {
            updateArticle(changeModelTarget.id, {
              templateId: template.id,
              schema: template.fields,
              aiContext: template.aiContext,
              fields: mergedFields,
            })
          }}
        />
      )}

      <AlertDialog
        open={!!unlockTarget}
        onOpenChange={(open) => !open && setUnlockTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Déverrouiller cet élément ?</AlertDialogTitle>
            <AlertDialogDescription>
              Modifier les zones invalide le PDF extrait et la transcription. Les{' '}
              {unlockTarget
                ? Object.values(unlockTarget.fields).filter(
                    (v) => typeof v === 'string' && v.length > 0
                  ).length
                : 0}{' '}
              champ(s) déjà remplis seront supprimés. Cette action n'est appliquée définitivement
              qu'au prochain Sauvegarder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (unlockTarget) unlockArticle(unlockTarget.id)
                setUnlockTarget(null)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Déverrouiller et vider les champs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
