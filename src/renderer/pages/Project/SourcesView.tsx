// Sources tab of ProjectDetail. Grid of imported PDFs. Click → Extraction page
// for that source.
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
  ContextMenuTrigger,
} from '@/components/ui'
import { FileText, Plus, Trash2 } from 'lucide-react'
import { useProjectStore } from '@/stores'
import type { SourceView } from '@shared/types'

function SourceCard({
  source,
  projectId,
  onOpen,
  onDelete,
}: {
  source: SourceView
  projectId: string
  onOpen: () => void
  onDelete: () => void
}) {
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null)
  useEffect(() => {
    if (source.thumbnailPath) {
      window.api.v2_sourcesGetThumbnail(projectId, source.id).then(setThumbnailSrc)
    }
  }, [projectId, source.id, source.thumbnailPath])

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={onOpen}>
          <CardContent className="p-4 space-y-2">
            <div className="aspect-[4/3] rounded-md overflow-hidden bg-muted/30 flex items-center justify-center">
              {thumbnailSrc ? (
                <img src={thumbnailSrc} alt={source.originalFilename} className="w-full h-full object-contain" />
              ) : (
                <FileText className="h-10 w-10 text-muted-foreground/50" />
              )}
            </div>
            <h3 className="font-medium text-sm truncate">{source.originalFilename}</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{source.pageCount} page{source.pageCount === 1 ? '' : 's'}</span>
              <Badge variant="secondary" className="text-xs">
                {source.articlesCount} élément{source.articlesCount === 1 ? '' : 's'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onOpen}>
          <FileText className="h-4 w-4 mr-2" />
          Ouvrir pour extraction
        </ContextMenuItem>
        <ContextMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Supprimer
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function SourcesView({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const { sources, addSources, deleteSource } = useProjectStore()
  const [deleteTarget, setDeleteTarget] = useState<SourceView | null>(null)

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
            />
          ))}
        </div>
      )}

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
