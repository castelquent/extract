// Articles tab of ProjectDetail. Lists all articles in the project, grouped by
// dossier (collapsible), with a "Sans dossier" section. Supports multi-select
// + bulk actions (delete, move to dossier, move to project).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@/components/ui'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  FolderClosed,
  MoveRight,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { selectArticlesInDossier, selectOrphanArticles, useProjectStore } from '@/stores'
import type {
  ArticleMetadata,
  ArticleMoveTarget,
  ArticleStatus,
  DossierDeleteMode,
  DossierView,
} from '@shared/types'
import { MoveDialog } from './MoveDialog'

const statusBadge = (status: ArticleStatus): React.ReactNode => {
  if (status === 'new') return <Badge variant="info">Nouveau</Badge>
  if (status === 'extracted') return <Badge variant="warning">À transcrire</Badge>
  return <Badge variant="success">Transcrit</Badge>
}

function ArticleRow({
  article,
  selected,
  onToggle,
  onOpen,
  onDelete,
}: {
  article: ArticleMetadata
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  onDelete: () => void
}) {
  const title = (article.fields['Titre'] ?? article.fields['title'] ?? '').trim() || 'Sans titre'
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer group"
          onClick={onOpen}
        >
          <Checkbox
            checked={selected}
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
          />
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="flex-1 truncate text-sm">{title}</span>
          {statusBadge(article.status)}
          <span className="text-xs text-muted-foreground tabular-nums">
            {article.pages.length}p
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onOpen}>
          <FileText className="h-4 w-4 mr-2" />
          Ouvrir
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Supprimer
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function DossierSection({
  dossier,
  articles,
  selectedIds,
  toggleArticle,
  onOpenArticle,
  onDeleteArticle,
  onRenameDossier,
  onDeleteDossier,
}: {
  dossier: DossierView | null // null = orphans section
  articles: ArticleMetadata[]
  selectedIds: Set<string>
  toggleArticle: (id: string) => void
  onOpenArticle: (id: string) => void
  onDeleteArticle: (id: string) => void
  onRenameDossier?: (id: string) => void
  onDeleteDossier?: (id: string) => void
}) {
  const [open, setOpen] = useState(true)
  const label = dossier ? dossier.name : 'Sans dossier'

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-2">
      <div className="flex items-center gap-2 py-2 px-2 hover:bg-muted/30 rounded">
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 flex-1 text-left">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <FolderClosed className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{label}</span>
            <span className="text-xs text-muted-foreground">({articles.length})</span>
          </button>
        </CollapsibleTrigger>
        {dossier && onRenameDossier && (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onRenameDossier(dossier.id)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {dossier && onDeleteDossier && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => onDeleteDossier(dossier.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <CollapsibleContent>
        <div className="pl-6">
          {articles.length === 0 ? (
            <div className="text-xs text-muted-foreground py-1.5 px-2">Aucun élément</div>
          ) : (
            articles.map((a) => (
              <ArticleRow
                key={a.id}
                article={a}
                selected={selectedIds.has(a.id)}
                onToggle={() => toggleArticle(a.id)}
                onOpen={() => onOpenArticle(a.id)}
                onDelete={() => onDeleteArticle(a.id)}
              />
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ArticlesView({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const {
    dossiers,
    articles,
    createDossier,
    renameDossier,
    deleteDossier,
    deleteArticle,
    moveArticlesBulk,
  } = useProjectStore()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [newDossierOpen, setNewDossierOpen] = useState(false)
  const [newDossierName, setNewDossierName] = useState('')
  const [renameDossierId, setRenameDossierId] = useState<string | null>(null)
  const [renameDossierName, setRenameDossierName] = useState('')
  const [deleteDossierId, setDeleteDossierId] = useState<string | null>(null)
  const [deleteDossierMode, setDeleteDossierMode] =
    useState<DossierDeleteMode>('orphan-articles')
  const [moveOpen, setMoveOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  const orphanArticles = useMemo(
    () => articles.filter((a) => a.dossierId === null).sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    ),
    [articles]
  )

  void selectArticlesInDossier
  void selectOrphanArticles

  const toggleArticle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleOpenArticle = (id: string) => {
    navigate(`/editor/${projectId}?article=${id}`)
  }

  const handleDeleteArticle = (id: string) => {
    deleteArticle(id)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const handleCreateDossier = async () => {
    const created = await createDossier(newDossierName)
    if (created) {
      setNewDossierOpen(false)
      setNewDossierName('')
    }
  }

  const handleRenameDossier = async () => {
    if (!renameDossierId) return
    await renameDossier(renameDossierId, renameDossierName.trim())
    setRenameDossierId(null)
    setRenameDossierName('')
  }

  const startRenameDossier = (id: string) => {
    const d = dossiers.find((x) => x.id === id)
    if (!d) return
    setRenameDossierId(id)
    setRenameDossierName(d.name)
  }

  const handleDeleteDossier = async () => {
    if (!deleteDossierId) return
    await deleteDossier(deleteDossierId, deleteDossierMode)
    setDeleteDossierId(null)
  }

  const handleMoveConfirm = async (target: ArticleMoveTarget): Promise<void> => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    await moveArticlesBulk(ids, target)
    setSelectedIds(new Set())
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    for (const id of ids) {
      await deleteArticle(id)
    }
    setSelectedIds(new Set())
    setBulkDeleteOpen(false)
  }

  const totalArticles = articles.length
  const selectedCount = selectedIds.size

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {totalArticles} élément{totalArticles === 1 ? '' : 's'}
          {selectedCount > 0 && ` · ${selectedCount} sélectionné${selectedCount === 1 ? '' : 's'}`}
        </div>
        <div className="flex gap-2">
          {selectedCount > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={() => setMoveOpen(true)}>
                <MoveRight className="h-4 w-4 mr-1" />
                Déplacer
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Supprimer
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => setNewDossierOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nouveau dossier
          </Button>
        </div>
      </div>

      <div className="border rounded-md p-2">
        {dossiers.map((dossier) => (
          <DossierSection
            key={dossier.id}
            dossier={dossier}
            articles={articles
              .filter((a) => a.dossierId === dossier.id)
              .sort((a, b) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
              )}
            selectedIds={selectedIds}
            toggleArticle={toggleArticle}
            onOpenArticle={handleOpenArticle}
            onDeleteArticle={handleDeleteArticle}
            onRenameDossier={startRenameDossier}
            onDeleteDossier={(id) => {
              setDeleteDossierId(id)
              setDeleteDossierMode('orphan-articles')
            }}
          />
        ))}
        {orphanArticles.length > 0 && (
          <DossierSection
            dossier={null}
            articles={orphanArticles}
            selectedIds={selectedIds}
            toggleArticle={toggleArticle}
            onOpenArticle={handleOpenArticle}
            onDeleteArticle={handleDeleteArticle}
          />
        )}
        {totalArticles === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Aucun élément. Importez une source et extrayez-en des éléments depuis l'onglet Sources.
          </div>
        )}
      </div>

      <Dialog open={newDossierOpen} onOpenChange={setNewDossierOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau dossier</DialogTitle>
          </DialogHeader>
          <Input
            value={newDossierName}
            onChange={(e) => setNewDossierName(e.target.value)}
            placeholder="Nom du dossier"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleCreateDossier()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDossierOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreateDossier} disabled={!newDossierName.trim()}>
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameDossierId} onOpenChange={(open) => !open && setRenameDossierId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renommer le dossier</DialogTitle>
          </DialogHeader>
          <Input
            value={renameDossierName}
            onChange={(e) => setRenameDossierName(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleRenameDossier()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDossierId(null)}>
              Annuler
            </Button>
            <Button onClick={handleRenameDossier} disabled={!renameDossierName.trim()}>
              Renommer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteDossierId} onOpenChange={(open) => !open && setDeleteDossierId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le dossier ?</AlertDialogTitle>
            <AlertDialogDescription>
              Que faire des éléments contenus dans ce dossier ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={deleteDossierMode === 'orphan-articles'}
                onChange={() => setDeleteDossierMode('orphan-articles')}
                className="mt-1"
              />
              <span>
                <span className="font-medium">Garder les éléments</span>
                <span className="text-muted-foreground"> (ils deviendront orphelins dans le projet)</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={deleteDossierMode === 'delete-content'}
                onChange={() => setDeleteDossierMode('delete-content')}
                className="mt-1"
              />
              <span>
                <span className="font-medium text-destructive">Supprimer aussi les éléments</span>
              </span>
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDeleteDossier()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        currentProjectId={projectId}
        dossiers={dossiers}
        articleCount={selectedCount}
        onConfirm={handleMoveConfirm}
      />

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer {selectedCount} élément{selectedCount === 1 ? '' : 's'} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleBulkDelete()
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
