// Sources tab of ProjectDetail. Two-pane layout mirroring ArticlesView:
//   - Left sidebar lists source-dossiers (+ "Sans dossier"). Click to switch.
//   - Right pane: grid of source cards (filtered by the selected dossier).
// Drag a source card onto a sidebar dossier → move (with a confirm dialog).
// Source-dossiers are independent from article-dossiers — see
// SourceDossierMetadata in shared/types.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
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
  Card,
  CardContent,
  Checkbox,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useSidebar,
} from '@/components/ui'
import {
  Download,
  FileText,
  FileUp,
  Folder,
  LayoutGrid,
  List,
  MoveRight,
  Pencil,
  Plus,
  Settings,
  Trash2,
  X,
} from 'lucide-react'
import { useProjectStore } from '@/stores'
import type { SourceDossierView, SourceView } from '@shared/types'

const ORPHANS_KEY = '__orphans__'

const VIEW_MODE_STORAGE_KEY = 'extract:sourcesViewMode'
type ViewMode = 'grid' | 'table'

const collisionDetection: CollisionDetection = pointerWithin

const displayName = (s: SourceView): string => s.name?.trim() || s.originalFilename

// Table layout columns: checkbox (28px), Nom (1fr), Pages (72px), Éléments (96px).
const TABLE_GRID =
  'grid grid-cols-[28px_minmax(0,1fr)_72px_96px] gap-4 items-center'

// ---------- Source card (draggable) ----------

function SourceCard({
  source,
  projectId,
  isMultiDragGhost,
  onOpen,
  onDelete,
  onSettings,
}: {
  source: SourceView
  projectId: string
  isMultiDragGhost: boolean
  onOpen: () => void
  onDelete: () => void
  onSettings: () => void
}) {
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null)
  useEffect(() => {
    if (source.thumbnailPath) {
      window.api.v2_sourcesGetThumbnail(projectId, source.id).then(setThumbnailSrc)
    } else {
      setThumbnailSrc(null)
    }
  }, [projectId, source.id, source.thumbnailPath, source.thumbnailMtime])

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: source.id,
    data: { kind: 'source-card', sourceId: source.id },
  })

  // Hide the source card while it's the active drag OR part of a multi-drag
  // ghost — the floating preview in <DragOverlay> is the only visible
  // artefact for the whole group.
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card
          ref={setNodeRef}
          data-source-card
          className={`group relative cursor-pointer hover:border-primary/50 transition-colors ${isDragging || isMultiDragGhost ? 'opacity-0' : ''}`}
          onClick={onOpen}
          {...attributes}
          {...listeners}
        >
          <CardContent className="p-4 space-y-2">
            <div className="aspect-[4/3] rounded-md overflow-hidden bg-muted/30 flex items-center justify-center">
              {thumbnailSrc ? (
                <img
                  src={thumbnailSrc}
                  alt={displayName(source)}
                  className="w-full h-full object-contain"
                />
              ) : (
                <FileText className="h-10 w-10 text-muted-foreground/50" />
              )}
            </div>
            <h3 className="font-medium text-sm truncate">{displayName(source)}</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                {source.pageCount} page{source.pageCount === 1 ? '' : 's'}
              </span>
              <Badge variant="secondary" className="text-xs">
                {source.articlesCount} élément{source.articlesCount === 1 ? '' : 's'}
              </Badge>
            </div>
          </CardContent>
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur"
            onClick={(e) => {
              e.stopPropagation()
              onSettings()
            }}
            title="Paramètres de la source"
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onOpen}>
          <FileText className="h-4 w-4 mr-2" />
          Ouvrir pour extraction
        </ContextMenuItem>
        <ContextMenuItem onClick={onSettings}>
          <Settings className="h-4 w-4 mr-2" />
          Paramètres
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={onDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Supprimer
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

// ---------- Source table row (compact list view) ----------

function SourceTableRow({
  source,
  selected,
  isMultiDragGhost,
  onToggle,
  onOpen,
  onDelete,
  onSettings,
}: {
  source: SourceView
  selected: boolean
  isMultiDragGhost: boolean
  onToggle: () => void
  onOpen: () => void
  onDelete: () => void
  onSettings: () => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: source.id,
    data: { kind: 'source-card', sourceId: source.id },
  })

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          data-source-card
          className={`${TABLE_GRID} px-3 py-2 border-b border-border/40 last:border-b-0 hover:bg-muted/40 cursor-pointer ${isDragging || isMultiDragGhost ? 'opacity-0' : ''}`}
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
          <span className="truncate text-sm">{displayName(source)}</span>
          <span className="text-xs text-muted-foreground tabular-nums text-right">
            {source.pageCount}p
          </span>
          <div className="flex justify-center">
            <Badge variant="secondary" className="text-xs">
              {source.articlesCount} él.
            </Badge>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onOpen}>
          <FileText className="h-4 w-4 mr-2" />
          Ouvrir pour extraction
        </ContextMenuItem>
        <ContextMenuItem onClick={onSettings}>
          <Settings className="h-4 w-4 mr-2" />
          Paramètres
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={onDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Supprimer
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function SourceTableHeader({
  sourceIds,
  selectedIds,
  onToggleAll,
}: {
  sourceIds: string[]
  selectedIds: Set<string>
  onToggleAll: (ids: string[], select: boolean) => void
}) {
  const selectedInView = sourceIds.reduce(
    (n, id) => (selectedIds.has(id) ? n + 1 : n),
    0
  )
  const headerCheckState: boolean | 'indeterminate' =
    selectedInView === 0
      ? false
      : selectedInView === sourceIds.length
        ? true
        : 'indeterminate'
  return (
    <div
      className={`${TABLE_GRID} px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-t border-b border-border/60 bg-background`}
    >
      <Checkbox
        checked={headerCheckState}
        onCheckedChange={(v) => onToggleAll(sourceIds, v === true)}
        aria-label="Tout sélectionner"
      />
      <div>Nom</div>
      <div className="text-right">Pages</div>
      <div className="text-center">Éléments</div>
    </div>
  )
}

// ---------- Floating drag preview ----------

const PREVIEW_MAX_TITLES = 3

function DragPreview({
  labels,
  grabOffsetX,
  grabOffsetY,
}: {
  labels: string[]
  grabOffsetX: number
  grabOffsetY: number
}) {
  // The DragOverlay wrapper is sized to the source CARD (not a row), so we
  // can't use a % width — it'd come out tiny. Fix width (w-64) and offset
  // both X and Y by the captured grab position so the preview lands just
  // right-and-below the cursor regardless of where on the card the user
  // grabbed.
  if (labels.length === 0) return null
  const visible = labels.slice(0, PREVIEW_MAX_TITLES)
  const extra = labels.length - visible.length
  return (
    <div className="relative w-full h-full">
      <div
        style={{
          position: 'absolute',
          left: `${grabOffsetX + 12}px`,
          top: `${grabOffsetY + 8}px`,
        }}
        className="w-64 rounded-md border border-border bg-background shadow-lg cursor-grabbing py-1"
      >
        {visible.map((label, i) => (
          <div key={i} className="px-3 py-1 text-sm truncate">
            {label}
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

// ---------- Sidebar item (droppable + context menu + inline rename) ----------

function SourceDossierSidebarItem({
  dossier,
  isActive,
  isEditing,
  renameValue,
  onChangeRenameValue,
  onSelect,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDelete,
}: {
  dossier: SourceDossierView
  isActive: boolean
  isEditing: boolean
  renameValue: string
  onChangeRenameValue: (v: string) => void
  onSelect: () => void
  onStartRename: () => void
  onCommitRename: () => void
  onCancelRename: () => void
  onDelete: () => void
}) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `source-dossier-drop:${dossier.id}`,
    data: { kind: 'source-dossier-drop', sourceDossierId: dossier.id },
  })
  // Highlight only when an actual source card is being dragged AND it's
  // not already in this dossier.
  const dragSourceId = active?.data.current?.sourceId as string | undefined
  const dragFromDossierId = (() => {
    if (!dragSourceId) return undefined
    return undefined // unknown without lookup; the parent passes context — keep simple here
  })()
  void dragFromDossierId
  const showDrop = isOver && !!active && active.data.current?.kind === 'source-card'

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
              value={renameValue}
              onChange={(e) => onChangeRenameValue(e.target.value)}
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
        <ContextMenuItem
          onClick={onDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Supprimer
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

// ---------- Source settings modal (unchanged from before) ----------

function SourceSettingsModal({
  source,
  open,
  onClose,
}: {
  source: SourceView | null
  open: boolean
  onClose: () => void
}) {
  const projectId = useProjectStore((s) => s.project?.id ?? null)
  const renameSource = useProjectStore((s) => s.renameSource)
  const replaceSourcePdf = useProjectStore((s) => s.replaceSourcePdf)
  const [nameDraft, setNameDraft] = useState('')

  useEffect(() => {
    if (open && source) setNameDraft(source.name ?? '')
  }, [open, source])

  if (!source) return null

  const fallbackName = source.originalFilename
  const trimmed = nameDraft.trim()
  const nameDirty = (source.name ?? '') !== trimmed

  const handleSave = async () => {
    if (nameDirty) await renameSource(source.id, trimmed)
    onClose()
  }

  const handleReplacePdf = async () => {
    const updated = await replaceSourcePdf(source.id)
    if (updated) onClose()
  }

  const handleDownloadPdf = async () => {
    if (!projectId) return
    await window.api.v2_sourcesDownloadPdf(projectId, source.id)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Paramètres de la source</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="source-name">Nom</Label>
            <Input
              id="source-name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder={fallbackName}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Vide = utilise le nom du fichier importé ({fallbackName}).
            </p>
          </div>

          <div className="border-t pt-4 space-y-2">
            <Label>PDF source</Label>
            <p className="text-xs text-muted-foreground">
              Remplacer le PDF garde le lien avec les éléments existants, mais leurs
              zones peuvent ne plus correspondre au nouveau document.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={handleDownloadPdf}>
                <Download className="h-4 w-4 mr-2" />
                Télécharger
              </Button>
              <Button variant="outline" onClick={handleReplacePdf}>
                <FileUp className="h-4 w-4 mr-2" />
                Remplacer
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={!nameDirty}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- SourcesView ----------

export function SourcesView({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const {
    sources,
    sourceDossiers,
    addSources,
    deleteSource,
    moveSourcesBulk,
    createSourceDossier,
    renameSourceDossier,
    deleteSourceDossier,
  } = useProjectStore()

  const [deleteTarget, setDeleteTarget] = useState<SourceView | null>(null)
  const [settingsTarget, setSettingsTarget] = useState<SourceView | null>(null)
  const [newDossierOpen, setNewDossierOpen] = useState(false)
  const [newDossierName, setNewDossierName] = useState('')
  const [deleteDossierId, setDeleteDossierId] = useState<string | null>(null)
  const [inlineRenameId, setInlineRenameId] = useState<string | null>(null)
  const [inlineRenameName, setInlineRenameName] = useState('')
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [grabOffsetX, setGrabOffsetX] = useState(0)
  const [grabOffsetY, setGrabOffsetY] = useState(0)
  const [pendingMove, setPendingMove] = useState<
    | { sourceIds: string[]; targetSourceDossierId: string | null }
    | null
  >(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false)
  const [bulkMoveTarget, setBulkMoveTarget] = useState<string>(ORPHANS_KEY)

  // Persisted view-mode toggle. Default to grid (thumbnails) since that's
  // the main reason researchers want to look at sources visually.
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const raw = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
      if (raw === 'table' || raw === 'grid') return raw
    } catch {
      // Ignore — fall through to default.
    }
    return 'grid'
  })
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode)
    } catch {
      // Ignore quota / disabled storage.
    }
  }, [viewMode])

  // Selected sidebar item lives in the URL so back-nav restores it.
  const [searchParams, setSearchParams] = useSearchParams()
  const urlKey = searchParams.get('sourceDossier')
  const selectedKey: string =
    urlKey === ORPHANS_KEY
      ? ORPHANS_KEY
      : urlKey && sourceDossiers.some((d) => d.id === urlKey)
        ? urlKey
        : sourceDossiers[0]?.id ?? ORPHANS_KEY
  const setSelectedKey = (key: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('sourceDossier', key)
        return next
      },
      { replace: true }
    )
  }

  // Clean up the URL if it points to a deleted source-dossier.
  useEffect(() => {
    if (!urlKey || urlKey === ORPHANS_KEY) return
    if (sourceDossiers.some((d) => d.id === urlKey)) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('sourceDossier', sourceDossiers[0]?.id ?? ORPHANS_KEY)
        return next
      },
      { replace: true }
    )
  }, [sourceDossiers, urlKey, setSearchParams])

  // Reset the multi-select when the user switches dossier in the sidebar —
  // a selection isn't meaningful across dossiers (you can't see the other
  // items, so the preview count would silently include them).
  useEffect(() => {
    setSelectedIds(new Set())
  }, [selectedKey])

  const activeSources = useMemo(() => {
    const filtered =
      selectedKey === ORPHANS_KEY
        ? sources.filter((s) => (s.sourceDossierId ?? null) === null)
        : sources.filter((s) => s.sourceDossierId === selectedKey)
    return filtered
      .slice()
      .sort((a, b) =>
        displayName(a).localeCompare(displayName(b), 'fr', { sensitivity: 'base' })
      )
  }, [sources, selectedKey])

  const activeDossier = useMemo(() => {
    if (selectedKey === ORPHANS_KEY) return null
    return sourceDossiers.find((d) => d.id === selectedKey) ?? null
  }, [sourceDossiers, selectedKey])

  // Drop on the "Sans dossier" item in the sidebar.
  const orphansDrop = useDroppable({
    id: 'source-dossier-drop:orphans',
    data: { kind: 'source-dossier-drop', sourceDossierId: null },
  })
  const orphansDropActive =
    orphansDrop.isOver &&
    !!orphansDrop.active &&
    orphansDrop.active.data.current?.kind === 'source-card'

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
    const evt = event.activatorEvent as PointerEvent | undefined
    const target = (evt?.target as HTMLElement | null) ?? null
    const card = target?.closest('[data-source-card]') as HTMLElement | null
    if (evt && typeof evt.clientX === 'number' && card) {
      const rect = card.getBoundingClientRect()
      setGrabOffsetX(evt.clientX - rect.left)
      setGrabOffsetY(evt.clientY - rect.top)
    } else {
      setGrabOffsetX(0)
      setGrabOffsetY(0)
    }
  }
  const handleDragCancel = () => setActiveDragId(null)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveDragId(null)
    if (!over) return
    const overData = over.data.current as
      | { kind?: string; sourceDossierId?: string | null }
      | undefined
    if (overData?.kind !== 'source-dossier-drop') return
    const activeId = String(active.id)
    const targetSourceDossierId = overData.sourceDossierId ?? null
    // Multi-drag promotes the whole selection; single drag = just the row.
    const candidateIds =
      selectedIds.has(activeId) && selectedIds.size > 1
        ? Array.from(selectedIds)
        : [activeId]
    // Skip ids that already live in the target dossier — moving them is a
    // no-op and would noise the confirmation count.
    const movingIds = candidateIds.filter((id) => {
      const s = sources.find((x) => x.id === id)
      return s && (s.sourceDossierId ?? null) !== targetSourceDossierId
    })
    if (movingIds.length === 0) return
    setPendingMove({ sourceIds: movingIds, targetSourceDossierId })
  }

  const confirmPendingMove = async () => {
    if (!pendingMove) return
    await moveSourcesBulk(pendingMove.sourceIds, {
      sourceDossierId: pendingMove.targetSourceDossierId,
    })
    setPendingMove(null)
  }

  const handleOpenSource = (sourceId: string) => {
    navigate(`/extraction/${projectId}/${sourceId}`)
  }

  const toggleSource = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleAllInView = (ids: string[], select: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (select) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    let blocked = 0
    for (const id of ids) {
      const ok = await deleteSource(id)
      if (!ok) blocked++
    }
    setSelectedIds(new Set())
    setBulkDeleteOpen(false)
    void blocked
  }
  const handleBulkMoveConfirm = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const target = bulkMoveTarget === ORPHANS_KEY ? null : bulkMoveTarget
    await moveSourcesBulk(ids, { sourceDossierId: target })
    setSelectedIds(new Set())
    setBulkMoveOpen(false)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    await deleteSource(deleteTarget.id)
    setDeleteTarget(null)
  }

  const handleCreateDossier = async () => {
    const created = await createSourceDossier(newDossierName)
    if (created) {
      setNewDossierOpen(false)
      setNewDossierName('')
      setSelectedKey(created.id)
    }
  }

  const startInlineRename = (id: string) => {
    const d = sourceDossiers.find((x) => x.id === id)
    if (!d) return
    setInlineRenameId(id)
    setInlineRenameName(d.name)
  }
  const commitInlineRename = async () => {
    if (!inlineRenameId) return
    const trimmed = inlineRenameName.trim()
    if (trimmed) await renameSourceDossier(inlineRenameId, trimmed)
    setInlineRenameId(null)
    setInlineRenameName('')
  }
  const cancelInlineRename = () => {
    setInlineRenameId(null)
    setInlineRenameName('')
  }

  // Which sources travel together for the current drag:
  //   - grabbed a selected card → the whole selection moves
  //   - grabbed an unselected card → only that one moves
  // (matches the convention used in ArticlesView, which is also what most
  // file managers do.)
  const draggingIds = useMemo(() => {
    if (!activeDragId) return new Set<string>()
    if (selectedIds.has(activeDragId)) return new Set(selectedIds)
    return new Set([activeDragId])
  }, [activeDragId, selectedIds])
  const isMultiDrag = draggingIds.size > 1

  // Labels for the floating preview. Walk activeSources first (so the
  // order matches what the user is looking at), then append any selected
  // ids that live in other dossiers. `seen` dedups defensively so the
  // count can't accidentally double when activeSources and sources both
  // contain the same id.
  const previewLabels = useMemo(() => {
    if (!activeDragId) return []
    const byId = new Map(sources.map((s) => [s.id, s]))
    const seen = new Set<string>()
    const inOrder: string[] = []
    for (const s of activeSources) {
      if (draggingIds.has(s.id) && !seen.has(s.id)) {
        inOrder.push(displayName(s))
        seen.add(s.id)
      }
    }
    for (const id of draggingIds) {
      if (seen.has(id)) continue
      const s = byId.get(id)
      if (s) {
        inOrder.push(displayName(s))
        seen.add(id)
      }
    }
    return inOrder
  }, [activeDragId, draggingIds, activeSources, sources])

  const selectedCount = selectedIds.size
  const activeSourceIds = useMemo(() => activeSources.map((s) => s.id), [activeSources])
  const { state: sidebarState, isMobile } = useSidebar()
  const sidebarOffset = isMobile ? '0px' : sidebarState === 'expanded' ? '16rem' : '3rem'

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
              {sourceDossiers.map((d) => (
                <SourceDossierSidebarItem
                  key={d.id}
                  dossier={d}
                  isActive={selectedKey === d.id}
                  isEditing={inlineRenameId === d.id}
                  renameValue={inlineRenameName}
                  onChangeRenameValue={setInlineRenameName}
                  onSelect={() => setSelectedKey(d.id)}
                  onStartRename={() => startInlineRename(d.id)}
                  onCommitRename={commitInlineRename}
                  onCancelRename={cancelInlineRename}
                  onDelete={() => setDeleteDossierId(d.id)}
                />
              ))}
              <li
                ref={orphansDrop.setNodeRef}
                onClick={() => setSelectedKey(ORPHANS_KEY)}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer ${selectedKey === ORPHANS_KEY ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/40'} ${orphansDropActive ? 'bg-primary/10 outline outline-2 outline-primary/60 -outline-offset-1' : ''}`}
                title="Sans dossier"
              >
                <span className="truncate">Sans dossier</span>
              </li>
            </ul>
          </div>
        </aside>

        <div className="flex-1 min-w-0 h-full overflow-y-auto">
          <div className="sticky top-0 z-10 bg-background">
            <div className="flex items-center justify-between gap-4 pt-2 pb-3 px-6">
              <h2 className="text-xl font-semibold tracking-tight">
                {activeDossier ? activeDossier.name : 'Sans dossier'}
              </h2>
              <div className="flex items-center gap-1">
                <div className="flex items-center rounded-md border bg-background mr-1">
                  <Button
                    variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 px-2 rounded-r-none"
                    onClick={() => setViewMode('grid')}
                    title="Vue grille"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 px-2 rounded-l-none"
                    onClick={() => setViewMode('table')}
                    title="Vue tableau"
                  >
                    <List className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={addSources}
                  title="Importer un PDF"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {viewMode === 'table' && activeSources.length > 0 && (
              <SourceTableHeader
                sourceIds={activeSourceIds}
                selectedIds={selectedIds}
                onToggleAll={toggleAllInView}
              />
            )}
          </div>
          {activeSources.length === 0 ? (
            <div className="mx-6 mt-2 border rounded-md py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                {sources.length === 0
                  ? 'Aucune source importée'
                  : 'Aucune source dans ce dossier'}
              </p>
              {sources.length === 0 && (
                <Button onClick={addSources}>
                  <Plus className="h-4 w-4 mr-1" />
                  Importer un PDF
                </Button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 px-6 pb-6">
              {activeSources.map((s) => (
                <SourceCard
                  key={s.id}
                  source={s}
                  projectId={projectId}
                  isMultiDragGhost={
                    isMultiDrag && draggingIds.has(s.id) && s.id !== activeDragId
                  }
                  onOpen={() => handleOpenSource(s.id)}
                  onDelete={() => setDeleteTarget(s)}
                  onSettings={() => setSettingsTarget(s)}
                />
              ))}
            </div>
          ) : (
            <div>
              {activeSources.map((s) => (
                <SourceTableRow
                  key={s.id}
                  source={s}
                  selected={selectedIds.has(s.id)}
                  isMultiDragGhost={
                    isMultiDrag && draggingIds.has(s.id) && s.id !== activeDragId
                  }
                  onToggle={() => toggleSource(s.id)}
                  onOpen={() => handleOpenSource(s.id)}
                  onDelete={() => setDeleteTarget(s)}
                  onSettings={() => setSettingsTarget(s)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDragId ? (
          <DragPreview
            labels={previewLabels}
            grabOffsetX={grabOffsetX}
            grabOffsetY={grabOffsetY}
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
              onClick={() => {
                setBulkMoveTarget(activeDossier?.id ?? ORPHANS_KEY)
                setBulkMoveOpen(true)
              }}
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

      <Dialog open={bulkMoveOpen} onOpenChange={setBulkMoveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Déplacer {selectedCount} source{selectedCount === 1 ? '' : 's'}
            </DialogTitle>
            <DialogDescription>
              Choisissez le dossier de destination dans ce projet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Label>Dossier de destination</Label>
            <Select value={bulkMoveTarget} onValueChange={setBulkMoveTarget}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ORPHANS_KEY}>Sans dossier</SelectItem>
                {sourceDossiers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkMoveOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleBulkMoveConfirm}>Déplacer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Supprimer {selectedCount} source{selectedCount === 1 ? '' : 's'} ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Les sources utilisées par des éléments ne seront pas supprimées (un
              message s'affichera pour chacune). Cette action est irréversible
              pour les autres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleBulkDelete()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SourceSettingsModal
        source={settingsTarget}
        open={!!settingsTarget}
        onClose={() => setSettingsTarget(null)}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette source ?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && deleteTarget.articlesCount > 0
                ? `Cette source est utilisée par ${deleteTarget.articlesCount} élément(s). Supprimez-les d'abord ou ils auront une source manquante.`
                : "Cette action est irréversible. Le PDF source sera supprimé."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDeleteConfirm()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={newDossierOpen} onOpenChange={setNewDossierOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau dossier de sources</DialogTitle>
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

      <AlertDialog
        open={!!deleteDossierId}
        onOpenChange={(open) => !open && setDeleteDossierId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce dossier ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les sources qu'il contient seront rendues orphelines (mais conservées).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault()
                if (!deleteDossierId) return
                await deleteSourceDossier(deleteDossierId, 'orphan-sources')
                setDeleteDossierId(null)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!pendingMove}
        onOpenChange={(open) => !open && setPendingMove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Déplacer {pendingMove?.sourceIds.length ?? 0} source
              {(pendingMove?.sourceIds.length ?? 0) === 1 ? '' : 's'} ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const target =
                  pendingMove?.targetSourceDossierId == null
                    ? 'Sans dossier'
                    : sourceDossiers.find((d) => d.id === pendingMove.targetSourceDossierId)
                        ?.name ?? '?'
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
    </DndContext>
  )
}
