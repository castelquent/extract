// Articles tab of ProjectDetail. Two-pane layout: left sidebar lists all
// dossiers (+ "Sans dossier"), right pane shows the articles of the currently
// selected dossier only. Click a sidebar item to switch.
//
// DnD: intra-section drag-to-reorder within the visible dossier.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  type SortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  useSidebar,
} from '@/components/ui'
import {
  Download,
  FileText,
  Folder,
  MoveRight,
  Pencil,
  Plus,
  Settings2,
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
import { ExportModal, ExportFormat, ExportModalChoices, buildExportOptions } from '../Editor/ExportModal'

// noop strategy: rows don't shift to make room during drag. Active row
// follows the cursor; drop position resolved from over target in onDragEnd.
const noopStrategy: SortingStrategy = () => null

// Strict pointer-within: a drop only registers when the cursor is actually
// inside a droppable rect. We deliberately don't fall back to closestCenter,
// because it would otherwise capture the nearest sidebar dossier when the
// cursor hovers an empty area of the sidebar (below the last item, etc.).
const collisionDetection: CollisionDetection = pointerWithin

// Sentinel key for the "Sans dossier" bucket in selectedDossierKey state.
const ORPHANS_KEY = '__orphans__'

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

// Toggleable columns — Titre and the checkbox column are always visible.
type ColumnKey = 'source' | 'pages' | 'completion' | 'modified'
type ColumnVisibility = Record<ColumnKey, boolean>

const DEFAULT_COLUMNS: ColumnVisibility = {
  source: true,
  pages: false,
  completion: true,
  modified: false,
}

const COLUMN_LABELS: Record<ColumnKey, string> = {
  source: 'Source',
  pages: 'Pages',
  completion: 'Remplissage',
  modified: 'Modifié',
}

const COLUMNS_STORAGE_KEY = 'extract:articleColumns'

const ROW_BASE_CLASS = 'grid gap-4 items-center'

const buildGridStyle = (visible: ColumnVisibility): React.CSSProperties => {
  const cols = ['28px', 'minmax(0,1fr)']
  if (visible.source) cols.push('minmax(120px,180px)')
  if (visible.pages) cols.push('72px')
  if (visible.completion) cols.push('96px')
  if (visible.modified) cols.push('88px')
  return { gridTemplateColumns: cols.join(' ') }
}

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

// ---------- Article row (sortable) ----------

function ArticleRow({
  article,
  sourceLabel,
  selected,
  isMultiDragGhost,
  columns,
  gridStyle,
  onToggle,
  onOpen,
  onDelete,
}: {
  article: ArticleMetadata
  sourceLabel: string
  selected: boolean
  isMultiDragGhost: boolean
  columns: ColumnVisibility
  gridStyle: React.CSSProperties
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

  const { active, over } = useDndContext()
  const isOverTarget =
    !!over && over.id === article.id && !!active && active.id !== article.id

  // Drop indicator: a thin line at the top or bottom of this row, depending on
  // whether the dragged item's vertical center is above or below this row's
  // center. Tells the user exactly where the drop will land instead of just
  // outlining the whole row (ambiguous "before or after?").
  let dropEdge: 'above' | 'below' | null = null
  if (isOverTarget) {
    const activeRect = active!.rect.current.translated
    const overRect = over!.rect
    if (activeRect && overRect) {
      const activeMid = (activeRect.top + activeRect.bottom) / 2
      const overMid = (overRect.top + overRect.bottom) / 2
      dropEdge = activeMid < overMid ? 'above' : 'below'
    }
  }

  // Source rows fully hidden while dragged — the floating preview rendered
  // by <DragOverlay> below is the single visual element following the cursor.
  const style: React.CSSProperties = {
    ...gridStyle,
    transform: CSS.Transform.toString(transform),
    opacity: isDragging || isMultiDragGhost ? 0 : undefined,
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          data-article-row
          style={style}
          className={`relative ${ROW_BASE_CLASS} px-3 py-2.5 border-b border-border/40 last:border-b-0 hover:bg-muted/40 cursor-pointer ${isDragging ? 'z-10 bg-muted/40 shadow-sm' : ''}`}
          onClick={onOpen}
          {...attributes}
          {...listeners}
        >
          {dropEdge === 'above' && (
            <div className="pointer-events-none absolute -top-px left-0 right-0 h-0.5 bg-primary z-20" />
          )}
          {dropEdge === 'below' && (
            <div className="pointer-events-none absolute -bottom-px left-0 right-0 h-0.5 bg-primary z-20" />
          )}
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
          {columns.source && (() => {
            const firstPage = article.zones[0]?.page
            const display =
              firstPage !== undefined ? `${sourceLabel}, p${firstPage}` : sourceLabel
            return (
              <span
                className="flex items-center gap-1 text-xs text-muted-foreground min-w-0"
                title={display}
              >
                <span className="truncate">{sourceLabel}</span>
                {firstPage !== undefined && (
                  <span className="shrink-0">, p{firstPage}</span>
                )}
              </span>
            )
          })()}
          {columns.pages && (
            <span className="text-xs text-muted-foreground tabular-nums text-right">
              {article.pages.length}p
            </span>
          )}
          {columns.completion && (
            <div className="flex justify-center">{completionBadge(article)}</div>
          )}
          {columns.modified && (
            <span className="text-xs text-muted-foreground tabular-nums text-right">
              {formatShortDate(article.modifiedAt)}
            </span>
          )}
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

// ---------- Floating preview shown by <DragOverlay> while dragging ----------

const PREVIEW_MAX_TITLES = 3

function DragPreview({
  articles,
  grabOffsetX,
}: {
  articles: ArticleMetadata[]
  grabOffsetX: number
}) {
  if (articles.length === 0) return null
  const titles = articles
    .slice(0, PREVIEW_MAX_TITLES)
    .map(
      (a) =>
        (a.fields['Titre'] ?? a.fields['title'] ?? '').trim() || 'Sans titre'
    )
  const extra = articles.length - titles.length
  // <DragOverlay> sizes its wrapper to the full source row width and pins
  // the cursor at grabOffsetX inside that wrapper. We need an inner wrapper
  // with position:relative so we can absolutely position the preview at
  // exactly the cursor's x; otherwise a 30%-wide preview glued to the left
  // looks detached from the cursor when the user grabs near the right edge.
  return (
    <div className="relative w-full h-full">
      <div
        style={{
          position: 'absolute',
          left: `${grabOffsetX + 12}px`,
          top: 8,
        }}
        className="w-[30%] rounded-md border border-border bg-background shadow-lg cursor-grabbing py-1"
      >
        {titles.map((t, i) => (
          <div key={i} className="px-3 py-1 text-sm truncate">
            {t}
          </div>
        ))}
        {extra > 0 && (
          <div className="px-3 py-1 text-xs text-muted-foreground italic">
            et {extra} autre{extra > 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Sidebar dossier item (droppable target for cross-dossier moves) ----------

function DossierSidebarItem({
  dossier,
  isActive,
  isEditing,
  inlineRenameName,
  onChangeName,
  onSelect,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDelete,
}: {
  dossier: DossierView
  isActive: boolean
  isEditing: boolean
  inlineRenameName: string
  onChangeName: (v: string) => void
  onSelect: () => void
  onStartRename: () => void
  onCommitRename: () => void
  onCancelRename: () => void
  onDelete: () => void
}) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `dossier-drop:${dossier.id}`,
    data: { kind: 'dossier-drop', dossierId: dossier.id },
  })
  // Highlight only when an article drag is in progress AND the dossier is
  // not the one the dragged article already lives in.
  const dragSourceDossierId = active?.data.current?.dossierId as string | null | undefined
  const showDrop = isOver && !!active && dragSourceDossierId !== dossier.id
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li
          ref={setNodeRef}
          onClick={() => !isEditing && onSelect()}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm ${isEditing ? '' : 'cursor-pointer'} ${isActive ? 'bg-muted font-medium' : 'hover:bg-muted/40'} ${showDrop ? 'bg-primary/10 outline outline-2 outline-primary/60 -outline-offset-1' : ''}`}
          title={dossier.name}
        >
          <Folder className="h-3.5 w-3.5 shrink-0 fill-muted-foreground/60 text-muted-foreground/60" />
          {isEditing ? (
            <Input
              value={inlineRenameName}
              onChange={(e) => onChangeName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCommitRename()
                else if (e.key === 'Escape') onCancelRename()
              }}
              onBlur={onCommitRename}
              autoFocus
              className="h-6 px-1 py-0 text-sm"
            />
          ) : (
            <span className="truncate">{dossier.name}</span>
          )}
        </li>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onStartRename}>
          <Pencil className="h-4 w-4 mr-2" />
          Renommer
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

// ---------- Section header (no longer a drop target — single dossier view) ----------

function SectionHeader({
  dossier,
  articleIds,
  columns,
  onToggleColumn,
  onEditScope,
}: {
  dossier: DossierView | null
  articleIds: string[]
  columns: ColumnVisibility
  onToggleColumn: (key: ColumnKey, value: boolean) => void
  onEditScope: () => void
}) {
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2 text-muted-foreground"
              title="Colonnes affichées"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>Colonnes</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(Object.keys(COLUMN_LABELS) as ColumnKey[]).map((key) => (
              <DropdownMenuCheckboxItem
                key={key}
                checked={columns[key]}
                onCheckedChange={(v) => onToggleColumn(key, v === true)}
                onSelect={(e) => e.preventDefault()}
              >
                {COLUMN_LABELS[key]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

// ---------- Column header with select-all checkbox ----------

function ColHeader({
  articleIds,
  selectedIds,
  columns,
  gridStyle,
  onToggleAll,
}: {
  articleIds: string[]
  selectedIds: Set<string>
  columns: ColumnVisibility
  gridStyle: React.CSSProperties
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
      style={gridStyle}
      className={`${ROW_BASE_CLASS} px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-t border-b border-border/60 bg-background`}
    >
      <Checkbox
        checked={headerCheckState}
        onCheckedChange={(v) => onToggleAll(articleIds, v === true)}
        aria-label="Tout sélectionner dans cette section"
      />
      <div>Titre</div>
      {columns.source && <div>Source</div>}
      {columns.pages && <div className="text-right">Pages</div>}
      {columns.completion && <div className="text-center">Remplissage</div>}
      {columns.modified && <div className="text-right">Modifié</div>}
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
    sources,
    createDossier,
    renameDossier,
    deleteDossier,
    deleteArticle,
    moveArticlesBulk,
    reorderArticles,
  } = useProjectStore()

  // Per-row "Source" column: resolve sourceId → friendly name (with
  // .pdf-extension fallback to originalFilename when the user hasn't named
  // the source).
  const sourceLabelById = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of sources) {
      const label = (s.name?.trim() || s.originalFilename || '').trim()
      map.set(s.id, label)
    }
    return map
  }, [sources])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [deleteDossierId, setDeleteDossierId] = useState<string | null>(null)
  const [deleteDossierMode, setDeleteDossierMode] =
    useState<DossierDeleteMode>('orphan-articles')
  const [moveOpen, setMoveOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [newDossierOpen, setNewDossierOpen] = useState(false)
  const [newDossierName, setNewDossierName] = useState('')
  // Inline rename in the sidebar: when set, the matching <li> renders an
  // <input> in place of its label.
  const [inlineRenameId, setInlineRenameId] = useState<string | null>(null)
  const [inlineRenameName, setInlineRenameName] = useState('')
  // Cross-dossier drag-drop opens a confirm dialog before persisting the
  // move (cheap insurance against accidental drops on the sidebar).
  const [pendingMove, setPendingMove] = useState<
    | { articleIds: string[]; targetDossierId: string | null }
    | null
  >(null)
  const [grabOffsetX, setGrabOffsetX] = useState(0)

  // Column visibility — persisted across sessions in localStorage so the
  // user's "hide Modifié" choice survives a reload.
  const [columns, setColumns] = useState<ColumnVisibility>(() => {
    try {
      const raw = localStorage.getItem(COLUMNS_STORAGE_KEY)
      if (raw) return { ...DEFAULT_COLUMNS, ...JSON.parse(raw) }
    } catch {
      // Ignore — fall through to defaults.
    }
    return DEFAULT_COLUMNS
  })
  useEffect(() => {
    try {
      localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(columns))
    } catch {
      // Ignore quota / disabled storage.
    }
  }, [columns])
  const gridStyle = useMemo(() => buildGridStyle(columns), [columns])
  const handleToggleColumn = (key: ColumnKey, value: boolean) =>
    setColumns((prev) => ({ ...prev, [key]: value }))

  // Selected dossier lives in the URL (?dossier=X) so back/forward navigation
  // — including back from the editor — restores the right tab.
  const [searchParams, setSearchParams] = useSearchParams()
  const urlDossier = searchParams.get('dossier')
  const selectedDossierKey: string =
    urlDossier === ORPHANS_KEY
      ? ORPHANS_KEY
      : urlDossier && dossiers.some((d) => d.id === urlDossier)
        ? urlDossier
        : dossiers[0]?.id ?? ORPHANS_KEY
  const setSelectedDossierKey = (key: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('dossier', key)
        return next
      },
      { replace: true }
    )
  }

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

  // Clean up the URL if it points to a deleted dossier — the derived
  // selectedDossierKey already falls back, but the stale param would survive
  // until the next click otherwise.
  useEffect(() => {
    if (!urlDossier || urlDossier === ORPHANS_KEY) return
    if (dossiers.some((d) => d.id === urlDossier)) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('dossier', dossiers[0]?.id ?? ORPHANS_KEY)
        return next
      },
      { replace: true }
    )
  }, [dossiers, urlDossier, setSearchParams])

  // Reset the multi-select when the user switches dossier in the sidebar.
  // Mirrors SourcesView; intra-dossier DnD already filters out cross-dossier
  // ids in practice, but resetting also avoids stale check states leaking
  // into the bulk-action bar.
  useEffect(() => {
    setSelectedIds(new Set())
  }, [selectedDossierKey])

  const activeDossier: DossierView | null =
    selectedDossierKey === ORPHANS_KEY
      ? null
      : dossiers.find((d) => d.id === selectedDossierKey) ?? null
  const activeItems: ArticleMetadata[] =
    selectedDossierKey === ORPHANS_KEY
      ? visibleOrphans
      : visibleByDossier.get(selectedDossierKey) ?? []
  const activeArticleIds = useMemo(() => activeItems.map((a) => a.id), [activeItems])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const draggingIds = useMemo(() => {
    if (!activeDragId) return new Set<string>()
    if (selectedIds.has(activeDragId)) return new Set(selectedIds)
    return new Set([activeDragId])
  }, [activeDragId, selectedIds])
  const isMultiDrag = draggingIds.size > 1

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
    // event.active.rect.current.initial is null at dragStart for our setup,
    // so walk up from the original click target to the row (data-article-row)
    // and measure that.
    const evt = event.activatorEvent as PointerEvent | undefined
    const target = (evt?.target as HTMLElement | null) ?? null
    const row = target?.closest('[data-article-row]') as HTMLElement | null
    if (evt && typeof evt.clientX === 'number' && row) {
      const rect = row.getBoundingClientRect()
      setGrabOffsetX(evt.clientX - rect.left)
    } else {
      setGrabOffsetX(0)
    }
  }
  const handleDragCancel = () => setActiveDragId(null)

  // Two scenarios resolved by the over target:
  //   1. Drop on a sidebar dossier (data.kind === 'dossier-drop') →
  //      cross-dossier move. Articles land at the END of the destination,
  //      since the sidebar can't show a precise insertion point.
  //   2. Drop on another row in the visible dossier → intra-dossier reorder
  //      using the same midpoint comparison as the visual line indicator.
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragId(null)
    if (!over) return

    const activeId = String(active.id)
    const list = activeItems

    // Compute the set of articles that move together: a grab on a selected
    // row promotes the whole selection; a grab on an unselected row moves
    // just that row (matches the convention in most file managers).
    const movingIds =
      selectedIds.has(activeId) && selectedIds.size > 1
        ? Array.from(selectedIds).filter((id) => list.some((a) => a.id === id))
        : [activeId]
    const movingSet = new Set(movingIds)
    const movingInOrder = list.filter((a) => movingSet.has(a.id)).map((a) => a.id)

    const overData = over.data.current as
      | { kind?: 'dossier-drop'; dossierId?: string | null }
      | undefined

    // ---- Scenario 1: drop on a sidebar dossier — confirm, then move ----
    if (overData?.kind === 'dossier-drop') {
      const targetDossierId = overData.dossierId ?? null
      const currentDossierId = activeDossier?.id ?? null
      if (targetDossierId === currentDossierId) return
      setPendingMove({ articleIds: movingInOrder, targetDossierId })
      return
    }

    // ---- Scenario 2: intra-dossier reorder ----
    if (active.id === over.id) return
    const overId = String(over.id)
    const overIndex = list.findIndex((a) => a.id === overId)
    if (overIndex < 0) return

    // Same drop-edge logic as the visual indicator in ArticleRow: if the
    // dragged item's center is above the over row's center, drop above
    // (insert at overIndex). Otherwise drop below (insert at overIndex + 1).
    const activeRect = active.rect.current.translated
    const overRect = over.rect
    let dropAbove = true
    if (activeRect && overRect) {
      const activeMid = (activeRect.top + activeRect.bottom) / 2
      const overMid = (overRect.top + overRect.bottom) / 2
      dropAbove = activeMid < overMid
    }
    const baseInsertAt = dropAbove ? overIndex : overIndex + 1

    if (movingIds.length === 1) {
      const oldIndex = list.findIndex((a) => a.id === activeId)
      if (oldIndex === -1) return
      // Removing oldIndex first shifts everything after it left by 1, so the
      // insertion target needs adjustment when oldIndex precedes the target.
      const insertAt = oldIndex < baseInsertAt ? baseInsertAt - 1 : baseInsertAt
      if (oldIndex === insertAt) return
      const ids = list.map((a) => a.id)
      const [moved] = ids.splice(oldIndex, 1)
      ids.splice(insertAt, 0, moved)
      void reorderArticles(activeDossier?.id ?? null, ids)
      return
    }

    const remaining = list.map((a) => a.id).filter((id) => !movingSet.has(id))
    // Same adjustment for multi: count how many moving rows sat before the
    // base insertion point, since removing them shifts the target left.
    let adjustedTarget = baseInsertAt
    for (let i = 0; i < baseInsertAt; i++) {
      if (movingSet.has(list[i].id)) adjustedTarget--
    }
    adjustedTarget = Math.max(0, Math.min(adjustedTarget, remaining.length))
    remaining.splice(adjustedTarget, 0, ...movingInOrder)
    void reorderArticles(activeDossier?.id ?? null, remaining)
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

  const handleDeleteDossier = async () => {
    if (!deleteDossierId) return
    await deleteDossier(deleteDossierId, deleteDossierMode)
    setDeleteDossierId(null)
  }

  // Executes a confirmed cross-dossier drop: ships the bulk move, then
  // re-orders the destination so the moved ids land at the tail.
  const confirmPendingMove = async () => {
    if (!pendingMove) return
    const { articleIds, targetDossierId } = pendingMove
    const ok = await moveArticlesBulk(articleIds, { dossierId: targetDossierId })
    if (!ok) {
      setPendingMove(null)
      return
    }
    const movingSet = new Set(articleIds)
    const dest = useProjectStore
      .getState()
      .articles.filter((a) => a.dossierId === targetDossierId)
      .sort(compareArticles)
    const desired = dest.map((a) => a.id).filter((id) => !movingSet.has(id))
    desired.push(...articleIds)
    await reorderArticles(targetDossierId, desired)
    setPendingMove(null)
  }

  const handleCreateDossier = async () => {
    const created = await createDossier(newDossierName)
    if (created) {
      setNewDossierOpen(false)
      setNewDossierName('')
      setSelectedDossierKey(created.id)
    }
  }

  const startInlineRename = (id: string) => {
    const d = dossiers.find((x) => x.id === id)
    if (!d) return
    setInlineRenameId(id)
    setInlineRenameName(d.name)
  }
  const commitInlineRename = async () => {
    if (!inlineRenameId) return
    const trimmed = inlineRenameName.trim()
    if (trimmed) await renameDossier(inlineRenameId, trimmed)
    setInlineRenameId(null)
    setInlineRenameName('')
  }
  const cancelInlineRename = () => {
    setInlineRenameId(null)
    setInlineRenameName('')
  }

  // Sidebar drop targets — dossier items use <DossierSidebarItem>, orphans
  // is rendered inline so we register its useDroppable here.
  const orphansDrop = useDroppable({
    id: 'dossier-drop:orphans',
    data: { kind: 'dossier-drop', dossierId: null },
  })
  const orphansDropActive =
    orphansDrop.isOver &&
    !!orphansDrop.active &&
    (orphansDrop.active.data.current?.dossierId as string | null | undefined) !== null

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

  const handleExportSelection = async (format: ExportFormat, choices: ExportModalChoices) => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const options = buildExportOptions(format, choices)
    switch (format) {
      case 'pdf':
        await window.api.v2_exportArticlesPdf(projectId, ids, options)
        break
      case 'docx':
        await window.api.v2_exportArticlesDocx(projectId, ids, options)
        break
      case 'txt':
        await window.api.v2_exportArticlesTxt(projectId, ids, options)
        break
      case 'png':
        await window.api.v2_exportArticlesPng(projectId, ids, options)
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex h-full">
        <aside className="h-full shrink-0 border-r overflow-hidden w-56">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-1 p-1.5 border-b shrink-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pl-1.5 truncate">
                Dossiers
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 shrink-0"
                onClick={() => setNewDossierOpen(true)}
                title="Nouveau dossier"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <ul className="flex-1 overflow-y-auto py-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full">
              {dossiers.map((d) => (
                <DossierSidebarItem
                  key={d.id}
                  dossier={d}
                  isActive={selectedDossierKey === d.id}
                  isEditing={inlineRenameId === d.id}
                  inlineRenameName={inlineRenameName}
                  onChangeName={setInlineRenameName}
                  onSelect={() => setSelectedDossierKey(d.id)}
                  onStartRename={() => startInlineRename(d.id)}
                  onCommitRename={commitInlineRename}
                  onCancelRename={cancelInlineRename}
                  onDelete={() => {
                    setDeleteDossierId(d.id)
                    setDeleteDossierMode('orphan-articles')
                  }}
                />
              ))}
              <li
                ref={orphansDrop.setNodeRef}
                onClick={() => setSelectedDossierKey(ORPHANS_KEY)}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer ${selectedDossierKey === ORPHANS_KEY ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/40'} ${orphansDropActive ? 'bg-primary/10 outline outline-2 outline-primary/60 -outline-offset-1' : ''}`}
                title="Sans dossier"
              >
                <span className="truncate">Sans dossier</span>
              </li>
            </ul>
          </div>
        </aside>
        <div className="flex-1 min-w-0 h-full overflow-y-auto">
          <SortableContext items={activeArticleIds} strategy={noopStrategy}>
            <div className="sticky top-0 z-10 bg-background">
              <SectionHeader
                dossier={activeDossier}
                articleIds={activeArticleIds}
                columns={columns}
                onToggleColumn={handleToggleColumn}
                onEditScope={() =>
                  navigate(
                    activeDossier
                      ? `/editor/${projectId}?dossier=${activeDossier.id}`
                      : `/editor/${projectId}?orphans=1`
                  )
                }
              />
              {activeItems.length > 0 && (
                <ColHeader
                  articleIds={activeArticleIds}
                  selectedIds={selectedIds}
                  columns={columns}
                  gridStyle={gridStyle}
                  onToggleAll={toggleArticlesInSection}
                />
              )}
            </div>
            {activeItems.length === 0 ? (
              <div className="text-sm text-muted-foreground py-3 border-t border-border/60 px-6">
                {incompleteOnly ? 'Tous les éléments sont complétés.' : 'Aucun élément'}
              </div>
            ) : (
              activeItems.map((a) => (
                <ArticleRow
                  key={a.id}
                  article={a}
                  sourceLabel={sourceLabelById.get(a.sourceId) ?? ''}
                  selected={selectedIds.has(a.id)}
                  isMultiDragGhost={
                    isMultiDrag && draggingIds.has(a.id) && a.id !== activeDragId
                  }
                  columns={columns}
                  gridStyle={gridStyle}
                  onToggle={() => toggleArticle(a.id)}
                  onOpen={() => handleOpenArticle(a.id)}
                  onDelete={() => handleDeleteArticle(a.id)}
                />
              ))
            )}
          </SortableContext>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDragId ? (
          <DragPreview
            articles={activeItems.filter((a) => draggingIds.has(a.id))}
            grabOffsetX={grabOffsetX}
          />
        ) : null}
      </DragOverlay>

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

      <AlertDialog open={!!pendingMove} onOpenChange={(open) => !open && setPendingMove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Déplacer {pendingMove?.articleIds.length ?? 0} élément
              {(pendingMove?.articleIds.length ?? 0) === 1 ? '' : 's'} ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const target =
                  pendingMove?.targetDossierId == null
                    ? 'Sans dossier'
                    : dossiers.find((d) => d.id === pendingMove.targetDossierId)?.name ?? '?'
                return `Vers : ${target}`
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void confirmPendingMove()
              }}
            >
              Déplacer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
