import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useBlocker } from 'react-router-dom'
import type { Article, Project } from '@shared/types'
import { useUIStore } from '@/stores'
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
  FileText,
  FileIcon,
  ChevronLeft,
  ChevronRight,
  ImageIcon
} from 'lucide-react'
import { ArticleForm } from './ArticleForm'
import { TranscriptionModal } from './TranscriptionModal'
import { UnsavedChangesModal } from './UnsavedChangesModal'
import { ArticlesTable } from './ArticlesTable'

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


  const toolbarPluginInstance = toolbarPlugin();
  const { Toolbar } = toolbarPluginInstance;

  const pageLayout = {
      // On ajoute 30px (ou ce que tu veux) à la boîte de chaque page
      transformSize: ({ size }: { size: any }) => ({
          height: size.height + 30,
          width: size.width + 30,
      }),
      // On centre la page dans cette boîte pour que la marge soit égale partout
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

    const data = await window.api.loadExtraction(projectId)
    console.log('Loaded data:', data)
    if (data?.articles) {
      setArticles(data.articles)
      setSavedArticles(data.articles)
    }

    setLoading(false)
  }

  const updateArticle = (field: keyof Article, value: string) => {
    setArticles(prev => prev.map((article, idx) =>
      idx === currentIndex ? { ...article, [field]: value } : article
    ))
  }

  const saveProgress = async () => {
    if (!projectId) return

    setSaving(true)
    await window.api.saveExtraction(projectId, { articles })

    const filledFields = articles.reduce((acc, article) => {
      return acc + (article.title ? 1 : 0) + (article.author ? 1 : 0) + (article.content ? 1 : 0)
    }, 0)

    await window.api.updateProject(projectId, {
      status: filledFields === articles.length * 3 ? 'completed' : 'in_progress',
      filledFields,
      totalFields: articles.length * 3
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

  const transcribeArticleAt = async (index: number) => {
    const article = articles[index]
    if (!projectId || !article?.imagePath) return

    setTranscribing(true)
    const settings = await window.api.getSettings()
    const result = await window.api.transcribe(projectId, article.imagePath, settings.ai)
    if (result.success && result.data) {
      setArticles(prev => prev.map((a, idx) =>
        idx === index ? {
          ...a,
          title: result.data!.title,
          author: result.data!.author,
          content: result.data!.content
        } : a
      ))
    }

    setTranscribing(false)
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
    if (!projectId) return

    setTranscribing(true)
    setBulkTranscribeProgress({ current: 0, total: indices.length })
    const settings = await window.api.getSettings()

    for (let i = 0; i < indices.length; i++) {
      const index = indices[i]
      const article = articles[index]
      if (!article?.imagePath) continue

      const result = await window.api.transcribe(projectId, article.imagePath, settings.ai)

      if (result.success && result.data) {
        setArticles(prev => prev.map((a, idx) =>
          idx === index ? {
            ...a,
            title: result.data!.title,
            author: result.data!.author,
            content: result.data!.content
          } : a
        ))
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

  const handleExport = async (format: 'pdf' | 'docx') => {
    if (!projectId) return

    if (format === 'pdf') {
      await window.api.exportPdf(projectId, articles)
    } else {
      await window.api.exportDocx(projectId, articles)
    }
  }

  const getArticleCompletion = (article: Article) => {
    const fields = [article.title, article.author, article.content]
    return fields.filter(Boolean).length
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

      {/* Bulk delete confirmation dialog */}
      <AlertDialog open={bulkDeleteIndices !== null} onOpenChange={(open) => !open && setBulkDeleteIndices(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {bulkDeleteIndices?.length} article(s) ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Les articles sélectionnés seront définitivement supprimés.
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
            <AlertDialogTitle>Supprimer l'article ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. L'article sera définitivement supprimé.
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
            {articles.length} article{articles.length > 1 ? 's' : ''}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport('pdf')}>
            <FileText className="h-4 w-4 mr-2" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('docx')}>
            <FileIcon className="h-4 w-4 mr-2" />
            DOCX
          </Button>
          <Separator orientation="vertical" className="h-6 mx-2" />
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
          <Tabs defaultValue="editor" className="flex flex-col flex-1 h-full min-h-0">
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
                    <Badge variant={getArticleCompletion(currentArticle) === 3 ? 'success' : 'secondary'}>
                      {getArticleCompletion(currentArticle)}/3
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
                transcribing={transcribing}
                onUpdate={updateArticle}
                onTranscribe={transcribeArticle}
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
                    onSelectArticle={setCurrentIndex}
                    onTranscribe={transcribeArticleAt}
                    onDelete={setDeleteConfirmIndex}
                    onBulkTranscribe={bulkTranscribe}
                    onBulkDelete={confirmBulkDelete}
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
