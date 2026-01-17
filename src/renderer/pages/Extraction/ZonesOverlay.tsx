import { useEffect, useRef, useState, useCallback } from 'react'
import type { Zone, Article } from '@shared/types'
import { ZoneBox } from './ZoneBox'

interface ZonesOverlayProps {
  pdfCanvas: HTMLCanvasElement | null
  currentPage: number
  articles: Article[]
  currentArticleId: number | null
  selectedZoneIndex: number | null
  onZoneCreated: (zone: Zone) => void
  onZoneUpdated: (articleId: number, zoneIndex: number, zone: Zone) => void
  onZoneDeleted: (articleId: number, zoneIndex: number) => void
  onZoneSelected: (articleId: number, zoneIndex: number) => void
  onZoneMoveToArticle: (fromArticleId: number, zoneIndex: number, toArticleId: number) => void
}

interface DrawingRect {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

export function ZonesOverlay({
  pdfCanvas,
  currentPage,
  articles,
  currentArticleId,
  selectedZoneIndex,
  onZoneCreated,
  onZoneUpdated,
  onZoneDeleted,
  onZoneSelected,
  onZoneMoveToArticle,
}: ZonesOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawingRect, setDrawingRect] = useState<DrawingRect | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // Sync container size with PDF canvas
  useEffect(() => {
    if (!pdfCanvas) return

    const updateSize = () => {
      setContainerSize({
        width: pdfCanvas.offsetWidth,
        height: pdfCanvas.offsetHeight,
      })
    }

    updateSize()

    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(pdfCanvas)

    return () => resizeObserver.disconnect()
  }, [pdfCanvas])

  // Get all zones on current page from all articles, with article info
  const pageZonesWithArticle = articles.flatMap((article, articleIndex) =>
    article.zones
      .map((zone, zoneIndex) => ({
        zone,
        zoneIndex,
        articleId: article.id,
        articleNumber: articleIndex + 1,
      }))
      .filter((item) => item.zone.page === currentPage)
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return

      const target = e.target as HTMLElement
      if (target.closest('.zone-box')) return

      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      setIsDrawing(true)
      setDrawingRect({
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
      })
    },
    []
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDrawing || !drawingRect) return

      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const x = Math.max(0, Math.min(e.clientX - rect.left, containerSize.width))
      const y = Math.max(0, Math.min(e.clientY - rect.top, containerSize.height))

      setDrawingRect((prev) =>
        prev
          ? {
              ...prev,
              currentX: x,
              currentY: y,
            }
          : null
      )
    },
    [isDrawing, drawingRect, containerSize]
  )

  const handleMouseUp = useCallback(() => {
    if (!isDrawing || !drawingRect) {
      setIsDrawing(false)
      setDrawingRect(null)
      return
    }

    const minSize = 10
    const width = Math.abs(drawingRect.currentX - drawingRect.startX)
    const height = Math.abs(drawingRect.currentY - drawingRect.startY)

    if (width >= minSize && height >= minSize && containerSize.width > 0 && containerSize.height > 0) {
      const x1 = Math.min(drawingRect.startX, drawingRect.currentX) / containerSize.width
      const y1 = Math.min(drawingRect.startY, drawingRect.currentY) / containerSize.height
      const x2 = Math.max(drawingRect.startX, drawingRect.currentX) / containerSize.width
      const y2 = Math.max(drawingRect.startY, drawingRect.currentY) / containerSize.height

      const newZone: Zone = {
        page: currentPage,
        x1: Math.max(0, Math.min(1, x1)),
        y1: Math.max(0, Math.min(1, y1)),
        x2: Math.max(0, Math.min(1, x2)),
        y2: Math.max(0, Math.min(1, y2)),
      }

      onZoneCreated(newZone)
    }

    setIsDrawing(false)
    setDrawingRect(null)
  }, [isDrawing, drawingRect, containerSize, currentPage, onZoneCreated])

  const drawingPreviewStyle = drawingRect
    ? {
        left: Math.min(drawingRect.startX, drawingRect.currentX),
        top: Math.min(drawingRect.startY, drawingRect.currentY),
        width: Math.abs(drawingRect.currentX - drawingRect.startX),
        height: Math.abs(drawingRect.currentY - drawingRect.startY),
      }
    : null

  return (
    <div
      ref={containerRef}
      className="absolute cursor-crosshair"
      style={{
        width: containerSize.width,
        height: containerSize.height,
        left: '50%',
        transform: 'translateX(-50%)',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* All zones from all articles on current page */}
      {pageZonesWithArticle.map((item) => {
        const isSelected = item.articleId === currentArticleId && item.zoneIndex === selectedZoneIndex
        return (
          <ZoneBox
            key={`${item.articleId}-${item.zoneIndex}`}
            zone={item.zone}
            articleNumber={item.articleNumber}
            isSelected={isSelected}
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
            articles={articles}
            currentArticleId={item.articleId}
            onSelect={() => onZoneSelected(item.articleId, item.zoneIndex)}
            onUpdate={(updatedZone) => onZoneUpdated(item.articleId, item.zoneIndex, updatedZone)}
            onDelete={() => onZoneDeleted(item.articleId, item.zoneIndex)}
            onMoveToArticle={(targetId) => onZoneMoveToArticle(item.articleId, item.zoneIndex, targetId)}
          />
        )
      })}

      {/* Drawing preview */}
      {drawingRect && drawingPreviewStyle && (
        <div
          className="absolute border-2 border-dashed border-blue-500 bg-blue-500/20 pointer-events-none"
          style={drawingPreviewStyle}
        />
      )}
    </div>
  )
}
