import { useState, useEffect } from 'react'
import { useParams, useNavigate, useBlocker } from 'react-router-dom'
import { toast } from 'sonner'
import type { Article, Project, Template } from '@shared/types'
import { useUIStore, useProjectsStore } from '@/stores'
import {
  Button,
  ScrollArea,
  Separator,
  Badge,
  Tabs, TabsContent, TabsList, TabsTrigger,
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui'
import {
  ArrowLeft,
  Save,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Download
} from 'lucide-react'
import { ArticleForm } from './ArticleForm'
import { TranscriptionModal } from './TranscriptionModal'
import { UnsavedChangesModal } from './UnsavedChangesModal'
import { ArticlesTable } from './ArticlesTable'
import { ExportModal, ExportFormat } from './ExportModal'

// Core viewer
import { Viewer, SpecialZoomLevel } from '@react-pdf-viewer/core';

// Plugins
import { toolbarPlugin } from '@react-pdf-viewer/toolbar';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css'



export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [articles, setArticles] = useState<Article[]>([])
  const [savedArticles, setSavedArticles] = useState<Article[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [currentPdfSrc, setCurrentPdfSrc] = useState<string | null>(null)
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null)
  const [bulkDeleteIndices, setBulkDeleteIndices] = useState<number[] | null>(null)
  const [bulkTranscribeProgress, setBulkTranscribeProgress] = useState<{ current: number; total: number } | null>(null)
  const [template, setTemplate] = useState<Template | null>(null)
  const [activeTab, setActiveTab] = useState('editor')
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportArticles, setExportArticles] = useState<Article[]>([])  // Articles to export

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
  };

  // Detect unsaved changes
  const hasUnsavedChanges = JSON.stringify(articles) !== JSON.stringify(savedArticles)
  const blocker = useBlocker(hasUnsavedChanges && !loading)

  // UI Store pour la fermeture de fenêtre
  const { setHasUnsavedChanges, setOnSaveCallback } = useUIStore()
  const { updateProject } = useProjectsStore()

  // Synchroniser le dirty state avec le uiStore pour la fermeture de fenêtre
  useEffect(() => {
    setHasUnsavedChanges(hasUnsavedChanges)
    return () => setHasUnsavedChanges(false)
  }, [hasUnsavedChanges, setHasUnsavedChanges])

  const currentArticle = articles[currentIndex]

  useEffect(() => {
    if (projectId) {
      loadProject()
    }
  }, [projectId])

  useEffect(() => {
    if (projectId && currentArticle?.imagePath) {
      window.api.getPdfFile(projectId, currentArticle.imagePath)
        .then(setCurrentPdfSrc)
        .catch(() => setCurrentPdfSrc(null))
    } else {
      setCurrentPdfSrc(null)
    }
  }, [projectId, currentArticle?.imagePath])

  const loadProject = async () => {
    if (!projectId) return

    setLoading(true)
    const proj = await window.api.getProject(projectId)
    setProject(proj)

    // Charger le template du projet
    if (proj?.templateId) {
      const tmpl = await window.api.getTemplate(proj.templateId)
      setTemplate(tmpl)
    }

    const data = await window.api.loadExtraction(projectId)
    console.log('Loaded data:', data)
    if (data?.articles) {
      setArticles(data.articles)
      setSavedArticles(data.articles)
    }

    setLoading(false)
  }

  const updateArticle = (fieldId: string, value: string) => {
    setArticles(prev => prev.map((article, idx) =>
      idx === currentIndex ? {
        ...article,
        fields: { ...article.fields, [fieldId]: value }
      } : article
    ))
  }

  const saveProgress = async () => {
    if (!projectId || !template) return

    setSaving(true)
    await window.api.saveExtraction(projectId, { articles })

    // Calculer les champs remplis en fonction du template
    const totalFieldsPerArticle = template.fields.length
    const filledFields = articles.reduce((acc, article) => {
      return acc + template.fields.filter(f => article.fields?.[f.name]).length
    }, 0)

    await updateProject(projectId, {
      status: filledFields === articles.length * totalFieldsPerArticle ? 'completed' : 'in_progress',
      filledFields,
      totalFields: articles.length * totalFieldsPerArticle
    })

    setSavedArticles(articles)
    setSaving(false)
  }

  // Définir le callback de sauvegarde pour la fermeture de fenêtre
  useEffect(() => {
    setOnSaveCallback(saveProgress)
    return () => setOnSaveCallback(null)
  }, [projectId, articles])

  const transcribeArticle = async () => {
    await transcribeArticleAt(currentIndex)
  }

  const transcribeArticleAt = async (index: number): Promise<boolean> => {
    const article = articles[index]
    if (!projectId || !article?.imagePath || !template) return false

    setTranscribing(true)
    const settings = await window.api.getSettings()
    const result = await window.api.transcribe(projectId, article.imagePath, settings.ai, template)

    if (result.success && result.data) {
      setArticles(prev => prev.map((a, idx) =>
        idx === index ? {
          ...a,
          fields: { ...a.fields, ...result.data!.fields }
        } : a
      ))
      setTranscribing(false)
      return true
    } else {
      // Show error to user
      toast.error(result.error || 'Erreur lors de la transcription')
      setTranscribing(false)
      return false
    }
  }

  const deleteArticle = (index: number) => {
    setArticles(prev => prev.filter((_, idx) => idx !== index))
    // Ajuster l'index courant si nécessaire
    if (currentIndex >= index && currentIndex > 0) {
      setCurrentIndex(prev => prev - 1)
    }
    setDeleteConfirmIndex(null)
  }

  const bulkTranscribe = async (indices: number[]) => {
    if (!projectId || !template) return

    setTranscribing(true)
    setBulkTranscribeProgress({ current: 0, total: indices.length })
    const settings = await window.api.getSettings()

    let successCount = 0
    let errorCount = 0
    let lastError = ''

    for (let i = 0; i < indices.length; i++) {
      const index = indices[i]
      const article = articles[index]
      if (!article?.imagePath) continue

      const result = await window.api.transcribe(projectId, article.imagePath, settings.ai, template)

      if (result.success && result.data) {
        setArticles(prev => prev.map((a, idx) =>
          idx === index ? {
            ...a,
            fields: { ...a.fields, ...result.data!.fields }
          } : a
        ))
        successCount++
      } else {
        errorCount++
        lastError = result.error || 'Erreur inconnue'
      }

      // Mettre à jour la progression après chaque article terminé
      setBulkTranscribeProgress({ current: i + 1, total: indices.length })

      // Pause entre chaque appel pour éviter rate limiting
      if (i < indices.length - 1) {
        await new Promise(r => setTimeout(r, 500))
      }
    }

    setBulkTranscribeProgress(null)
    setTranscribing(false)

    // Show summary toast
    if (errorCount === 0) {
      toast.success(`${successCount} article${successCount > 1 ? 's' : ''} transcrit${successCount > 1 ? 's' : ''}`)
    } else if (successCount === 0) {
      toast.error(`Échec de la transcription: ${lastError}`)
    } else {
      toast.warning(`${successCount} réussi${successCount > 1 ? 's' : ''}, ${errorCount} échec${errorCount > 1 ? 's' : ''}: ${lastError}`)
    }
  }

  const confirmBulkDelete = (indices: number[]) => {
    setBulkDeleteIndices(indices)
  }

  const executeBulkDelete = () => {
    if (!bulkDeleteIndices) return

    const indices = bulkDeleteIndices
    // Trier en ordre décroissant pour supprimer de la fin vers le début
    const sortedIndices = [...indices].sort((a, b) => b - a)

    setArticles(prev => prev.filter((_, idx) => !indices.includes(idx)))

    // Ajuster l'index courant
    const deletedBefore = sortedIndices.filter(i => i < currentIndex).length
    if (deletedBefore > 0) {
      setCurrentIndex(prev => Math.max(0, prev - deletedBefore))
    } else if (indices.includes(currentIndex)) {
      setCurrentIndex(0)
    }

    setBulkDeleteIndices(null)
  }

  // Export avec articles dynamiques (single ou batch)
  const handleExport = async (format: ExportFormat) => {
    if (!projectId || exportArticles.length === 0) return

    switch (format) {
      case 'pdf':
        await window.api.exportPdf(projectId, exportArticles)
        break
      case 'docx':
        await window.api.exportDocx(projectId, exportArticles)
        break
      case 'txt':
        await window.api.exportTxt(projectId, exportArticles)
        break
    }
  }

  // Ouvrir le modal d'export pour un seul article
  const openExportSingle = () => {
    if (!currentArticle) return
    setExportArticles([currentArticle])
    setExportModalOpen(true)
  }

  // Ouvrir le modal d'export pour plusieurs articles (batch depuis sommaire)
  const openExportBatch = (indices: number[]) => {
    const articlesToExport = indices.map(i => articles[i]).filter(Boolean)
    setExportArticles(articlesToExport)
    setExportModalOpen(true)
  }

  // Ouvrir le modal d'export pour tous les articles
  const openExportAll = () => {
    setExportArticles(articles)
    setExportModalOpen(true)
  }

  const getArticleCompletion = (article: Article) => {
    if (!template) return 0
    return template.fields.filter(f => article.fields?.[f.name]).length
  }

  const getTotalFields = () => {
    return template?.fields.length || 0
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      <TranscriptionModal open={transcribing} progress={bulkTranscribeProgress} />
      <ExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        onExport={handleExport}
      />

      {/* Bulk delete confirmation dialog */}
      <AlertDialog open={bulkDeleteIndices !== null} onOpenChange={(open) => !open && setBulkDeleteIndices(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {bulkDeleteIndices?.length} élement(s) ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Les élements sélectionnés seront définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single delete confirmation dialog */}
      <AlertDialog open={deleteConfirmIndex !== null} onOpenChange={(open) => !open && setDeleteConfirmIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'élement ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. L'élement sera définitivement supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmIndex !== null && deleteArticle(deleteConfirmIndex)}
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
          await saveProgress()
          blocker.proceed?.()
        }}
        onDiscard={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />

      {/* Header */}
      <header className="bg-card border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <h1 className="text-lg font-semibold">
            {project?.name || 'Éditeur'}
          </h1>
          <Badge variant="secondary">
            {articles.length} élément{articles.length > 1 ? 's' : ''}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={openExportAll}>
            <Download className="h-4 w-4 mr-2" />
            Exporter tout
          </Button>
          <Button onClick={saveProgress} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </Button>
        </div>
      </header>

      {/* Main content */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 flex overflow-hidden">
        {/* Image preview */}
        <ResizablePanel minSize={20} className="flex-1 bg-muted/30 flex flex-col overflow-hidden">
          {currentPdfSrc ? (
            <div className="flex flex-col h-full">
              
              {/* BARRE DE CONTROLE (SANS LES BOUTONS QUI SERVENT A RIEN) */}
              <div className=" border-b p-1">
                <Toolbar>
                  {(slots: any) => {
                    const { ZoomOut, Zoom, ZoomIn} = slots;
                    return (
                      <div className="flex items-center justify-center gap-4 h-8">                        
                        <div className="flex items-center gap-1">
                          <ZoomOut />
                          <div className="w-16"><Zoom /></div>
                          <ZoomIn />
                        </div>
                      </div>
                    );
                  }}
                </Toolbar>
              </div>

              {/* ZONE DU PDF */}
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
              <p>Aucun document chargé</p>
            </div>
          )}
        </ResizablePanel>
        <ResizableHandle />
        {/* Editor panel */}
        <ResizablePanel minSize={20} className="min-w-[375px] border-l bg-card flex flex-col h-full">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 h-full min-h-0">
            <TabsContent value="editor" className="flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden m-0">
              {/* Navigation */}
              <div className="p-4 border-b shrink-0">
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                    disabled={currentIndex === 0}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Précédent
                  </Button>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {currentIndex + 1} / {articles.length}
                    </Badge>
                    <Badge variant={getArticleCompletion(currentArticle) === getTotalFields() ? 'success' : 'secondary'}>
                      {getArticleCompletion(currentArticle)}/{getTotalFields()}
                    </Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentIndex(prev => Math.min(articles.length - 1, prev + 1))}
                    disabled={currentIndex === articles.length - 1}
                  >
                    Suivant
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
              <ArticleForm
                key={currentIndex}
                article={currentArticle}
                template={template}
                transcribing={transcribing}
                onUpdate={updateArticle}
                onTranscribe={transcribeArticle}
                onExport={openExportSingle}
              />
              </div>
            </TabsContent>
            <TabsContent value="summary" className="flex flex-col flex-1 min-h-0 data-[state=inactive]:hidden m-0">
              {/* Table of contents */}
              <div className="flex flex-col h-full">
                <div className="p-3 border-b">
                  <p className="text-sm font-medium">Table des matières</p>
                </div>
                <ScrollArea className="flex-1">
                  <ArticlesTable
                    articles={articles}
                    currentIndex={currentIndex}
                    totalFields={getTotalFields()}
                    onSelectArticle={(index) => {
                      setCurrentIndex(index)
                      setActiveTab('editor')
                    }}
                    onTranscribe={transcribeArticleAt}
                    onDelete={setDeleteConfirmIndex}
                    onBulkTranscribe={bulkTranscribe}
                    onBulkDelete={confirmBulkDelete}
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
