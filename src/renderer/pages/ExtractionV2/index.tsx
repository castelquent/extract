// v2 extraction page. Scoped to one Source inside a Project. The user draws
// zones on the source's PDF and groups them into articles; on "Generate", a
// dialog asks where the articles go (new dossier / existing / orphan).
import { useEffect, useRef, useState } from 'react'
import { useBlocker, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
  Lasso,
  Layers,
  Maximize2,
  MousePointer2,
  Save,
  Square,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { ApplyTemplateDialog } from '@/components/ApplyTemplateDialog'
import { PdfViewer } from '../Extraction/PdfViewer'
import { ZonesOverlay, type DrawingMode } from '../Extraction/ZonesOverlay'
import { ArticleItem } from '../Extraction/ArticleItem'
import { ZoneItem } from '../Extraction/ZoneItem'
import { UnsavedChangesModal } from '../Editor/UnsavedChangesModal'
import { GenerateDialog } from './GenerateDialog'

export function ExtractionV2Page() {
  const { t } = useTranslation(['extractor', 'common'])
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
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('rect')
  const [isDrafting, setIsDrafting] = useState(false)

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
  //
  // ⚠ We do NOT reset extractionStore on cleanup: React Strict Mode in dev
  // double-mounts the component. The cleanup runs, then the second mount
  // skips hydration because hydratedKeyRef (preserved across strict-mode
  // remounts) still matches the current key — leaving the session unbound.
  // The next hydrate call (real navigation to a different source) will
  // overwrite articles and re-bind the session, so persistence is correct.
  useEffect(() => {
    if (!projectId) return
    loadProject(projectId)
    loadTemplates()
    return () => {
      resetProject()
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
    : t('extractor:newDossierDefault')

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
    handleZoneCreated({ kind: 'rect', page: currentPage, x1: 0, y1: 0, x2: 1, y2: 1 })
  }

  // Number of orphan draft articles needing a dossier choice at Generate
  // time. (Persisted articles already in a dossier keep their place.)
  const orphanNewCount = articles.filter(
    (a) =>
      (a.persistedDossierId === null || a.persistedDossierId === undefined) &&
      a.persistedStatus !== 'ready'
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
    const ok = await generateArticles({ kind: 'no-dossier' })
    if (ok) navigate(-1)
  }

  const handleConfirmGenerate = async (target: {
    choice: 'new-dossier' | 'existing-dossier' | 'no-dossier'
    newDossierName?: string
    existingDossierId?: string
  }) => {
    if (!projectId || !sourceId) return
    // Pass the dossier intent to the store; it creates the dossier lazily
    // only if at least one orphan article is going to land in it. Prevents
    // leaking an empty dossier when nothing needs moving.
    const generateTarget =
      target.choice === 'new-dossier' && target.newDossierName
        ? ({ kind: 'new-dossier', name: target.newDossierName } as const)
        : target.choice === 'existing-dossier' && target.existingDossierId
          ? ({ kind: 'existing-dossier', dossierId: target.existingDossierId } as const)
          : ({ kind: 'no-dossier' } as const)
    const ok = await generateArticles(generateTarget)
    if (ok) navigate(-1)
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">{t('common:loading')}</p>
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
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('extractor:backToProject')}
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
            title={t('extractor:saveTitle')}
          >
            <Save className="h-4 w-4 mr-2" />
            {t('common:save')}
          </Button>

          <Button
            onClick={handleGenerateClick}
            disabled={articles.length === 0 || exporting}
          >
            <FileImage className="h-4 w-4 mr-2" />
            {exporting ? t('extractor:generating') : t('extractor:generate')}
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
                  drawingMode={drawingMode}
                  onZoneCreated={handleZoneCreated}
                  onZoneUpdated={updateZoneInArticle}
                  onZoneDeleted={removeZoneFromArticle}
                  onZoneSelected={selectZoneInArticle}
                  onZoneMoveToArticle={moveZone}
                  onDraftingChange={setIsDrafting}
                />
              </div>
            </div>
          </div>

          {pdfLoaded && (
            <div className="absolute top-4 left-4 flex flex-col items-center gap-1 bg-background/90 backdrop-blur-sm rounded-lg shadow-lg border p-1 z-10">
              <Button
                variant={drawingMode === 'rect' ? 'default' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => setDrawingMode('rect')}
                title={t('extractor:toolbar.rect')}
              >
                <Square className="h-4 w-4" />
              </Button>
              <Button
                variant={drawingMode === 'polygon' ? 'default' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => setDrawingMode('polygon')}
                title={t('extractor:toolbar.polygon')}
              >
                <Lasso className="h-4 w-4" />
              </Button>
              <div className="h-px w-6 bg-border my-0.5" />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleSelectEntirePage}
                title={t('extractor:toolbar.selectPage')}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          )}

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

          {pdfLoaded && articles.length === 0 && !isDrafting && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg border z-10">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <MousePointer2 className="h-4 w-4" />
                {drawingMode === 'rect' ? t('extractor:hint.rect') : t('extractor:hint.polygon')}
              </p>
            </div>
          )}
        </div>

        <aside className="w-80 border-l bg-card flex flex-col overflow-hidden">
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <Layers className="h-4 w-4" />
                {t('extractor:sidebar.title')}
              </h2>
              <Badge variant="outline">{articles.length}</Badge>
            </div>
            {activeArticle && (
              <>
                {isArticleLocked(activeArticle) && (
                  <div className="text-xs text-amber-700 dark:text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5">
                    {t('extractor:sidebar.lockedWarning')}
                  </div>
                )}
                <Button
                  variant="default"
                  size="sm"
                  className="w-full"
                  onClick={() => selectArticle(null)}
                >
                  <X className="h-4 w-4 mr-2" />
                  {isArticleLocked(activeArticle)
                    ? t('common:deselect')
                    : t('extractor:sidebar.endCurrent')}
                </Button>
              </>
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
                    {t('extractor:sidebar.emptyHint')}
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
            <AlertDialogTitle>{t('extractor:unlock.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const filledCount = unlockTarget
                  ? Object.values(unlockTarget.fields).filter(
                      (v) => typeof v === 'string' && v.length > 0
                    ).length
                  : 0
                if (filledCount > 0) {
                  return t('extractor:unlock.description_filled', { count: filledCount })
                }
                return t('extractor:unlock.description_empty')
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                if (unlockTarget) unlockArticle(unlockTarget.id)
                setUnlockTarget(null)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {unlockTarget &&
              Object.values(unlockTarget.fields).some(
                (v) => typeof v === 'string' && v.length > 0
              )
                ? t('extractor:unlock.submitFilled')
                : t('extractor:unlock.submitEmpty')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
