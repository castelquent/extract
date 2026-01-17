import { useState, useEffect } from 'react'
import type { Project } from '@shared/types'
import {
  Card,
  CardContent,
  Badge,
  Progress,
  Button,
} from '@/components/ui'
import { Trash2 } from 'lucide-react'

interface ProjectCardProps {
  project: Project
  onClick: () => void
  onDelete: () => void
}

const statusConfig: Record<Project['status'], { label: string; variant: 'info' | 'warning' | 'secondary' | 'success' }> = {
  new: { label: 'Nouveau', variant: 'info' },
  extracting: { label: 'Extraction', variant: 'warning' },
  extracted: { label: 'Extrait', variant: 'secondary' },
  in_progress: { label: 'Transcription', variant: 'warning' },
  completed: { label: 'Terminé', variant: 'success' }
}

export function ProjectCard({ project, onClick, onDelete }: ProjectCardProps) {
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null)

  useEffect(() => {
    if (project.thumbnailPath) {
      // thumbnailPath is absolute, so projectId is just used for routing
      window.api.getImageData(project.id, project.thumbnailPath).then(setThumbnailSrc)
    }
  }, [project.id, project.thumbnailPath])

  const progress = project.totalFields > 0
    ? Math.round((project.filledFields / project.totalFields) * 100)
    : 0

  const status = statusConfig[project.status]

  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors group relative"
      onClick={onClick}
    >
      <CardContent className="p-4">
        {/* Thumbnail */}
        <div className="aspect-[4/3] bg-muted rounded-md mb-4 overflow-hidden">
          {thumbnailSrc ? (
            <img
              src={thumbnailSrc}
              alt={project.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              PDF
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-3">
          <h3 className="font-semibold truncate">{project.name}</h3>

          <div className="flex items-center gap-2">
            <Badge variant={status.variant}>{status.label}</Badge>
            {project.articlesCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {project.articlesCount} article{project.articlesCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {project.totalFields > 0 && (
            <div className="space-y-1">
              <Progress value={progress} className="h-1.5" />
              <p className="text-xs text-muted-foreground text-right">{progress}%</p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Modifié le {new Date(project.modifiedAt).toLocaleDateString('fr-FR')}
          </p>
        </div>

        {/* Delete button */}
        <Button
          variant="destructive"
          size="icon"
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  )
}
