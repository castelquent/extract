import { useState, useEffect } from 'react'
import type { ProjectView } from '@shared/types'
import {
  Card,
  CardContent,
  Badge,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui'
import { Copy, FileArchive, Trash2, FileStack, Pencil, FolderOpen, Files, FolderTree } from 'lucide-react'
import { useTemplatesStore } from '@/stores'

interface ProjectCardProps {
  project: ProjectView
  onClick: () => void
  onDelete: () => void
  onDuplicate: () => void
  onRename: () => void
  onOpenFolder: () => void
  onExportZip: () => void
}

export function ProjectCard({
  project,
  onClick,
  onDelete,
  onDuplicate,
  onRename,
  onOpenFolder,
  onExportZip,
}: ProjectCardProps) {
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null)
  const { templates } = useTemplatesStore()

  const templateName = templates.find((t) => t.id === project.defaultTemplateId)?.name

  useEffect(() => {
    if (project.thumbnailPath) {
      window.api.v2_projectsGetThumbnail(project.id).then(setThumbnailSrc)
    } else {
      setThumbnailSrc(null)
    }
  }, [project.id, project.thumbnailPath])

  const { articlesTotal, articlesToExtract, articlesFilled } = project
  const isEmptyProject =
    articlesTotal === 0 && articlesToExtract === 0
  const isComplete =
    articlesTotal > 0 && articlesFilled === articlesTotal && articlesToExtract === 0

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors group relative h-full"
          onClick={onClick}
        >
          <CardContent className="p-4 h-full flex flex-col">
            <div className="aspect-[4/3] rounded-md mb-4 overflow-hidden flex-shrink-0 bg-muted/30">
              {thumbnailSrc ? (
                <img src={thumbnailSrc} alt={project.name} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                  Aucune source
                </div>
              )}
            </div>

            <div className="flex-1 space-y-3 flex flex-col">
              <h3 className="font-semibold truncate">{project.name}</h3>

              <div className="flex items-center gap-2 flex-wrap">
                {templateName && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <FileStack className="h-3 w-3" />
                    {templateName}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Files className="h-3 w-3" />
                  {project.sourcesCount} source{project.sourcesCount === 1 ? '' : 's'}
                </span>
                <span className="flex items-center gap-1">
                  <FolderTree className="h-3 w-3" />
                  {project.dossiersCount} dossier{project.dossiersCount === 1 ? '' : 's'}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {isEmptyProject ? (
                  <Badge variant="info">Nouveau</Badge>
                ) : (
                  <>
                    {articlesToExtract > 0 && (
                      <Badge variant="warning">{articlesToExtract} à extraire</Badge>
                    )}
                    {articlesTotal > 0 && (
                      <Badge
                        variant={isComplete ? 'success' : 'secondary'}
                        className="tabular-nums"
                      >
                        {articlesFilled}/{articlesTotal}
                      </Badge>
                    )}
                  </>
                )}
              </div>

              <p className="text-xs text-muted-foreground" style={{ marginTop: 'auto' }}>
                Modifié le {new Date(project.modifiedAt).toLocaleDateString('fr-FR')}
              </p>
            </div>
          </CardContent>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onRename}>
          <Pencil className="h-4 w-4 mr-2" />
          Renommer
        </ContextMenuItem>
        <ContextMenuItem onClick={onDuplicate}>
          <Copy className="h-4 w-4 mr-2" />
          Dupliquer
        </ContextMenuItem>
        <ContextMenuItem onClick={onOpenFolder}>
          <FolderOpen className="h-4 w-4 mr-2" />
          Ouvrir le dossier
        </ContextMenuItem>
        <ContextMenuItem onClick={onExportZip}>
          <FileArchive className="h-4 w-4 mr-2" />
          Exporter ZIP
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
