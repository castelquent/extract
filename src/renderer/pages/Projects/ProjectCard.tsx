import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProjectView } from '@shared/types'
import {
  Card,
  CardContent,
  Badge,
  CircularProgress,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from '@/components/ui'
import { Copy, FileArchive, Trash2, FileStack, FileText, Pencil, FolderOpen, Files, FolderTree } from 'lucide-react'
import { useTemplatesStore } from '@/stores'
import { templateDisplayName } from '@/lib/templateLabels'

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
  const { t, i18n } = useTranslation('projects')
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null)
  const { templates } = useTemplatesStore()

  const matchedTemplate = templates.find((t) => t.id === project.defaultTemplateId)
  const templateName = matchedTemplate ? templateDisplayName(matchedTemplate) : undefined

  useEffect(() => {
    if (project.thumbnailPath) {
      window.api.v2_projectsGetThumbnail(project.id).then(setThumbnailSrc)
    } else {
      setThumbnailSrc(null)
    }
  }, [project.id, project.thumbnailPath])

  const { articlesTotal, articlesFilled } = project
  const isEmptyProject = articlesTotal === 0
  const isComplete = articlesTotal > 0 && articlesFilled === articlesTotal
  const fillPct =
    articlesTotal > 0 ? Math.round((articlesFilled / articlesTotal) * 100) : 0

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card
          className="cursor-pointer hover:border-primary/50 transition-colors group relative h-full"
          onClick={onClick}
        >
          <CardContent className="p-4 h-full flex flex-col">
            <div className="relative aspect-[4/3] rounded-md mb-4 overflow-hidden flex-shrink-0 bg-muted/30">
              {thumbnailSrc ? (
                <img src={thumbnailSrc} alt={project.name} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                  {t('card.noSource')}
                </div>
              )}
              {articlesTotal > 0 && (
                <div
                  className="absolute bottom-2 right-2 flex rounded-full bg-card shadow-md"
                  title={t('card.filledTooltip', { filled: articlesFilled, total: articlesTotal })}
                >
                  <CircularProgress
                    value={fillPct}
                    size={48}
                    strokeWidth={4}
                    showLabel
                    renderLabel={(v) => `${v}%`}
                    className="stroke-muted-foreground/25"
                    progressClassName={isComplete ? 'stroke-emerald-400' : 'stroke-primary'}
                    labelClassName="text-[11px] font-semibold tabular-nums text-foreground"
                  />
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

              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Files className="h-3 w-3" />
                    {t('card.sourcesCount', { count: project.sourcesCount })}
                  </span>
                  <span className="flex items-center gap-1">
                    <FolderTree className="h-3 w-3" />
                    {t('card.dossiersCount', { count: project.dossiersCount })}
                  </span>
                </div>
                <span className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {t('card.elementsCount', { count: articlesTotal })}
                </span>
              </div>

              {isEmptyProject && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="info">{t('card.newBadge')}</Badge>
                </div>
              )}

              <p className="text-xs text-muted-foreground mt-auto">
                {t('card.modified', {
                  date: new Date(project.modifiedAt).toLocaleDateString(
                    i18n.language === 'en' ? 'en-US' : 'fr-FR'
                  ),
                })}
              </p>
            </div>
          </CardContent>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onRename}>
          <Pencil className="h-4 w-4 mr-2" />
          {t('contextMenu.rename')}
        </ContextMenuItem>
        <ContextMenuItem onClick={onDuplicate}>
          <Copy className="h-4 w-4 mr-2" />
          {t('contextMenu.duplicate')}
        </ContextMenuItem>
        <ContextMenuItem onClick={onOpenFolder}>
          <FolderOpen className="h-4 w-4 mr-2" />
          {t('contextMenu.openFolder')}
        </ContextMenuItem>
        <ContextMenuItem onClick={onExportZip}>
          <FileArchive className="h-4 w-4 mr-2" />
          {t('contextMenu.exportZip')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          {t('contextMenu.delete')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
