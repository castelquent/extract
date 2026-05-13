import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Zone } from '@shared/types'
import type { WorkingArticle as Article } from '@/stores/extractionStore'
import { Badge } from '@/components/ui'
import { ZoneContextMenu } from './ZoneContextMenu'

interface ZoneItemProps {
  zone: Zone
  zoneIndex: number
  articleId: number
  isSelected: boolean
  articles: Article[]
  onSelect: () => void
  onDelete: () => void
  onMoveToArticle: (targetArticleId: number) => void
  onJumpToPage: () => void
}

export function ZoneItem({
  zone,
  zoneIndex,
  articleId,
  isSelected,
  articles,
  onSelect,
  onDelete,
  onMoveToArticle,
  onJumpToPage,
}: ZoneItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `zone-${articleId}-${zoneIndex}`,
    data: { zoneIndex },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <ZoneContextMenu
      articles={articles}
      currentArticleId={articleId}
      onDelete={onDelete}
      onMoveToArticle={onMoveToArticle}
    >
      <Badge
        ref={setNodeRef}
        style={style}
        variant={isSelected ? 'default' : 'outline'}
        className="text-xs cursor-grab active:cursor-grabbing select-none"
        onClick={(e) => {
          e.stopPropagation()
          onSelect()
          onJumpToPage()
        }}
        {...attributes}
        {...listeners}
      >
        Page {zone.page}
      </Badge>
    </ZoneContextMenu>
  )
}
