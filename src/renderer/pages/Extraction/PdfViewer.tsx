import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?url'

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker

interface PdfViewerProps {
  projectId: string
  currentPage: number
  onTotalPagesChange: (total: number) => void
  onCanvasReady: (canvas: HTMLCanvasElement) => void
  containerRef: React.RefObject<HTMLDivElement>
}

export function PdfViewer({
  projectId,
  currentPage,
  onTotalPagesChange,
  onCanvasReady,
  containerRef
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const renderingRef = useRef(false)
  const pendingPageRef = useRef<number | null>(null)

  // Load PDF document via IPC
  useEffect(() => {
    if (!projectId) return

    let cancelled = false

    const loadPdf = async () => {
      setLoading(true)
      setError(null)

      try {
        const pdfData = await window.api.getPdfData(projectId)
        if (cancelled) return

        if (!pdfData) {
          throw new Error('PDF non trouvé')
        }

        const doc = await pdfjsLib.getDocument({ data: pdfData }).promise
        if (cancelled) {
          doc.destroy()
          return
        }

        setPdfDoc(doc)
        onTotalPagesChange(doc.numPages)
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading PDF:', err)
          setError(err instanceof Error ? err.message : 'Erreur de chargement du PDF')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadPdf()

    return () => {
      cancelled = true
    }
  }, [projectId, onTotalPagesChange])

  // Render page function (not in useCallback to avoid dependency issues)
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !containerRef.current || currentPage <= 0) return

    const renderPage = async (pageNum: number) => {
      if (renderingRef.current) {
        pendingPageRef.current = pageNum
        return
      }

      renderingRef.current = true

      try {
        const page = await pdfDoc.getPage(pageNum)
        const canvas = canvasRef.current
        const container = containerRef.current
        if (!canvas || !container) return

        const context = canvas.getContext('2d')
        if (!context) return

        const containerWidth = container.clientWidth
        const containerHeight = container.clientHeight

        const baseViewport = page.getViewport({ scale: 1.0 })
        const scaleX = containerWidth / baseViewport.width
        const scaleY = containerHeight / baseViewport.height
        const fitScale = Math.min(scaleX, scaleY) * 0.95

        const viewport = page.getViewport({ scale: fitScale })

        canvas.width = viewport.width
        canvas.height = viewport.height

        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise

        onCanvasReady(canvas)

      } catch (err) {
        console.error('Error rendering page:', err)
      } finally {
        renderingRef.current = false

        if (pendingPageRef.current !== null) {
          const pending = pendingPageRef.current
          pendingPageRef.current = null
          renderPage(pending)
        }
      }
    }

    renderPage(currentPage)
  }, [pdfDoc, currentPage, containerRef, onCanvasReady])

  // Handle window resize
  useEffect(() => {
    if (!pdfDoc) return

    let resizeTimeout: NodeJS.Timeout

    const handleResize = () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        if (canvasRef.current && containerRef.current && currentPage > 0) {
          // Trigger re-render by forcing a state update
          pendingPageRef.current = currentPage
        }
      }, 150)
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      clearTimeout(resizeTimeout)
    }
  }, [pdfDoc, currentPage, containerRef])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Chargement du PDF...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">Erreur: {error}</p>
      </div>
    )
  }

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Aucun PDF chargé</p>
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className="block mx-auto"
    />
  )
}
