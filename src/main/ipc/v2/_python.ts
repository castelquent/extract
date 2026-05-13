// Centralized helpers for spawning Python scripts (PyMuPDF tasks) and other
// generation/conversion utilities used by the v2 IPC handlers.

import { app } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { existsSync, mkdirSync, writeFileSync, unlinkSync, renameSync, rmSync, readFileSync } from 'fs'
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
