// Centralized helpers for spawning Python scripts (PyMuPDF tasks) and other
// generation/conversion utilities used by the v2 IPC handlers.

import { app } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { existsSync, mkdirSync, writeFileSync, unlinkSync, renameSync, rmSync, readFileSync, readdirSync } from 'fs'
import { PDFDocument } from 'pdf-lib'
import type { Zone } from '@shared/types'

const getProjectRoot = (): string => {
  const isDev = !app.isPackaged
  return isDev ? join(process.cwd(), '..') : process.resourcesPath
}

export const getPythonPath = (): string => {
  const root = getProjectRoot()
  if (process.platform === 'win32') {
    return join(root, 'python-portable', 'python.exe')
  }
  return join(root, 'python-portable', 'bin', 'python3')
}

export const getScriptsPath = (): string => join(getProjectRoot(), 'scripts')

// Run a python script with the given args, resolve with its exit code (-1 on error)
const runPython = (args: string[]): Promise<number> =>
  new Promise((resolve) => {
    const proc = spawn(getPythonPath(), args)
    let stderr = ''
    proc.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('close', (code) => {
      if (code !== 0) console.error('Python script failed:', stderr)
      resolve(code ?? -1)
    })
    proc.on('error', (err) => {
      console.error('Python spawn error:', err)
      resolve(-1)
    })
  })

// Run a python script while streaming stdout line-by-line through `onLine`.
// Used by long-running batch jobs to forward progress events back to callers.
const runPythonStreaming = (
  args: string[],
  onLine: (line: string) => void
): Promise<number> =>
  new Promise((resolve) => {
    const proc = spawn(getPythonPath(), args)
    let stderr = ''
    let stdoutBuf = ''
    proc.stdout.on('data', (d) => {
      stdoutBuf += d.toString()
      let idx = stdoutBuf.indexOf('\n')
      while (idx !== -1) {
        const line = stdoutBuf.slice(0, idx).replace(/\r$/, '')
        stdoutBuf = stdoutBuf.slice(idx + 1)
        if (line.length > 0) onLine(line)
        idx = stdoutBuf.indexOf('\n')
      }
    })
    proc.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('close', (code) => {
      if (stdoutBuf.length > 0) onLine(stdoutBuf.replace(/\r$/, ''))
      if (code !== 0) console.error('Python script failed:', stderr)
      resolve(code ?? -1)
    })
    proc.on('error', (err) => {
      console.error('Python spawn error:', err)
      resolve(-1)
    })
  })

// Generate a PNG thumbnail for a PDF at the given output path.
export const generateThumbnail = async (
  pdfPath: string,
  outputPath: string,
  width = 300
): Promise<boolean> => {
  const configPath = join(app.getPath('temp'), `thumb-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(configPath, JSON.stringify({ pdfPath, outputPath, width }))
  const scriptPath = join(getScriptsPath(), 'generate_thumbnail.py')
  const code = await runPython([scriptPath, configPath])
  try { unlinkSync(configPath) } catch {}
  return code === 0 && existsSync(outputPath)
}

// Convert an image (jpg/png) to a PDF.
export const convertImageToPdf = async (imagePath: string, outputPath: string): Promise<boolean> => {
  const configPath = join(app.getPath('temp'), `img2pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(configPath, JSON.stringify({ imagePath, outputPath }))
  const scriptPath = join(getScriptsPath(), 'image_to_pdf.py')
  const code = await runPython([scriptPath, configPath])
  try { unlinkSync(configPath) } catch {}
  return code === 0 && existsSync(outputPath)
}

// Extract the zones of a single article from sourcePdf into a standalone PDF
// at outputPdfPath. Uses scripts/pdf_to_image.py which writes article_1.pdf
// into the provided dir; we then rename to the requested outputPdfPath.
export const generateArticleExtract = async (
  sourcePdfPath: string,
  zones: Zone[],
  outputPdfPath: string
): Promise<boolean> => {
  if (zones.length === 0) return false
  const tempDir = join(app.getPath('temp'), `extract-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(tempDir, { recursive: true })
  const articlesJsonPath = join(tempDir, 'articles.json')
  writeFileSync(articlesJsonPath, JSON.stringify([{ zones }]))

  const scriptPath = join(getScriptsPath(), 'pdf_to_image.py')
  const code = await runPython([scriptPath, sourcePdfPath, tempDir, articlesJsonPath])

  let ok = false
  try {
    const generated = join(tempDir, 'article_1.pdf')
    if (code === 0 && existsSync(generated)) {
      const outDir = join(outputPdfPath, '..')
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
      // If a previous extract.pdf exists (re-generation), remove it first
      if (existsSync(outputPdfPath)) {
        try { unlinkSync(outputPdfPath) } catch {}
      }
      renameSync(generated, outputPdfPath)
      ok = true
    }
  } catch (err) {
    console.error('Failed to move article extract:', err)
  } finally {
    try { rmSync(tempDir, { recursive: true, force: true }) } catch {}
  }
  return ok
}

// Read a PDF's page count using pdf-lib (pure JS, no Python).
export const getPdfPageCount = async (pdfPath: string): Promise<number> => {
  try {
    const bytes = readFileSync(pdfPath)
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
    return doc.getPageCount()
  } catch (err) {
    console.error('Failed to read PDF page count:', err)
    return 0
  }
}

// Render every page of `pdfPath` to a PNG in `outDir` named page_001.png,
// page_002.png, ... and return the produced file paths in order. Used by
// the export pipeline (PNG export + source-image embedding).
export const renderPdfToPngs = async (
  pdfPath: string,
  outDir: string,
  dpi = 200
): Promise<string[]> => {
  if (!existsSync(pdfPath)) return []
  mkdirSync(outDir, { recursive: true })
  const scriptPath = join(getScriptsPath(), 'pdf_to_png.py')
  const code = await runPython([scriptPath, pdfPath, outDir, String(dpi)])
  if (code !== 0) return []
  return readdirSync(outDir)
    .filter((f) => f.startsWith('page_') && f.endsWith('.png'))
    .sort()
    .map((f) => join(outDir, f))
}

// Render a PDF to a single stacked PNG (all pages concatenated vertically).
// Used by the PNG export "per-element" mode.
export const renderPdfToStackedPng = async (
  pdfPath: string,
  outPath: string,
  dpi = 200
): Promise<boolean> => {
  if (!existsSync(pdfPath)) return false
  const outDir = join(outPath, '..')
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  const scriptPath = join(getScriptsPath(), 'pdf_to_stacked_png.py')
  const code = await runPython([scriptPath, pdfPath, outPath, String(dpi)])
  return code === 0 && existsSync(outPath)
}

// Batch-render N PDFs in a single Python process. Without this every article
// spawns its own python.exe; on Windows that's ~300ms per article in startup
// overhead alone.
export type BatchRenderItem =
  | { kind: 'pages'; pdf: string; outDir: string; dpi?: number }
  | { kind: 'stacked'; pdf: string; outPath: string; dpi?: number }

export const renderPdfsBatch = async (
  items: BatchRenderItem[],
  onProgress?: (done: number, total: number) => void
): Promise<boolean> => {
  if (items.length === 0) return true
  const manifestPath = join(
    app.getPath('temp'),
    `render-batch-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  )
  writeFileSync(manifestPath, JSON.stringify(items))
  const scriptPath = join(getScriptsPath(), 'render_pdfs_batch.py')
  try {
    const code = await runPythonStreaming([scriptPath, manifestPath], (line) => {
      if (!onProgress) return
      const parts = line.split('\t')
      if (parts[0] === 'progress' && parts.length >= 3) {
        const done = Number(parts[1])
        const total = Number(parts[2])
        if (Number.isFinite(done) && Number.isFinite(total)) onProgress(done, total)
      }
    })
    return code === 0
  } finally {
    try { unlinkSync(manifestPath) } catch { /* ignore */ }
  }
}

// Strip the text layer from a PDF while preserving images + vector graphics.
// Used to coax Mistral OCR into running pure vision OCR instead of leaning on
// the publisher's text layer (which often carries a wrong multi-column
// reading order that Mistral inherits).
export const stripPdfTextLayer = async (
  pdfIn: string,
  pdfOut: string
): Promise<boolean> => {
  if (!existsSync(pdfIn)) return false
  const scriptPath = join(getScriptsPath(), 'strip_pdf_text.py')
  const code = await runPython([scriptPath, pdfIn, pdfOut])
  return code === 0 && existsSync(pdfOut)
}

// Extract the text layer from a PDF (used for OCR-free quick read).
export const extractPdfText = async (pdfPath: string): Promise<string | null> => {
  if (!existsSync(pdfPath)) return null
  const outputPath = join(app.getPath('temp'), `text-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`)
  const scriptPath = join(getScriptsPath(), 'extract_text.py')
  const code = await runPython([scriptPath, pdfPath, outputPath])
  if (code !== 0) {
    try { if (existsSync(outputPath)) unlinkSync(outputPath) } catch {}
    return null
  }
  try {
    const text = existsSync(outputPath) ? readFileSync(outputPath, 'utf-8') : ''
    try { unlinkSync(outputPath) } catch {}
    return text
  } catch {
    return null
  }
}
