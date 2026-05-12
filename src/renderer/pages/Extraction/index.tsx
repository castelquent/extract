import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useBlocker } from 'react-router-dom'
import type { Zone } from '@shared/types'
import {
  useExtractionStore,
  selectHasUnsavedChanges,
  useProjectsStore,
  useUIStore,
} from '@/stores'
import {
  Button,
  ScrollArea,
  Badge,
  Separator,
} from '@/components/ui'
import {
  ArrowLeft,
  FileImage,
  Layers,
  MousePointer2,
  ChevronLeft,
  ChevronRight,
  Square,
  Save,
  X,
} from 'lucide-react'
import { PdfViewer } from './PdfViewer'
import { ZonesOverlay } from './ZonesOverlay'
import { ArticleItem } from './ArticleItem'
import { ZoneItem } from './ZoneItem'
import { UnsavedChangesModal } from '../Editor/UnsavedChangesModal'

export function ExtractionPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const viewerContainerRef = useRef<HTMLDivElement>(null)
  const articleRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const scrollTargetRef = useRef<number | null>(null)

  // Project store
  const { currentProject: project, loadProject: loadProjectStore, updateProject } = useProjectsStore()

  // Extraction store
  const {
    articles,
    currentArticleId,
    selectedZoneIndex,
    currentPage,
    totalPages,
    loading,
    exporting,
    setCurrentPage,
    setTotalPages,
    loadExtraction,
    saveExtraction,
    exportImages,
    removeArticle,
    selectArticle,
    addZoneAsNewArticle,
    addZoneToArticle,
    updateZoneInArticle,
    removeZoneFromArticle,
    selectZoneInArticle,
    moveZone,
    reorderZones,
    reset,
  } = useExtractionStore()


  // PDF state (local, not in store)
  const [pdfLoaded, setPdfLoaded] = useState(false)
  const [pdfCanvas, setPdfCanvas] = useState<HTMLCanvasElement | null>(null)

  // Dirty state tracking
  const hasUnsavedChanges = useExtractionStore(selectHasUnsavedChanges)
  const blocker = useBlocker(hasUnsavedChanges && !loading)

  // UI Store pour la fermeture de fenêtre
  const { setHasUnsavedChanges, setOnSaveCallback } = useUIStore()

  // Synchroniser le dirty state avec le uiStore pour la fermeture de fenêtre
  useEffect(() => {
    setHasUnsavedChanges(hasUnsavedChanges)
    return () => setHasUnsavedChanges(false)
  }, [hasUnsavedChanges, setHasUnsavedChanges])

  useEffect(() => {
    if (projectId) {
      loadProjectData()
    }
    return () => reset()
  }, [projectId])

  const loadProjectData = async () => {
    if (!projectId) return

    await loadProjectStore(projectId)

    // Check if PDF exists
    const path = await window.api.getPdfPath(projectId)
    setPdfLoaded(!!path)

    await loadExtraction(projectId)
  }

  // Manual save
  const handleSave = async () => {
    if (!projectId) return
    const success = await saveExtraction(projectId)
    if (success && articles.length > 0) {
      // Update project status to extracting
      await updateProject(projectId, {
        status: 'extracting',
        articlesCount: articles.length,
      })
    }
  }

  // Définir le callback de sauvegarde pour la fermeture de fenêtre
  useEffect(() => {
    setOnSaveCallback(handleSave)
    return () => setOnSaveCallback(null)
  }, [projectId, articles.length])

  const handleExport = async () => {
    if (!projectId || articles.length === 0) return

    const success = await exportImages(projectId)
    if (success) {
      await updateProject(projectId, {
        status: 'extracted',
        articlesCount: articles.length,
      })
      navigate(`/editor/${projectId}`)
    }
  }

  // Zone management
  const handleZoneCreated = (zone: Zone) => {
    const activeArticleExists =
      currentArticleId !== null && articles.some((a) => a.id === currentArticleId)
    if (activeArticleExists) {
      scrollTargetRef.current = currentArticleId
      addZoneToArticle(currentArticleId!, zone)
    } else {
      const newId = articles.length > 0 ? Math.max(...articles.map((a) => a.id)) + 1 : 1
      scrollTargetRef.current = newId
      addZoneAsNewArticle(zone)
    }
  }

  // Auto-scroll the sidebar to the element that was just touched
  useEffect(() => {
    const target = scrollTargetRef.current
    if (target === null) return
    scrollTargetRef.current = null
    const el = articleRefs.current.get(target)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [articles])

  const activeArticle =
    currentArticleId !== null
      ? articles.find((a) => a.id === currentArticleId) ?? null
      : null

  // Navigation
  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1)
    }
  }

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1)
    }
  }

  // Jump to zone's page
  const jumpToZonePage = (zone: Zone, articleId: number, zoneIndex: number) => {
    setCurrentPage(zone.page)
    selectZoneInArticle(articleId, zoneIndex)
  }

  // Lock an article as the active target (without jumping). Navigation
  // is handled by clicking on a specific zone within the article.
  const jumpToArticle = (articleId: number) => {
    selectArticle(articleId)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S to save
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
      // Delete selected zone
      if (e.key === 'Delete' && currentArticleId !== null && selectedZoneIndex !== null) {
        removeZoneFromArticle(currentArticleId, selectedZoneIndex)
      }
      // Navigate pages with arrow keys
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && currentPage > 1) {
        setCurrentPage(currentPage - 1)
      }
      if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && currentPage < totalPages) {
        setCurrentPage(currentPage + 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentArticleId, selectedZoneIndex, removeZoneFromArticle, currentPage, totalPages, setCurrentPage, handleSave])

  // Select entire page as a zone
  const handleSelectEntirePage = () => {
    const fullPageZone: Zone = {
      page: currentPage,
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 1,
    }
    handleZoneCreated(fullPageZone)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <UnsavedChangesModal
        open={blocker.state === 'blocked'}
        onSave={async () => {
          await handleSave()
          blocker.proceed?.()
        }}
        onDiscard={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />

      {/* Header */}
      <header className="bg-card border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <h1 className="text-lg font-semibold">
            {project?.name || 'Extraction'}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Page navigation */}
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
            onClick={handleSave}
            disabled={articles.length === 0}
          >
            <Save className="h-4 w-4 mr-2" />
            Sauvegarder
          </Button>

          <Button
            onClick={handleExport}
            disabled={articles.length === 0 || exporting}
          >
            <FileImage className="h-4 w-4 mr-2" />
            {exporting ? 'Export en cours...' : 'Exporter les articles'}
          </Button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* PDF Viewer with selection canvas */}
        <div
          ref={viewerContainerRef}
          className="flex-1 bg-muted/30 relative overflow-hidden flex items-center justify-center"
        >
          {projectId && (
            <PdfViewer
              projectId={projectId}
              currentPage={currentPage}
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

          {/* Instructions overlay (first-run only) */}
          {pdfLoaded && articles.length === 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg border">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <MousePointer2 className="h-4 w-4" />
                Dessinez un rectangle sur le PDF pour créer votre premier élément
              </p>
            </div>
          )}

          {/* Select entire page button */}
          {pdfLoaded && (
            <Button
              variant="secondary"
              size="sm"
              className="absolute bottom-4 right-4 shadow-lg"
              onClick={handleSelectEntirePage}
            >
              <Square className="h-4 w-4 mr-2" />
              Sélectionner toute la page
            </Button>
          )}
        </div>

        {/* Sidebar - Articles list with DnD */}
        <aside className="w-80 border-l bg-card flex flex-col overflow-hidden">
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Élements
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
                    Sélectionnez des zones sur le PDF pour créer des élements.
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
                        onSelect={() => jumpToArticle(article.id)}
                        onRemove={() => removeArticle(article.id)}
                        onReorderZones={(fromIndex, toIndex) => reorderZones(article.id, fromIndex, toIndex)}
                      >
                        {article.zones.map((zone, zoneIndex) => (
                          <ZoneItem
                            key={`${article.id}-${zoneIndex}`}
                            zone={zone}
                            zoneIndex={zoneIndex}
                            articleId={article.id}
                            isSelected={currentArticleId === article.id && selectedZoneIndex === zoneIndex}
                            articles={articles}
                            onSelect={() => selectZoneInArticle(article.id, zoneIndex)}
                            onDelete={() => removeZoneFromArticle(article.id, zoneIndex)}
                            onMoveToArticle={(targetId) => moveZone(article.id, zoneIndex, targetId)}
                            onJumpToPage={() => jumpToZonePage(zone, article.id, zoneIndex)}
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
    </div>
  )
}
