import { useEffect, useMemo, useRef, useState } from 'react'
import { Stage, Layer, Rect, Line, Circle, Text, Group, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Zone, PolygonZone, RectZone } from '@shared/types'
import { isPolygonZone, zoneBBox } from '@shared/types'
import { isArticleLocked, type WorkingArticle as Article } from '@/stores/extractionStore'

export type DrawingMode = 'rect' | 'polygon'

interface ZonesOverlayProps {
  pdfCanvas: HTMLCanvasElement | null
  currentPage: number
  articles: Article[]
  currentArticleId: number | null
  selectedZoneIndex: number | null
  drawingMode: DrawingMode
  onZoneCreated: (zone: Zone) => void
  onZoneUpdated: (articleId: number, zoneIndex: number, zone: Zone) => void
  onZoneDeleted: (articleId: number, zoneIndex: number) => void
  onZoneSelected: (articleId: number, zoneIndex: number) => void
  onZoneMoveToArticle: (fromArticleId: number, zoneIndex: number, toArticleId: number) => void
  // Reports true as soon as the user starts placing a rect (mousedown) or
  // posing a polygon vertex. Used by the parent to hide the bottom hint
  // popup while it could be in the way of the aim.
  onDraftingChange?: (drafting: boolean) => void
}

// Distance under which clicking near the first point closes the polygon.
const CLOSE_SNAP_PX = 10
const MIN_RECT_PX = 10

// Snap a cursor position to the dominant axis (X or Y) relative to the
// last placed point. Used by default in polygon mode; user holds Shift to
// disable and place a free diagonal segment.
function snapToAxis(last: [number, number], cur: [number, number]): [number, number] {
  const dx = Math.abs(cur[0] - last[0])
  const dy = Math.abs(cur[1] - last[1])
  return dx >= dy ? [cur[0], last[1]] : [last[0], cur[1]]
}

export function ZonesOverlay({
  pdfCanvas,
  currentPage,
  articles,
  currentArticleId,
  selectedZoneIndex,
  drawingMode,
  onZoneCreated,
  onZoneUpdated,
  onZoneDeleted: _onZoneDeleted,
  onZoneSelected,
  onZoneMoveToArticle: _onZoneMoveToArticle,
  onDraftingChange,
}: ZonesOverlayProps) {
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // In-progress drawing state. Either a draft rect (mousedown→up) or a draft
  // polygon (click-by-click point placement).
  const [draftRect, setDraftRect] = useState<{
    startX: number
    startY: number
    currentX: number
    currentY: number
  } | null>(null)
  const [draftPolygon, setDraftPolygon] = useState<Array<[number, number]> | null>(null)
  // Cursor position used to preview the next polygon segment.
  const [polygonCursor, setPolygonCursor] = useState<[number, number] | null>(null)

  // Sync stage size to the PDF canvas dimensions (incl. zoom).
  useEffect(() => {
    if (!pdfCanvas) return
    const updateSize = () => {
      setContainerSize({ width: pdfCanvas.offsetWidth, height: pdfCanvas.offsetHeight })
    }
    updateSize()
    const ro = new ResizeObserver(updateSize)
    ro.observe(pdfCanvas)
    return () => ro.disconnect()
  }, [pdfCanvas])

  // Cancel any in-progress drawing when switching mode or page.
  useEffect(() => {
    setDraftRect(null)
    setDraftPolygon(null)
    setPolygonCursor(null)
  }, [drawingMode, currentPage])

  // Notify the parent whenever the user is actively drafting a shape, so it
  // can hide overlay popups (like the bottom hint) that would obscure aim.
  useEffect(() => {
    const drafting = !!draftRect || !!(draftPolygon && draftPolygon.length > 0)
    onDraftingChange?.(drafting)
  }, [draftRect, draftPolygon, onDraftingChange])

  // Escape cancels in-progress drawing. Enter closes a polygon (≥3 pts).
  // We skip Enter when a text input is focused so we don't hijack form submit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDraftRect(null)
        setDraftPolygon(null)
        setPolygonCursor(null)
        return
      }
      if (e.key === 'Enter') {
        const t = e.target as HTMLElement | null
        const tag = t?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return
        if (draftPolygon && draftPolygon.length >= 3) {
          e.preventDefault()
          commitPolygon(draftPolygon)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftPolygon])

  const pageZones = useMemo(() => {
    return articles.flatMap((article, articleIndex) =>
      article.zones
        .map((zone, zoneIndex) => ({
          zone,
          zoneIndex,
          articleId: article.id,
          articleNumber: articleIndex + 1,
          locked: isArticleLocked(article),
        }))
        .filter((item) => item.zone.page === currentPage)
    )
  }, [articles, currentPage])

  // Attach the transformer to the currently selected rect zone via a name-
  // based stage lookup. Looking the node up at attach time (rather than
  // caching a ref) makes the transformer auto-detach when the selected zone
  // is unmounted — e.g. after a Delete keypress — instead of leaving its
  // border drawn around the now-destroyed node.
  useEffect(() => {
    const stage = stageRef.current
    const tr = transformerRef.current
    if (!stage || !tr) return
    let node: Konva.Node | null = null
    if (selectedZoneIndex !== null && currentArticleId !== null) {
      node = stage.findOne(`.rect-zone-${currentArticleId}-${selectedZoneIndex}`) ?? null
    }
    tr.nodes(node ? [node] : [])
    tr.getLayer()?.batchDraw()
  }, [selectedZoneIndex, currentArticleId, pageZones, containerSize])

  const w = containerSize.width
  const h = containerSize.height

  // ─── Drawing handlers ────────────────────────────────────────────────────

  const handleStageMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (drawingMode !== 'rect') return
    if (e.target !== e.target.getStage()) return // clicked on a shape
    if (e.evt.button !== 0) return
    const pos = e.target.getStage()?.getPointerPosition()
    if (!pos) return
    setDraftRect({ startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y })
  }

  const handleStageMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    const pos = e.target.getStage()?.getPointerPosition()
    if (!pos) return
    if (drawingMode === 'rect' && draftRect) {
      setDraftRect((d) =>
        d
          ? {
              ...d,
              currentX: Math.max(0, Math.min(pos.x, w)),
              currentY: Math.max(0, Math.min(pos.y, h)),
            }
          : d
      )
    }
    if (drawingMode === 'polygon' && draftPolygon && draftPolygon.length > 0) {
      const cur: [number, number] = [pos.x, pos.y]
      const last = draftPolygon[draftPolygon.length - 1]
      setPolygonCursor(e.evt.shiftKey ? cur : snapToAxis(last, cur))
    } else if (drawingMode === 'polygon') {
      setPolygonCursor([pos.x, pos.y])
    }
  }

  const handleStageMouseUp = () => {
    if (drawingMode !== 'rect' || !draftRect) return
    const dx = Math.abs(draftRect.currentX - draftRect.startX)
    const dy = Math.abs(draftRect.currentY - draftRect.startY)
    if (dx >= MIN_RECT_PX && dy >= MIN_RECT_PX && w > 0 && h > 0) {
      const zone: RectZone = {
        kind: 'rect',
        page: currentPage,
        x1: Math.min(draftRect.startX, draftRect.currentX) / w,
        y1: Math.min(draftRect.startY, draftRect.currentY) / h,
        x2: Math.max(draftRect.startX, draftRect.currentX) / w,
        y2: Math.max(draftRect.startY, draftRect.currentY) / h,
      }
      onZoneCreated(clampRect(zone))
    }
    setDraftRect(null)
  }

  const handleStageClick = (e: KonvaEventObject<MouseEvent>) => {
    if (drawingMode !== 'polygon') return
    if (e.evt.button !== 0) return
    // If user clicked an existing shape, that shape's handler runs separately
    // (selection); we still want to ignore polygon-point placement here.
    if (e.target !== e.target.getStage()) return
    const pos = e.target.getStage()?.getPointerPosition()
    if (!pos) return

    const points = draftPolygon ?? []
    // Snap-close on the RAW pointer position (before axis snap), so the user
    // can always reach the first point regardless of snap state.
    if (points.length >= 3) {
      const [fx, fy] = points[0]
      const dx = pos.x - fx
      const dy = pos.y - fy
      if (Math.sqrt(dx * dx + dy * dy) <= CLOSE_SNAP_PX) {
        commitPolygon(points)
        return
      }
    }
    // Axis snap (X or Y) from the previous point. Shift bypasses for diagonals.
    let placed: [number, number] = [pos.x, pos.y]
    if (points.length > 0 && !e.evt.shiftKey) {
      placed = snapToAxis(points[points.length - 1], placed)
    }
    setDraftPolygon([...points, placed])
  }

  const handleStageDblClick = () => {
    if (drawingMode !== 'polygon' || !draftPolygon) return
    if (draftPolygon.length >= 3) commitPolygon(draftPolygon)
    else {
      setDraftPolygon(null)
      setPolygonCursor(null)
    }
  }

  const commitPolygon = (pointsPx: Array<[number, number]>) => {
    if (w === 0 || h === 0) return
    const normalized: Array<[number, number]> = pointsPx.map(([x, y]) => [
      Math.max(0, Math.min(1, x / w)),
      Math.max(0, Math.min(1, y / h)),
    ])
    const zone: PolygonZone = {
      kind: 'polygon',
      page: currentPage,
      points: normalized,
    }
    onZoneCreated(zone)
    setDraftPolygon(null)
    setPolygonCursor(null)
  }

  // Clicking empty space deselects.
  const handleStageClickDeselect = (e: KonvaEventObject<MouseEvent>) => {
    if (drawingMode === 'polygon') return // in-draw mode, clicks place points
    if (e.target === e.target.getStage()) {
      // Deselection happens implicitly: nothing tracks "selected" outside of
      // (articleId, zoneIndex). The parent passes onZoneSelected — we leave
      // active selection alone here to avoid a parent state thrash. Konva
      // transformer detaches automatically because selectedZoneIndex stays.
    }
  }

  return (
    <div
      className="absolute inset-0"
      style={{ cursor: 'crosshair' }}
    >
      <Stage
        ref={stageRef}
        width={w}
        height={h}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onClick={(e) => {
          handleStageClick(e)
          handleStageClickDeselect(e)
        }}
        onDblClick={handleStageDblClick}
      >
        <Layer>
          {pageZones.map((item) => {
            const isSelected =
              item.articleId === currentArticleId && item.zoneIndex === selectedZoneIndex
            if (isPolygonZone(item.zone)) {
              return (
                <PolygonZoneNode
                  key={`${item.articleId}-${item.zoneIndex}`}
                  zone={item.zone}
                  articleId={item.articleId}
                  zoneIndex={item.zoneIndex}
                  articleNumber={item.articleNumber}
                  containerWidth={w}
                  containerHeight={h}
                  isSelected={isSelected}
                  locked={item.locked}
                  onSelect={() => onZoneSelected(item.articleId, item.zoneIndex)}
                  onUpdate={(updated) =>
                    onZoneUpdated(item.articleId, item.zoneIndex, updated)
                  }
                />
              )
            }
            return (
              <RectZoneNode
                key={`${item.articleId}-${item.zoneIndex}`}
                zone={item.zone}
                articleId={item.articleId}
                zoneIndex={item.zoneIndex}
                articleNumber={item.articleNumber}
                containerWidth={w}
                containerHeight={h}
                isSelected={isSelected}
                locked={item.locked}
                onSelect={() => onZoneSelected(item.articleId, item.zoneIndex)}
                onUpdate={(updated) =>
                  onZoneUpdated(item.articleId, item.zoneIndex, updated)
                }
              />
            )
          })}

          {/* Draft rect preview */}
          {draftRect && (
            <Rect
              x={Math.min(draftRect.startX, draftRect.currentX)}
              y={Math.min(draftRect.startY, draftRect.currentY)}
              width={Math.abs(draftRect.currentX - draftRect.startX)}
              height={Math.abs(draftRect.currentY - draftRect.startY)}
              stroke="#3b82f6"
              strokeWidth={2}
              dash={[6, 4]}
              fill="rgba(59,130,246,0.2)"
              listening={false}
            />
          )}

          {/* Draft polygon preview */}
          {draftPolygon && draftPolygon.length > 0 && (
            <>
              <Line
                points={[
                  ...draftPolygon.flat(),
                  ...(polygonCursor ?? draftPolygon[draftPolygon.length - 1]),
                ]}
                stroke="#3b82f6"
                strokeWidth={2}
                dash={[6, 4]}
                fill="rgba(59,130,246,0.15)"
                closed={draftPolygon.length >= 2}
                listening={false}
              />
              {draftPolygon.map(([px, py], i) => (
                <Circle
                  key={`draft-vertex-${i}`}
                  x={px}
                  y={py}
                  radius={4}
                  fill={i === 0 ? '#ef4444' : '#3b82f6'}
                  stroke="white"
                  strokeWidth={1}
                  listening={false}
                />
              ))}
            </>
          )}

          <Transformer
            ref={transformerRef}
            rotateEnabled={false}
            keepRatio={false}
            anchorSize={9}
            borderStroke="#3b82f6"
            anchorStroke="#3b82f6"
            anchorFill="#3b82f6"
            anchorCornerRadius={1}
            enabledAnchors={[
              'top-left',
              'top-center',
              'top-right',
              'middle-left',
              'middle-right',
              'bottom-left',
              'bottom-center',
              'bottom-right',
            ]}
            boundBoxFunc={(_oldBox, newBox) => {
              if (newBox.width < MIN_RECT_PX || newBox.height < MIN_RECT_PX) return _oldBox
              return newBox
            }}
          />
        </Layer>
      </Stage>
    </div>
  )
}

// ─── Rect zone node ────────────────────────────────────────────────────────

interface RectZoneNodeProps {
  zone: RectZone
  articleId: number
  zoneIndex: number
  articleNumber: number
  containerWidth: number
  containerHeight: number
  isSelected: boolean
  locked: boolean
  onSelect: () => void
  onUpdate: (zone: RectZone) => void
}

function RectZoneNode({
  zone,
  articleId,
  zoneIndex,
  articleNumber,
  containerWidth,
  containerHeight,
  isSelected,
  locked,
  onSelect,
  onUpdate,
}: RectZoneNodeProps) {
  const rectRef = useRef<Konva.Rect | null>(null)

  const x = zone.x1 * containerWidth
  const y = zone.y1 * containerHeight
  const width = (zone.x2 - zone.x1) * containerWidth
  const height = (zone.y2 - zone.y1) * containerHeight

  const stroke = isSelected ? '#3b82f6' : locked ? '#f59e0b' : '#22c55e'
  const fill = isSelected
    ? 'rgba(59,130,246,0.3)'
    : locked
      ? 'rgba(245,158,11,0.15)'
      : 'rgba(34,197,94,0.2)'

  const rectWidth = width
  const rectHeight = height

  return (
    <Group>
      <Rect
        ref={(n) => {
          rectRef.current = n
        }}
        name={`rect-zone-${articleId}-${zoneIndex}`}
        x={x}
        y={y}
        width={rectWidth}
        height={rectHeight}
        stroke={stroke}
        strokeWidth={2}
        fill={fill}
        draggable={!locked}
        // Constrain dragging so the rect stays fully within the page.
        // Doing it here (not in onDragEnd) prevents the rect from being
        // visually pulled outside and then snapped back / clipped.
        dragBoundFunc={(pos) => ({
          x: Math.max(0, Math.min(containerWidth - rectWidth, pos.x)),
          y: Math.max(0, Math.min(containerHeight - rectHeight, pos.y)),
        })}
        onClick={(e) => {
          e.cancelBubble = true
          onSelect()
        }}
        onMouseDown={(e) => {
          e.cancelBubble = true
          onSelect()
        }}
        onDragEnd={(e) => {
          const node = e.target
          const nx1 = node.x() / containerWidth
          const ny1 = node.y() / containerHeight
          const dx = zone.x2 - zone.x1
          const dy = zone.y2 - zone.y1
          onUpdate({
            kind: 'rect',
            page: zone.page,
            x1: nx1,
            y1: ny1,
            x2: nx1 + dx,
            y2: ny1 + dy,
          })
        }}
        onTransformEnd={(e) => {
          const node = e.target as Konva.Rect
          const sx = node.scaleX()
          const sy = node.scaleY()
          const newW = node.width() * sx
          const newH = node.height() * sy
          const nx1 = node.x() / containerWidth
          const ny1 = node.y() / containerHeight
          const nx2 = (node.x() + newW) / containerWidth
          const ny2 = (node.y() + newH) / containerHeight
          // Reset scale so future drags don't compound.
          node.scaleX(1)
          node.scaleY(1)
          node.width(newW)
          node.height(newH)
          onUpdate(
            clampRect({
              kind: 'rect',
              page: zone.page,
              x1: nx1,
              y1: ny1,
              x2: nx2,
              y2: ny2,
            })
          )
        }}
      />
      <ZoneLabel
        x={x + 4}
        y={y + 4}
        number={articleNumber}
        selected={isSelected}
      />
    </Group>
  )
}

// ─── Polygon zone node ────────────────────────────────────────────────────

interface PolygonZoneNodeProps {
  zone: PolygonZone
  articleId: number
  zoneIndex: number
  articleNumber: number
  containerWidth: number
  containerHeight: number
  isSelected: boolean
  locked: boolean
  onSelect: () => void
  onUpdate: (zone: PolygonZone) => void
}

function PolygonZoneNode({
  zone,
  articleId: _articleId,
  zoneIndex: _zoneIndex,
  articleNumber,
  containerWidth,
  containerHeight,
  isSelected,
  locked,
  onSelect,
  onUpdate,
}: PolygonZoneNodeProps) {
  const lineRef = useRef<Konva.Line | null>(null)

  const pxPoints = zone.points.map<[number, number]>(([nx, ny]) => [
    nx * containerWidth,
    ny * containerHeight,
  ])

  const stroke = isSelected ? '#3b82f6' : locked ? '#f59e0b' : '#22c55e'
  const fill = isSelected
    ? 'rgba(59,130,246,0.3)'
    : locked
      ? 'rgba(245,158,11,0.15)'
      : 'rgba(34,197,94,0.2)'

  const bbox = zoneBBox(zone)
  const labelX = bbox.x1 * containerWidth + 4
  const labelY = bbox.y1 * containerHeight + 4

  // Pre-compute the polygon's pixel bbox so dragBoundFunc can constrain the
  // whole shape without distorting individual vertices. (Per-vertex clamping
  // would deform the polygon when one corner reaches the edge.)
  const xs = pxPoints.map((p) => p[0])
  const ys = pxPoints.map((p) => p[1])
  const minPx = Math.min(...xs)
  const maxPx = Math.max(...xs)
  const minPy = Math.min(...ys)
  const maxPy = Math.max(...ys)

  // The Group (not the Line) carries the drag — otherwise the Line translates
  // alone and the vertex handles + label desync. The Line itself does NOT
  // stop event bubbling, so Konva walks up and finds the Group as the
  // draggable target.
  return (
    <Group
      x={0}
      y={0}
      draggable={!locked}
      dragBoundFunc={(pos) => ({
        x: Math.max(-minPx, Math.min(containerWidth - maxPx, pos.x)),
        y: Math.max(-minPy, Math.min(containerHeight - maxPy, pos.y)),
      })}
      onDragStart={onSelect}
      onDragEnd={(e) => {
        const node = e.target
        const dx = node.x()
        const dy = node.y()
        // react-konva skips reconciling x/y when the prop value (0) is
        // unchanged across renders, so we must reset the Konva position
        // imperatively. Without this, the next render keeps the drag
        // transform AND applies the translated points → double offset.
        node.position({ x: 0, y: 0 })
        const newPoints: Array<[number, number]> = zone.points.map(([nx, ny]) => [
          nx + dx / containerWidth,
          ny + dy / containerHeight,
        ])
        onUpdate({ kind: 'polygon', page: zone.page, points: newPoints })
      }}
    >
      <Line
        ref={(n) => {
          lineRef.current = n
        }}
        points={pxPoints.flat()}
        closed
        stroke={stroke}
        strokeWidth={2}
        fill={fill}
        onClick={onSelect}
      />
      {isSelected && !locked &&
        pxPoints.map(([px, py], i) => (
          <Circle
            key={`vertex-${i}`}
            x={px}
            y={py}
            radius={5}
            fill="#3b82f6"
            stroke="white"
            strokeWidth={1.5}
            draggable
            onMouseDown={(e) => {
              e.cancelBubble = true
            }}
            onDragMove={(e) => {
              // Live update so the polygon fill follows the vertex.
              const node = e.target
              const updated = [...pxPoints]
              updated[i] = [node.x(), node.y()]
              lineRef.current?.points(updated.flat())
              lineRef.current?.getLayer()?.batchDraw()
            }}
            onDragEnd={(e) => {
              const node = e.target
              const nx = Math.max(0, Math.min(1, node.x() / containerWidth))
              const ny = Math.max(0, Math.min(1, node.y() / containerHeight))
              const newPoints: Array<[number, number]> = zone.points.map(
                (p, idx): [number, number] => (idx === i ? [nx, ny] : p)
              )
              onUpdate({ kind: 'polygon', page: zone.page, points: newPoints })
            }}
          />
        ))}
      <ZoneLabel x={labelX} y={labelY} number={articleNumber} selected={isSelected} />
    </Group>
  )
}

// ─── Article number label ─────────────────────────────────────────────────

function ZoneLabel({
  x,
  y,
  number,
  selected,
}: {
  x: number
  y: number
  number: number
  selected: boolean
}) {
  const label = String(number)
  const padX = 6
  const padY = 2
  const fontSize = 11
  const textWidth = label.length * 7 + padX * 2
  const textHeight = fontSize + padY * 2
  return (
    <Group listening={false} x={x} y={y}>
      <Rect
        width={textWidth}
        height={textHeight}
        fill={selected ? '#3b82f6' : '#22c55e'}
        cornerRadius={3}
      />
      <Text
        text={label}
        fontSize={fontSize}
        fontStyle="bold"
        fill="white"
        x={padX}
        y={padY}
      />
    </Group>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function clampRect(z: RectZone): RectZone {
  return {
    kind: 'rect',
    page: z.page,
    x1: Math.max(0, Math.min(1, z.x1)),
    y1: Math.max(0, Math.min(1, z.y1)),
    x2: Math.max(0, Math.min(1, z.x2)),
    y2: Math.max(0, Math.min(1, z.y2)),
  }
}
