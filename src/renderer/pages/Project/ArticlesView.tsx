// Articles tab of ProjectDetail. Lists all articles in the project, grouped by
// dossier (one section per dossier, plus a "Sans dossier" section). Supports
// multi-select + bulk actions (delete, move to dossier, move to project).
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
  useSidebar,
} from '@/components/ui'
import {
  FileText,
  MoveRight,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import { selectArticlesInDossier, selectOrphanArticles, useProjectStore } from '@/stores'
import type {
  ArticleMetadata,
  ArticleMoveTarget,
  DossierDeleteMode,
  DossierView,
} from '@shared/types'
import { MoveDialog } from './MoveDialog'

// Compute X/Y completion ratio from article.fields and article.schema.
// Returns a Badge: success when complete, secondary otherwise. Drafts are
// filtered out upstream so we don't render a status badge for them.
const completionBadge = (article: ArticleMetadata): React.ReactNode => {
  const schema = article.schema ?? []
  const total = schema.length
  const filled = schema.filter((f) => article.fields?.[f.name]).length
  if (total === 0) return null
  const done = filled === total
  return (
    <Badge variant={done ? 'success' : 'secondary'} className="tabular-nums">
      {filled}/{total}
    </Badge>
  )
}

const formatShortDate = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// Shared 5-column grid: checkbox · title (flex) · pages · remplissage · modifié.
const ROW_GRID = 'grid grid-cols-[28px_minmax(0,1fr)_72px_96px_88px] gap-4 items-center'

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
          className={`${ROW_GRID} px-3 py-2.5 border-b border-border/40 last:border-b-0 hover:bg-muted/40 cursor-pointer`}
          onClick={onOpen}
        >
          <Checkbox
            checked={selected}
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
          />
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-sm">{title}</span>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums text-right">
            {article.pages.length}p
          </span>
          <div className="flex justify-center">{completionBadge(article)}</div>
          <span className="text-xs text-muted-foreground tabular-nums text-right">
            {formatShortDate(article.modifiedAt)}
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
  onEditScope,
}: {
  dossier: DossierView | null // null = orphans section
  articles: ArticleMetadata[]
  selectedIds: Set<string>
  toggleArticle: (id: string) => void
  onOpenArticle: (id: string) => void
  onDeleteArticle: (id: string) => void
  onRenameDossier?: (id: string) => void
  onDeleteDossier?: (id: string) => void
  // Open the editor scoped to this dossier (or to orphans if dossier is null).
  onEditScope: () => void
}) {
  const label = dossier ? dossier.name : 'Sans dossier'

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between gap-4 mb-3 px-6">
        <h2 className="text-xl font-semibold tracking-tight">{label}</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={onEditScope}
            disabled={articles.length === 0}
            title={articles.length === 0 ? 'Aucun élément à transcrire' : 'Ouvrir dans l’éditeur'}
          >
            <FileText className="h-3.5 w-3.5 mr-1" />
            Transcrire
          </Button>
          {dossier && onRenameDossier && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => onRenameDossier(dossier.id)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {dossier && onDeleteDossier && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2 text-muted-foreground hover:text-destructive"
              onClick={() => onDeleteDossier(dossier.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {articles.length === 0 ? (
        <div className="text-sm text-muted-foreground py-3 border-t border-border/60">
          Aucun élément
        </div>
      ) : (
        <div className="border-t border-border/60">
          <div
            className={`${ROW_GRID} px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border/60`}
          >
            <div />
            <div>Titre</div>
            <div className="text-right">Pages</div>
            <div className="text-center">Remplissage</div>
            <div className="text-right">Modifié</div>
          </div>
          {articles.map((a) => (
            <ArticleRow
              key={a.id}
              article={a}
              selected={selectedIds.has(a.id)}
              onToggle={() => toggleArticle(a.id)}
              onOpen={() => onOpenArticle(a.id)}
              onDelete={() => onDeleteArticle(a.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export function ArticlesView({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const {
    dossiers,
    articles,
    renameDossier,
    deleteDossier,
    deleteArticle,
    moveArticlesBulk,
  } = useProjectStore()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
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
    navigate(`/editor/${projectId}?only=${id}`)
  }

  const handleDeleteArticle = (id: string) => {
    deleteArticle(id)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
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

  // Floating bar offset: stay clear of the collapsible sidebar so the pill
  // centers on the actual content area, not the full viewport.
  const { state: sidebarState, isMobile } = useSidebar()
  const sidebarOffset = isMobile ? '0px' : sidebarState === 'expanded' ? '16rem' : '3rem'

  return (
    <div className="space-y-3">
      <div className="pt-2">
        {totalArticles === 0 ? (
          <div className="border border-dashed rounded-md py-12 text-center text-sm text-muted-foreground">
            Aucun élément. Importez une source et extrayez-en des éléments depuis l'onglet Sources.
          </div>
        ) : (
          <>
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
                onEditScope={() =>
                  navigate(`/editor/${projectId}?dossier=${dossier.id}`)
                }
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
                onEditScope={() =>
                  navigate(`/editor/${projectId}?orphans=1`)
                }
              />
            )}
          </>
        )}
      </div>

      {selectedCount > 0 && (
        <div
          className="fixed bottom-6 right-0 z-40 flex justify-center pointer-events-none transition-[left] duration-200"
          style={{ left: sidebarOffset }}
        >
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border bg-background/95 backdrop-blur px-2 py-1.5 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-200">
            <span className="px-3 text-sm tabular-nums">
              {selectedCount} sélectionné{selectedCount === 1 ? '' : 's'}
            </span>
            <div className="h-5 w-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3"
              onClick={() =>
                navigate(`/editor/${projectId}?ids=${Array.from(selectedIds).join(',')}`)
              }
            >
              <FileText className="h-4 w-4 mr-1.5" />
              Transcrire
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3"
              onClick={() => setMoveOpen(true)}
            >
              <MoveRight className="h-4 w-4 mr-1.5" />
              Déplacer
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Supprimer
            </Button>
            <div className="h-5 w-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 rounded-full p-0 text-muted-foreground"
              onClick={() => setSelectedIds(new Set())}
              title="Désélectionner"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

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
