import { Rnd } from 'react-rnd'
import type { Zone } from '@shared/types'
import type { WorkingArticle as Article } from '@/stores/extractionStore'
import { ZoneContextMenu } from './ZoneContextMenu'

interface ZoneBoxProps {
  zone: Zone
  articleNumber: number
  isSelected: boolean
  containerWidth: number
  containerHeight: number
  articles: Article[]
  currentArticleId: number | null
  onSelect: () => void
  onUpdate: (zone: Zone) => void
  onDelete: () => void
  onMoveToArticle: (targetArticleId: number) => void
}

export function ZoneBox({
  zone,
  articleNumber,
  isSelected,
  containerWidth,
  containerHeight,
  articles,
  currentArticleId,
  onSelect,
  onUpdate,
  onDelete,
  onMoveToArticle,
}: ZoneBoxProps) {
  // Convert normalized coordinates (0-1) to pixels
  const x = zone.x1 * containerWidth
  const y = zone.y1 * containerHeight
  const width = (zone.x2 - zone.x1) * containerWidth
  const height = (zone.y2 - zone.y1) * containerHeight

  const handleDragStop = (_e: any, data: { x: number; y: number }) => {
    const newX1 = data.x / containerWidth
    const newY1 = data.y / containerHeight
    const zoneWidth = zone.x2 - zone.x1
    const zoneHeight = zone.y2 - zone.y1

    onUpdate({
      ...zone,
      x1: Math.max(0, Math.min(1 - zoneWidth, newX1)),
      y1: Math.max(0, Math.min(1 - zoneHeight, newY1)),
      x2: Math.max(0, Math.min(1, newX1 + zoneWidth)),
      y2: Math.max(0, Math.min(1, newY1 + zoneHeight)),
    })
  }

  const handleResizeStop = (
    _e: any,
    _direction: any,
    ref: HTMLElement,
    _delta: any,
    position: { x: number; y: number }
  ) => {
    const newWidth = ref.offsetWidth
    const newHeight = ref.offsetHeight

    const newX1 = position.x / containerWidth
    const newY1 = position.y / containerHeight
    const newX2 = (position.x + newWidth) / containerWidth
    const newY2 = (position.y + newHeight) / containerHeight

    onUpdate({
      ...zone,
      x1: Math.max(0, Math.min(1, newX1)),
      y1: Math.max(0, Math.min(1, newY1)),
      x2: Math.max(0, Math.min(1, newX2)),
      y2: Math.max(0, Math.min(1, newY2)),
    })
  }

  return (
    <Rnd
      position={{ x, y }}
      size={{ width, height }}
      onDragStart={onSelect}
      onDragStop={handleDragStop}
      onResizeStart={onSelect}
      onResizeStop={handleResizeStop}
      bounds="parent"
      minWidth={20}
      minHeight={20}
      enableResizing={{
        top: true,
        right: true,
        bottom: true,
        left: true,
        topRight: true,
        bottomRight: true,
        bottomLeft: true,
        topLeft: true,
      }}
      resizeHandleStyles={{
        top: { cursor: 'n-resize' },
        right: { cursor: 'e-resize' },
        bottom: { cursor: 's-resize' },
        left: { cursor: 'w-resize' },
        topRight: { cursor: 'ne-resize' },
        bottomRight: { cursor: 'se-resize' },
        bottomLeft: { cursor: 'sw-resize' },
        topLeft: { cursor: 'nw-resize' },
      }}
      className={`
        zone-box border-2 transition-colors
        ${isSelected
          ? 'border-blue-500 bg-blue-500/30'
          : 'border-green-500 bg-green-500/20 hover:border-green-400'
        }
      `}
      style={{ cursor: 'move' }}
    >
      <ZoneContextMenu
        articles={articles}
        currentArticleId={currentArticleId}
        onDelete={onDelete}
        onMoveToArticle={onMoveToArticle}
      >
        <div className="absolute inset-0">
          <div
            className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-xs font-bold text-white pointer-events-none"
            style={{
              backgroundColor: isSelected ? '#3b82f6' : '#22c55e',
            }}
          >
            {articleNumber}
          </div>

          {/* Resize handles visual indicators */}
          {isSelected && (
            <div className="pointer-events-none">
              {/* Corner handles */}
              <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-blue-500 border border-white rounded-sm" />
              <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 border border-white rounded-sm" />
              <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-blue-500 border border-white rounded-sm" />
              <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-blue-500 border border-white rounded-sm" />

              {/* Edge handles */}
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-blue-500 border border-white rounded-sm" />
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-blue-500 border border-white rounded-sm" />
              <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2.5 h-2.5 bg-blue-500 border border-white rounded-sm" />
              <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2.5 h-2.5 bg-blue-500 border border-white rounded-sm" />
            </div>
          )}
        </div>
      </ZoneContextMenu>
    </Rnd>
  )
}
