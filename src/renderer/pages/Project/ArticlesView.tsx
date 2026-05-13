// Articles tab of ProjectDetail. Lists all articles in the project, grouped by
// dossier (one section per dossier, plus a "Sans dossier" section). Supports
// multi-select + bulk actions (delete, move to dossier, move to project).
//
// The list is virtualized via @tanstack/react-virtual so that only the rows
// actually in the viewport pay the React/DnD cost. At 300+ articles, mounting
// every <ArticleRow> with its own useSortable hook is the main bottleneck —
// virtualization caps the rendered count at ~20 regardless of total size.
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
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
  Download,
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
import { isFieldFilled } from '@shared/fieldValue'
import { MoveDialog } from './MoveDialog'
import { ExportModal, ExportFormat } from '../Editor/ExportModal'

// Compute X/Y completion ratio from article.fields and article.schema.
const completionBadge = (article: ArticleMetadata): React.ReactNode => {
  const schema = article.schema ?? []
  const total = schema.length
  const filled = schema.filter((f) => isFieldFilled(f, article.fields?.[f.name])).length
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

// Sort by `order` ascending, falling back to `createdAt`. Mirrors the backend
// sort in v2:articles:list.
const compareArticles = (a: ArticleMetadata, b: ArticleMetadata): number => {
  const ao = typeof a.order === 'number' ? a.order : Number.POSITIVE_INFINITY
  const bo = typeof b.order === 'number' ? b.order : Number.POSITIVE_INFINITY
  if (ao !== bo) return ao - bo
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
}

// ---------- Flat row model ----------
// The virtualizer needs a flat ordered list. We render dossier section
// headers, the column header inside each section, and the article rows as
// distinct "row types" so we can give each a sensible height estimate.

type FlatRow =
  | {
      type: 'section-header'
      key: string
      dossier: DossierView | null
      articleIds: string[]
    }
  | {
      type: 'col-header'
      key: string
      dossierId: string | null
      articleIds: string[]
    }
  | {
      type: 'article'
      key: string
      article: ArticleMetadata
    }
  | {
      type: 'section-empty'
      key: string
      dossier: DossierView | null
    }
  | {
      type: 'section-gap'
      key: string
    }

const SECTION_HEADER_HEIGHT = 52
const COL_HEADER_HEIGHT = 38
const ARTICLE_ROW_HEIGHT = 44
const SECTION_GAP_HEIGHT = 32
const EMPTY_NOTICE_HEIGHT = 56

const estimateRowHeight = (row: FlatRow): number => {
  switch (row.type) {
    case 'section-header': return SECTION_HEADER_HEIGHT
    case 'col-header': return COL_HEADER_HEIGHT
    case 'article': return ARTICLE_ROW_HEIGHT
    case 'section-empty': return EMPTY_NOTICE_HEIGHT
    case 'section-gap': return SECTION_GAP_HEIGHT
  }
}

// ---------- Article row (sortable) ----------

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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: article.id, data: { dossierId: article.dossierId } })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          className={`${ROW_GRID} px-3 py-2.5 border-b border-border/40 last:border-b-0 hover:bg-muted/40 cursor-pointer ${isDragging ? 'relative z-10 bg-muted/40 shadow-sm' : ''}`}
          onClick={onOpen}
          {...attributes}
          {...listeners}
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

// ---------- Section header (non-sortable) ----------

function SectionHeader({
  dossier,
  selectedIds,
  articleIds,
  onEditScope,
  onRenameDossier,
  onDeleteDossier,
}: {
  dossier: DossierView | null
  selectedIds: Set<string>
  articleIds: string[]
  onEditScope: () => void
  onRenameDossier?: () => void
  onDeleteDossier?: () => void
}) {
  void selectedIds
  void articleIds
  const label = dossier ? dossier.name : 'Sans dossier'
  return (
    <div className="flex items-center justify-between gap-4 pt-2 pb-3 px-6">
      <h2 className="text-xl font-semibold tracking-tight">{label}</h2>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs px-2"
          onClick={onEditScope}
          disabled={articleIds.length === 0}
          title={articleIds.length === 0 ? 'Aucun élément à transcrire' : 'Ouvrir dans l’éditeur'}
        >
          <FileText className="h-3.5 w-3.5" />
        </Button>
        {dossier && onRenameDossier && (
          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={onRenameDossier}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {dossier && onDeleteDossier && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2 text-muted-foreground hover:text-destructive"
            onClick={onDeleteDossier}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}

// ---------- Column header with select-all checkbox ----------

function ColHeader({
  articleIds,
  selectedIds,
  onToggleAll,
}: {
  articleIds: string[]
  selectedIds: Set<string>
  onToggleAll: (ids: string[], select: boolean) => void
}) {
  const selectedInSection = articleIds.reduce((n, id) => (selectedIds.has(id) ? n + 1 : n), 0)
  const headerCheckState: boolean | 'indeterminate' =
    selectedInSection === 0
      ? false
      : selectedInSection === articleIds.length
        ? true
        : 'indeterminate'
  return (
    <div
      className={`${ROW_GRID} px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-t border-b border-border/60 bg-background`}
    >
      <Checkbox
        checked={headerCheckState}
        onCheckedChange={(v) => onToggleAll(articleIds, v === true)}
        aria-label="Tout sélectionner dans cette section"
      />
      <div>Titre</div>
      <div className="text-right">Pages</div>
      <div className="text-center">Remplissage</div>
      <div className="text-right">Modifié</div>
    </div>
  )
}

// ---------- ArticlesView ----------

export function ArticlesView({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const {
    dossiers,
    articles,
    renameDossier,
    deleteDossier,
    deleteArticle,
    moveArticlesBulk,
    reorderArticles,
  } = useProjectStore()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [renameDossierId, setRenameDossierId] = useState<string | null>(null)
  const [renameDossierName, setRenameDossierName] = useState('')
  const [deleteDossierId, setDeleteDossierId] = useState<string | null>(null)
  const [deleteDossierMode, setDeleteDossierMode] =
    useState<DossierDeleteMode>('orphan-articles')
  const [moveOpen, setMoveOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  // Pre-sorted per-dossier and orphan lists. Used both for the flat row
  // build and for the DnD reorder math.
  const orphanArticles = useMemo(
    () => articles.filter((a) => a.dossierId === null).sort(compareArticles),
    [articles]
  )
  const articlesByDossier = useMemo(() => {
    const map = new Map<string, ArticleMetadata[]>()
    for (const d of dossiers) {
      map.set(d.id, articles.filter((a) => a.dossierId === d.id).sort(compareArticles))
    }
    return map
  }, [dossiers, articles])

  // The flat, ordered list of rows the virtualizer consumes.
  const flatRows: FlatRow[] = useMemo(() => {
    const rows: FlatRow[] = []
    const pushSection = (dossier: DossierView | null, items: ArticleMetadata[]) => {
      const ids = items.map((a) => a.id)
      rows.push({
        type: 'section-header',
        key: `h:${dossier?.id ?? 'orphans'}`,
        dossier,
        articleIds: ids,
      })
      if (items.length === 0) {
        rows.push({
          type: 'section-empty',
          key: `e:${dossier?.id ?? 'orphans'}`,
          dossier,
        })
      } else {
        rows.push({
          type: 'col-header',
          key: `c:${dossier?.id ?? 'orphans'}`,
          dossierId: dossier?.id ?? null,
          articleIds: ids,
        })
        for (const a of items) {
          rows.push({ type: 'article', key: `a:${a.id}`, article: a })
        }
      }
      rows.push({ type: 'section-gap', key: `g:${dossier?.id ?? 'orphans'}` })
    }
    for (const d of dossiers) pushSection(d, articlesByDossier.get(d.id) ?? [])
    if (orphanArticles.length > 0) pushSection(null, orphanArticles)
    return rows
  }, [dossiers, articlesByDossier, orphanArticles])

  // SortableContext takes the FULL ordered article-id list. dnd-kit picks
  // up each <ArticleRow>'s useSortable as it mounts; rows scrolled out of
  // view are simply not registered (their listeners cost nothing).
  const sortableIds = useMemo(() => {
    const ids: string[] = []
    for (const d of dossiers) {
      const items = articlesByDossier.get(d.id) ?? []
      for (const a of items) ids.push(a.id)
    }
    for (const a of orphanArticles) ids.push(a.id)
    return ids
  }, [dossiers, articlesByDossier, orphanArticles])

  // The layout's flex chain isn't height-constrained — neither <main> here
  // actually clips, the window itself scrolls. So we use useWindowVirtualizer
  // which subscribes to window scroll/resize directly. scrollMargin tells
  // it the offset between document top and where our list begins (the
  // header above us), measured from a sentinel ref.
  const sentinelRef = useRef<HTMLDivElement>(null)
  const virtualizer = useWindowVirtualizer({
    count: flatRows.length,
    estimateSize: (i) => estimateRowHeight(flatRows[i]),
    overscan: 8,
    getItemKey: (i) => flatRows[i].key,
    scrollMargin: sentinelRef.current?.getBoundingClientRect().top
      ? sentinelRef.current.getBoundingClientRect().top + window.scrollY
      : 0,
  })

  // Re-measure when the row list changes (dossier collapsed/added,
  // articles created/deleted, etc.) — heights are stable per row type so a
  // recompute keeps positions accurate.
  useLayoutEffect(() => {
    virtualizer.measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatRows.length])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeDossierId = active.data.current?.dossierId as string | null | undefined
    const overDossierId = over.data.current?.dossierId as string | null | undefined
    // Intra-section only — cross-dossier moves go through the explicit
    // "Déplacer" action (different semantics: changes dossierId on disk).
    if (activeDossierId === undefined || activeDossierId !== overDossierId) return

    const list =
      activeDossierId === null
        ? orphanArticles
        : articlesByDossier.get(activeDossierId) ?? []
    const oldIndex = list.findIndex((a) => a.id === active.id)
    const newIndex = list.findIndex((a) => a.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(list, oldIndex, newIndex).map((a) => a.id)
    void reorderArticles(activeDossierId, reordered)
  }

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

  const toggleArticlesInSection = (articleIds: string[], select: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of articleIds) {
        if (select) next.add(id)
        else next.delete(id)
      }
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

  const handleExportSelection = async (format: ExportFormat) => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    switch (format) {
      case 'pdf':
        await window.api.v2_exportArticlesPdf(projectId, ids)
        break
      case 'docx':
        await window.api.v2_exportArticlesDocx(projectId, ids)
        break
      case 'txt':
        await window.api.v2_exportArticlesTxt(projectId, ids)
        break
    }
  }

  const totalArticles = articles.length
  const selectedCount = selectedIds.size

  const { state: sidebarState, isMobile } = useSidebar()
  const sidebarOffset = isMobile ? '0px' : sidebarState === 'expanded' ? '16rem' : '3rem'

  // ---------- Render ----------

  // Empty state pre-empts the virtualizer entirely (no rows to size).
  if (totalArticles === 0 && dossiers.length === 0) {
    return (
      <div className="rounded-md py-12 text-center text-sm text-muted-foreground">
        Aucun élément. Importez une source et extrayez-en des éléments depuis l'onglet Sources.
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        {/* Sentinel — its first parent with overflow:auto/scroll is the
            real scroll container, which we hand to the virtualizer. */}
        <div ref={sentinelRef} />
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: 'relative',
            width: '100%',
          }}
        >
          {virtualizer.getVirtualItems().map((vi) => {
            const row = flatRows[vi.index]
            // useWindowVirtualizer's `start` is in document coordinates
            // (includes scrollMargin). Our container is already positioned
            // there by the page flow, so subtract scrollMargin to get the
            // offset relative to our container.
            const offset = vi.start - virtualizer.options.scrollMargin
            return (
              <div
                key={vi.key}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${offset}px)`,
                }}
              >
                {row.type === 'section-header' && (
                  <SectionHeader
                    dossier={row.dossier}
                    selectedIds={selectedIds}
                    articleIds={row.articleIds}
                    onEditScope={() =>
                      navigate(
                        row.dossier
                          ? `/editor/${projectId}?dossier=${row.dossier.id}`
                          : `/editor/${projectId}?orphans=1`
                      )
                    }
                    onRenameDossier={
                      row.dossier ? () => startRenameDossier(row.dossier!.id) : undefined
                    }
                    onDeleteDossier={
                      row.dossier
                        ? () => {
                            setDeleteDossierId(row.dossier!.id)
                            setDeleteDossierMode('orphan-articles')
                          }
                        : undefined
                    }
                  />
                )}
                {row.type === 'col-header' && (
                  <ColHeader
                    articleIds={row.articleIds}
                    selectedIds={selectedIds}
                    onToggleAll={toggleArticlesInSection}
                  />
                )}
                {row.type === 'article' && (
                  <ArticleRow
                    article={row.article}
                    selected={selectedIds.has(row.article.id)}
                    onToggle={() => toggleArticle(row.article.id)}
                    onOpen={() => handleOpenArticle(row.article.id)}
                    onDelete={() => handleDeleteArticle(row.article.id)}
                  />
                )}
                {row.type === 'section-empty' && (
                  <div className="text-sm text-muted-foreground py-3 border-t border-border/60 px-6">
                    Aucun élément
                  </div>
                )}
                {row.type === 'section-gap' && <div className="h-8" />}
              </div>
            )
          })}
        </div>
      </SortableContext>

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
              onClick={() => setExportOpen(true)}
            >
              <Download className="h-4 w-4 mr-1.5" />
              Exporter
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

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onExport={handleExportSelection}
        articleCount={selectedCount}
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
    </DndContext>
  )
}
