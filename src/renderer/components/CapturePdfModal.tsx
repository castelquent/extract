// Modal that opens over the editor when the user clicks "Image" in the
// MDXEditor toolbar. Renders the article's extract.pdf via pdfjs, lets the
// user navigate pages and draw a single rectangle, then hands the
// normalized rect back to the parent which crops via PyMuPDF (the same
// pipeline as the extraction page) and inserts the resulting JPEG link in
// the markdown.
import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url'
import { Stage, Layer, Rect } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui'
import { ChevronLeft, ChevronRight, Crop, X } from 'lucide-react'

pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker

const MIN_RECT_PX = 8

interface CapturePdfModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Data URL of the article's extract.pdf (from v2_articlesGetExtractData).
  pdfDataUrl: string | null
  // 1-based page to open the modal on. Lets the modal mirror whatever page
  // was active in the viewer pane behind it.
  initialPage?: number
  onConfirm: (page: number, rect: { x1: number; y1: number; x2: number; y2: number }) => Promise<void>
}

export function CapturePdfModal({ open, onOpenChange, pdfDataUrl, initialPage, onConfirm }: CapturePdfModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(0)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const [draft, setDraft] = useState<{ sx: number; sy: number; cx: number; cy: number } | null>(null)
  const [committed, setCommitted] = useState<{ sx: number; sy: number; cx: number; cy: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Load PDF once when the modal opens with a new data URL.
  useEffect(() => {
    if (!open || !pdfDataUrl) return
    let cancelled = false
    let doc: PDFDocumentProxy | null = null
    const load = async () => {
      const loadingTask = pdfjsLib.getDocument({ url: pdfDataUrl })
      doc = await loadingTask.promise
      if (cancelled) {
        doc.destroy()
        return
      }
      setPdfDoc(doc)
      setPages(doc.numPages)
      setPage(Math.min(Math.max(1, initialPage ?? 1), doc.numPages))
    }
    load().catch((err) => console.error('CapturePdfModal load failed:', err))
    return () => {
      cancelled = true
      doc?.destroy()
      setPdfDoc(null)
      setPages(0)
      setPage(1)
      setDraft(null)
      setCommitted(null)
    }
  }, [open, pdfDataUrl])

  // Arrow keys navigate pages while the modal is open. The editor's own
  // arrow-key handler defers when this modal is open (see EditorV2).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && page > 1) {
        e.preventDefault()
        setPage((p) => Math.max(1, p - 1))
      } else if (e.key === 'ArrowRight' && page < pages) {
        e.preventDefault()
        setPage((p) => Math.min(pages, p + 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, page, pages])

  // Render the current page onto the canvas at a generous size.
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || page < 1) return
    let cancelled = false
    const render = async () => {
      const p = await pdfDoc.getPage(page)
      const canvas = canvasRef.current
      if (!canvas || cancelled) return
      const baseViewport = p.getViewport({ scale: 1 })
      // Fit into a comfortable max so big PDFs aren't blown up; small ones
      // stay readable. ~900px height as a soft cap.
      const targetHeight = 900
      const scale = targetHeight / baseViewport.height
      const viewport = p.getViewport({ scale })
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      await p.render({ canvasContext: ctx, viewport }).promise
      if (cancelled) return
      setCanvasSize({ width: viewport.width, height: viewport.height })
      setDraft(null)
      setCommitted(null)
    }
    render()
    return () => {
      cancelled = true
    }
  }, [pdfDoc, page])

  const onMouseDown = (e: KonvaEventObject<MouseEvent>) => {
    if (e.evt.button !== 0) return
    const pos = e.target.getStage()?.getPointerPosition()
    if (!pos) return
    setDraft({ sx: pos.x, sy: pos.y, cx: pos.x, cy: pos.y })
    setCommitted(null)
  }
  const onMouseMove = (e: KonvaEventObject<MouseEvent>) => {
    if (!draft) return
    const pos = e.target.getStage()?.getPointerPosition()
    if (!pos) return
    setDraft({ ...draft, cx: Math.max(0, Math.min(canvasSize.width, pos.x)), cy: Math.max(0, Math.min(canvasSize.height, pos.y)) })
  }
  const onMouseUp = () => {
    if (!draft) return
    const dx = Math.abs(draft.cx - draft.sx)
    const dy = Math.abs(draft.cy - draft.sy)
    if (dx >= MIN_RECT_PX && dy >= MIN_RECT_PX) {
      setCommitted(draft)
    }
    setDraft(null)
  }

  const confirmDisabled = !committed || submitting
  const handleConfirm = async () => {
    if (!committed || canvasSize.width === 0 || canvasSize.height === 0) return
    setSubmitting(true)
    try {
      const rect = {
        x1: Math.min(committed.sx, committed.cx) / canvasSize.width,
        y1: Math.min(committed.sy, committed.cy) / canvasSize.height,
        x2: Math.max(committed.sx, committed.cx) / canvasSize.width,
        y2: Math.max(committed.sy, committed.cy) / canvasSize.height,
      }
      await onConfirm(page, rect)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  const live = draft ?? committed
  const liveX = live ? Math.min(live.sx, live.cx) : 0
  const liveY = live ? Math.min(live.sy, live.cy) : 0
  const liveW = live ? Math.abs(live.cx - live.sx) : 0
  const liveH = live ? Math.abs(live.cy - live.sy) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] p-0 flex flex-col gap-0">
        <DialogHeader className="pl-4 pr-12 py-2 border-b shrink-0 flex flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-base">Capturer une image depuis le PDF</DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm tabular-nums min-w-[60px] text-center">{page} / {pages}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-auto bg-muted/30 flex items-start justify-center p-4">
          <div className="relative" style={{ width: canvasSize.width || 1, height: canvasSize.height || 1 }}>
            <canvas ref={canvasRef} className="block shadow" />
            {canvasSize.width > 0 && (
              <Stage
                width={canvasSize.width}
                height={canvasSize.height}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }}
              >
                <Layer>
                  {live && (
                    <Rect
                      x={liveX}
                      y={liveY}
                      width={liveW}
                      height={liveH}
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dash={draft ? [6, 4] : undefined}
                      fill="rgba(59,130,246,0.2)"
                      listening={false}
                    />
                  )}
                </Layer>
              </Stage>
            )}
          </div>
        </div>
        <DialogFooter className="px-4 py-3 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            <X className="h-4 w-4 mr-2" />
            Annuler
          </Button>
          <Button onClick={handleConfirm} disabled={confirmDisabled}>
            <Crop className="h-4 w-4 mr-2" />
            {submitting ? 'Capture…' : 'Capturer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
