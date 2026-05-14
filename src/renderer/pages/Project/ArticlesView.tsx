// Articles tab of ProjectDetail. Lists all articles in the project, grouped by
// dossier (one section per dossier, plus a "Sans dossier" section). Supports
// multi-select + bulk actions (delete, move to dossier, move to project).
//
// The list is virtualized via @tanstack/react-virtual so that only the rows
// actually in the viewport pay the React/DnD cost. At 300+ articles, mounting
// every <ArticleRow> with its own useSortable hook is the main bottleneck —
// virtualization caps the rendered count at ~20 regardless of total size.
//
// DnD: one SortableContext for the whole list with a no-op strategy (no row
// shifting during drag). The active row follows the cursor; the drop target
// is highlighted via a border. Intra-section drops reorder; cross-section
// drops move the article AND reorder so it lands at the user's drop position.
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  type SortingStrategy,
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

// No-op sorting strategy: items don't shift to "make space" during drag.
// dnd-kit's default (rectSortingStrategy) treats every member of the
// SortableContext as part of one big list, so dragging into a destination
// section pushes its rows — including the bottom one — into the next
// section. We just want the active row to follow the cursor; the drop
// position is resolved from the over target in onDragEnd.
const noopStrategy: SortingStrategy = () => null

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

const ROW_GRID = 'grid grid-cols-[28px_minmax(0,1fr)_72px_96px_88px] gap-4 items-center'

const compareArticles = (a: ArticleMetadata, b: ArticleMetadata): number => {
  const ao = typeof a.order === 'number' ? a.order : Number.POSITIVE_INFINITY
  const bo = typeof b.order === 'number' ? b.order : Number.POSITIVE_INFINITY
  if (ao !== bo) return ao - bo
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
}

const isArticleComplete = (article: ArticleMetadata): boolean => {
  const schema = article.schema ?? []
  if (schema.length === 0) return false
  return schema.every((f) => isFieldFilled(f, article.fields?.[f.name]))
}

// ---------- Flat row model ----------

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
  isMultiDragGhost,
  onToggle,
  onOpen,
  onDelete,
}: {
  article: ArticleMetadata
  selected: boolean
  // True when this row is part of a multi-drag selection but isn't the
  // pointer-grabbed item. We dim it so the user sees the whole group is
  // moving even though only one row has a useSortable transform.
  isMultiDragGhost: boolean
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
    isDragging,
  } = useSortable({ id: article.id, data: { dossierId: article.dossierId } })

  // Drop indicator: outline the row currently hovered as a drop target.
  const { active, over } = useDndContext()
  const isOverTarget =
    !!over && over.id === article.id && !!active && active.id !== article.id

  // No `transition` — the drop should be instant. The default useSortable
  // transition animates the row's transform back to zero on release, which
  // reads as "flying home".
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging || isMultiDragGhost ? 0.4 : undefined,
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          className={`${ROW_GRID} px-3 py-2.5 border-b border-border/40 last:border-b-0 hover:bg-muted/40 cursor-pointer ${isDragging ? 'relative z-10 bg-muted/40 shadow-sm' : ''} ${isOverTarget ? 'bg-primary/10 outline outline-2 outline-primary/60 -outline-offset-1' : ''}`}
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
  articleIds,
  onEditScope,
  onRenameDossier,
  onDeleteDossier,
}: {
  dossier: DossierView | null
  articleIds: string[]
  onEditScope: () => void
  onRenameDossier?: () => void
  onDeleteDossier?: () => void
}) {
  const dossierId = dossier?.id ?? null
  const label = dossier ? dossier.name : 'Sans dossier'

  // Make the whole section header a drop target — gives empty dossiers
  // something to receive a cross-dossier drag, and lets the user move
  // articles to a dossier by aiming at its title without needing an
  // existing row to land on.
  const { setNodeRef, isOver, active } = useDroppable({
    id: `section:${dossierId ?? 'orphans'}`,
    data: { dossierId, isSection: true },
  })
  const activeDossierId = active?.data.current?.dossierId as string | null | undefined
  const isOverTarget = isOver && active && activeDossierId !== dossierId

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-between gap-4 pt-2 pb-3 px-6 ${isOverTarget ? 'bg-primary/10 outline outline-2 outline-primary/60 -outline-offset-1 rounded-md' : ''}`}
    >
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

export function ArticlesView({
  projectId,
  incompleteOnly = false,
}: {
  projectId: string
  incompleteOnly?: boolean
}) {
  const navigate = useNavigate()
  const {
    dossiers,
    articles,
    renameDossier,
    deleteDossier,
    deleteArticle,
    moveArticle,
    moveArticlesBulk,
    reorderArticles,
  } = useProjectStore()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Live ID of whatever the user is currently grabbing. Drives the
  // multi-drag visual (ghosting the other selected rows) and tells
  // handleDragEnd whether to act on the selection or on just the active row.
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [renameDossierId, setRenameDossierId] = useState<string | null>(null)
  const [renameDossierName, setRenameDossierName] = useState('')
  const [deleteDossierId, setDeleteDossierId] = useState<string | null>(null)
  const [deleteDossierMode, setDeleteDossierMode] =
    useState<DossierDeleteMode>('orphan-articles')
  const [moveOpen, setMoveOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

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

  const visibleOrphans = useMemo(
    () =>
      incompleteOnly
        ? orphanArticles.filter((a) => !isArticleComplete(a))
        : orphanArticles,
    [orphanArticles, incompleteOnly]
  )
  const visibleByDossier = useMemo(() => {
    if (!incompleteOnly) return articlesByDossier
    const out = new Map<string, ArticleMetadata[]>()
    for (const [id, items] of articlesByDossier) {
      out.set(id, items.filter((a) => !isArticleComplete(a)))
    }
    return out
  }, [articlesByDossier, incompleteOnly])

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
    for (const d of dossiers) {
      const items = visibleByDossier.get(d.id) ?? []
      if (incompleteOnly && items.length === 0) continue
      pushSection(d, items)
    }
    if (visibleOrphans.length > 0) pushSection(null, visibleOrphans)
    return rows
  }, [dossiers, visibleByDossier, visibleOrphans, incompleteOnly])

  const sortableIds = useMemo(() => {
    const ids: string[] = []
    for (const d of dossiers) {
      const items = articlesByDossier.get(d.id) ?? []
      for (const a of items) ids.push(a.id)
    }
    for (const a of orphanArticles) ids.push(a.id)
    return ids
  }, [dossiers, articlesByDossier, orphanArticles])

  // Single window virtualizer for the whole flat row list. Sentinel-measured
  // scrollMargin so positions stay correct under AppLayout's flex chain
  // (where neither <main> actually clips — the window itself scrolls).
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

  useLayoutEffect(() => {
    virtualizer.measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatRows.length])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // The set of article IDs that should move together for the current drag.
  // - User grabs a selected row → the whole selection moves.
  // - User grabs an unselected row → just that row moves (the selection is
  //   ignored, matching the convention in most file managers / IDEs).
  const draggingIds = useMemo(() => {
    if (!activeDragId) return new Set<string>()
    if (selectedIds.has(activeDragId)) return new Set(selectedIds)
    return new Set([activeDragId])
  }, [activeDragId, selectedIds])
  const isMultiDrag = draggingIds.size > 1

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
  }
  const handleDragCancel = () => setActiveDragId(null)

  // Intra-section → reorder. Cross-section → move + reorder so the article
  // lands at the user's drop position. Drop on a section header → append.
  // Multi-drag (active row was part of the selection): same scenarios but
  // applied to every selected article in their source-display order.
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragId(null)
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const activeDossierId = active.data.current?.dossierId as string | null | undefined
    const overData = over.data.current as
      | { dossierId?: string | null; isSection?: boolean }
      | undefined
    const overDossierId = overData?.dossierId
    if (activeDossierId === undefined || overDossierId === undefined) return

    // Which IDs are moving together. The active grab on a selected row
    // promotes the whole selection; an unselected row drags alone.
    const movingIds = selectedIds.has(activeId) && selectedIds.size > 1
      ? Array.from(selectedIds)
      : [activeId]
    const movingSet = new Set(movingIds)
    // Order them by their current display position (so consecutive moves
    // preserve user intent rather than scrambling).
    const movingInOrder: string[] = []
    for (const d of dossiers) {
      const items = articlesByDossier.get(d.id) ?? []
      for (const a of items) if (movingSet.has(a.id)) movingInOrder.push(a.id)
    }
    for (const a of orphanArticles) {
      if (movingSet.has(a.id)) movingInOrder.push(a.id)
    }

    const projectId = useProjectStore.getState().project?.id
    if (!projectId) return

    // ---- Drop on section header → append all moving items to that dossier ----
    if (overData?.isSection) {
      if (activeDossierId === overDossierId && movingIds.length === 1) return
      const destList =
        overDossierId === null
          ? orphanArticles
          : articlesByDossier.get(overDossierId) ?? []
      const baseOrder =
        typeof destList[destList.length - 1]?.order === 'number'
          ? (destList[destList.length - 1].order as number) + 1
          : destList.length
      // Optimistic: each moving id gets a consecutive order at the tail
      // of the destination.
      const orderById = new Map<string, number>()
      movingInOrder.forEach((id, i) => orderById.set(id, baseOrder + i))
      useProjectStore.setState((s) => ({
        articles: s.articles.map((a) =>
          orderById.has(a.id)
            ? { ...a, dossierId: overDossierId, order: orderById.get(a.id)! }
            : a
        ),
      }))
      ;(async () => {
        const ok = await window.api.v2_articlesMoveBulk(projectId, movingInOrder, {
          dossierId: overDossierId,
        })
        if (!ok) return
        const desired = destList.map((a) => a.id).filter((id) => !movingSet.has(id))
        desired.push(...movingInOrder)
        await reorderArticles(overDossierId, desired)
      })()
      return
    }

    const overId = String(over.id)

    // ---- Intra-section reorder ----
    if (activeDossierId === overDossierId) {
      const list =
        activeDossierId === null
          ? orphanArticles
          : articlesByDossier.get(activeDossierId) ?? []
      const overIndex = list.findIndex((a) => a.id === overId)
      if (overIndex < 0) return
      if (movingIds.length === 1) {
        // Single-row case: arrayMove preserves the existing semantics.
        const oldIndex = list.findIndex((a) => a.id === active.id)
        if (oldIndex === -1) return
        const reordered = arrayMove(list, oldIndex, overIndex).map((a) => a.id)
        void reorderArticles(activeDossierId, reordered)
        return
      }
      // Multi-row reorder: pull out all moving ids, re-insert them as a
      // contiguous block at the over target. If the over target is itself
      // one of the moving ids, fall back to its position after extraction.
      const remaining = list.map((a) => a.id).filter((id) => !movingSet.has(id))
      // Adjust target: count how many moving ids sat before overIndex.
      let adjustedTarget = overIndex
      for (let i = 0; i < overIndex; i++) {
        if (movingSet.has(list[i].id)) adjustedTarget--
      }
      // Clamp into [0, remaining.length] (overIndex itself may have been
      // a moving id).
      adjustedTarget = Math.max(0, Math.min(adjustedTarget, remaining.length))
      remaining.splice(adjustedTarget, 0, ...movingInOrder)
      void reorderArticles(activeDossierId, remaining)
      return
    }

    // ---- Cross-section: move all moving ids into destination at over's
    //      position, in source order. ----
    const destListBefore =
      overDossierId === null
        ? orphanArticles
        : articlesByDossier.get(overDossierId) ?? []
    const targetIndex = destListBefore.findIndex((a) => a.id === overId)
    if (targetIndex < 0) return
    const overOrder = destListBefore[targetIndex].order ?? targetIndex
    // Optimistic: insert moving rows just before the over target so
    // compareArticles puts them in the right block. Fractional orders get
    // integerised by reorderArticles below.
    const orderById = new Map<string, number>()
    movingInOrder.forEach((id, i) => {
      orderById.set(id, overOrder - 0.5 + i * 1e-6)
    })
    useProjectStore.setState((s) => ({
      articles: s.articles.map((a) =>
        orderById.has(a.id)
          ? { ...a, dossierId: overDossierId, order: orderById.get(a.id)! }
          : a
      ),
    }))
    ;(async () => {
      const ok = await window.api.v2_articlesMoveBulk(projectId, movingInOrder, {
        dossierId: overDossierId,
      })
      if (!ok) return
      const desired = destListBefore.map((a) => a.id).filter((id) => !movingSet.has(id))
      desired.splice(targetIndex, 0, ...movingInOrder)
      await reorderArticles(overDossierId, desired)
    })()
    // Silence the unused destructure — moveArticle isn't called here.
    void moveArticle
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

  if (totalArticles === 0 && dossiers.length === 0) {
    return (
      <div className="rounded-md py-12 text-center text-sm text-muted-foreground">
        Aucun élément. Importez une source et extrayez-en des éléments depuis l'onglet Sources.
      </div>
    )
  }
  if (incompleteOnly && flatRows.length === 0) {
    return (
      <div className="rounded-md py-12 text-center text-sm text-muted-foreground">
        Tous les éléments sont complétés.
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={sortableIds} strategy={noopStrategy}>
        {/* Sentinel — its doc-top offset is fed to the virtualizer as
            scrollMargin so visible-range math is correct. */}
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
                    isMultiDragGhost={
                      isMultiDrag &&
                      draggingIds.has(row.article.id) &&
                      row.article.id !== activeDragId
                    }
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
