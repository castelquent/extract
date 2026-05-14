// Sources tab of ProjectDetail. Grid of imported PDFs. Click → Extraction page
// for that source. Per-card gear button opens a settings modal (rename +
// replace PDF) that lives below.
import { useEffect, useState } from 'react'
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
  Card,
  CardContent,
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
  Label,
} from '@/components/ui'
import { Download, FileText, FileUp, Plus, Settings, Trash2 } from 'lucide-react'
import { useProjectStore } from '@/stores'
import type { SourceView } from '@shared/types'

// Display name: user-set name takes precedence, falls back to the original
// filename (which is what every legacy source uses).
const displayName = (s: SourceView): string => s.name?.trim() || s.originalFilename

function SourceCard({
  source,
  projectId,
  onOpen,
  onDelete,
  onSettings,
}: {
  source: SourceView
  projectId: string
  onOpen: () => void
  onDelete: () => void
  onSettings: () => void
}) {
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null)
  // Refetch whenever the underlying file changes. Replacing a source
  // PDF rewrites the same thumbnail path on disk, so depending on
  // `thumbnailPath` alone would never invalidate — we use mtime as
  // the cache-buster.
  useEffect(() => {
    if (source.thumbnailPath) {
      window.api.v2_sourcesGetThumbnail(projectId, source.id).then(setThumbnailSrc)
    } else {
      setThumbnailSrc(null)
    }
  }, [projectId, source.id, source.thumbnailPath, source.thumbnailMtime])

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card
          className="group relative cursor-pointer hover:border-primary/50 transition-colors"
          onClick={onOpen}
        >
          <CardContent className="p-4 space-y-2">
            <div className="aspect-[4/3] rounded-md overflow-hidden bg-muted/30 flex items-center justify-center">
              {thumbnailSrc ? (
                <img src={thumbnailSrc} alt={displayName(source)} className="w-full h-full object-contain" />
              ) : (
                <FileText className="h-10 w-10 text-muted-foreground/50" />
              )}
            </div>
            <h3 className="font-medium text-sm truncate">{displayName(source)}</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{source.pageCount} page{source.pageCount === 1 ? '' : 's'}</span>
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
        <ContextMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Supprimer
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

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

  // Seed the input each time the modal opens with the latest source name.
  useEffect(() => {
    if (open && source) setNameDraft(source.name ?? '')
  }, [open, source])

  if (!source) return null

  const fallbackName = source.originalFilename
  const trimmed = nameDraft.trim()
  // Only persist when the user actually changed something (avoid touching
  // modifiedAt for nothing).
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
              Remplacer le PDF garde le lien avec les éléments existants, mais leurs zones
              peuvent ne plus correspondre au nouveau document.
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

export function SourcesView({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { sources, addSources, deleteSource } = useProjectStore()
  const [deleteTarget, setDeleteTarget] = useState<SourceView | null>(null)
  const [settingsTarget, setSettingsTarget] = useState<SourceView | null>(null)

  const handleOpenSource = (sourceId: string) => {
    navigate(`/extraction/${projectId}/${sourceId}`)
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    await deleteSource(deleteTarget.id)
    setDeleteTarget(null)
  }

  return (
    <div className="space-y-3 p-6">
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={addSources}>
          <Plus className="h-4 w-4 mr-1" />
          Importer
        </Button>
      </div>

      {sources.length === 0 ? (
        <div className="border rounded-md py-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground mb-4">Aucune source importée</p>
          <Button onClick={addSources}>
            <Plus className="h-4 w-4 mr-1" />
            Importer un PDF
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sources.map((s) => (
            <SourceCard
              key={s.id}
              source={s}
              projectId={projectId}
              onOpen={() => handleOpenSource(s.id)}
              onDelete={() => setDeleteTarget(s)}
              onSettings={() => setSettingsTarget(s)}
            />
          ))}
        </div>
      )}

      <SourceSettingsModal
        source={settingsTarget}
        open={!!settingsTarget}
        onClose={() => setSettingsTarget(null)}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
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
    </div>
  )
}
