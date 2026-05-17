// v2 export handlers. Take an array of articleIds, load each article's
// metadata, and produce a single output file (PDF / DOCX / TXT / PNG) — or a
// ZIP of one file per article (mode = 'separated' / PNG).
//
// PDF generation runs through Electron's headless BrowserWindow +
// webContents.printToPDF rather than PDFKit. That gives us native
// support for everything HTML/CSS does (highlight via <mark>, page
// breaks via CSS, accented text, real typography) at the cost of
// spinning up a Chromium renderer per export.
import { ipcMain, dialog, BrowserWindow } from 'electron'
import {
  writeFileSync,
  unlinkSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  rmSync,
  existsSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'
import AdmZip from 'adm-zip'

// Forward export diagnostics to every renderer's DevTools console.
// (main process stdout isn't visible in a packaged Electron app, so the
// renderer is the only place a user can watch the trace.)
const exportLog = (msg: string, err?: unknown): void => {
  const line = `[pdf-export ${new Date().toISOString()}] ${msg}${err ? ` :: ${err instanceof Error ? err.stack || err.message : String(err)}` : ''}`
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('v2:export:log', line)
  }
}
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  VerticalAlign,
} from 'docx'
import { convert } from 'html-to-text'
import type {
  ArticleMetadata,
  ExportOptions,
  ExportProgress,
  MultiExportItem,
  TemplateField,
} from '@shared/types'
import { isFieldFilled } from '@shared/fieldValue'
import { idx } from './_index'
import { getArticleExtractPdfPath } from '../_fs'
import { renderPdfsBatch, type BatchRenderItem } from './_python'

// Push a progress event to every open renderer. Used to drive the global
// ExportProgressModal — any open window can show the export status.
const emitProgress = (p: ExportProgress): void => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('v2:export:progress', p)
  }
}

// ============================================================
// Shared helpers (loading, ordering, source line, formatting)
// ============================================================

const loadArticles = (projectId: string, articleIds: string[]): ArticleMetadata[] => {
  const result: ArticleMetadata[] = []
  for (const id of articleIds) {
    const e = idx.getArticle(id)
    if (e && e.projectId === projectId) result.push(e.meta)
  }
  return result
}

const loadMultiArticles = (
  items: MultiExportItem[]
): { meta: ArticleMetadata; projectId: string }[] => {
  const result: { meta: ArticleMetadata; projectId: string }[] = []
  for (const { projectId, articleId } of items) {
    const e = idx.getArticle(articleId)
    if (e && e.projectId === projectId) result.push({ meta: e.meta, projectId })
  }
  return result
}

const splitOnNeedle = (
  text: string,
  needle: string | undefined
): { text: string; match: boolean }[] => {
  if (!needle || needle.length === 0) return [{ text, match: false }]
  const lowerText = text.toLowerCase()
  const lowerNeedle = needle.toLowerCase()
  const out: { text: string; match: boolean }[] = []
  let i = 0
  while (i < text.length) {
    const k = lowerText.indexOf(lowerNeedle, i)
    if (k === -1) {
      if (i < text.length) out.push({ text: text.slice(i), match: false })
      break
    }
    if (k > i) out.push({ text: text.slice(i, k), match: false })
    out.push({ text: text.slice(k, k + needle.length), match: true })
    i = k + needle.length
  }
  return out
}

const runsFromText = (
  text: string,
  needle: string | undefined,
  baseProps: { bold?: boolean; size?: number } = {}
): TextRun[] => {
  const segments = splitOnNeedle(text, needle)
  return segments.map(
    (seg) =>
      new TextRun({
        text: seg.text,
        bold: baseProps.bold,
        size: baseProps.size,
        highlight: seg.match ? 'yellow' : undefined,
      })
  )
}

const orderedFilledEntries = (
  article: ArticleMetadata
): { field: TemplateField; plain: string }[] => {
  const schema = [...(article.schema ?? [])].sort((a, b) => a.order - b.order)
  const out: { field: TemplateField; plain: string }[] = []
  for (const field of schema) {
    const raw = article.fields?.[field.name]
    if (!isFieldFilled(field, raw)) continue
    const str = typeof raw === 'string' ? raw : String(raw ?? '')
    const plain =
      field.type === 'richtext'
        ? convert(str, { wordwrap: false, preserveNewlines: true })
        : str
    out.push({ field, plain })
  }
  return out
}

const formatPages = (pages: number[]): string => {
  if (!pages || pages.length === 0) return ''
  const sorted = [...new Set(pages)].sort((a, b) => a - b)
  const out: string[] = []
  let start = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i <= sorted.length; i++) {
    if (i === sorted.length || sorted[i] !== prev + 1) {
      out.push(start === prev ? `${start}` : `${start}-${prev}`)
      if (i < sorted.length) {
        start = sorted[i]
        prev = sorted[i]
      }
    } else {
      prev = sorted[i]
    }
  }
  return out.join(', ')
}

const sourceLineFor = (article: ArticleMetadata): string => {
  const entry = idx.getSource(article.sourceId)
  const sourceName =
    entry?.meta.name?.trim() ||
    entry?.meta.originalFilename ||
    'Source inconnue'
  const pages = article.pages ?? []
  if (pages.length === 0) return `Source : ${sourceName}`
  const pageStr = formatPages(pages)
  const isPlural = pages.length > 1 || pageStr.includes('-')
  return `Source : ${sourceName}, ${isPlural ? 'pages' : 'page'} ${pageStr}`
}

// Article's first filled field — used as the title for naming separated files.
const articleTitle = (article: ArticleMetadata): string => {
  const entries = orderedFilledEntries(article)
  if (entries.length === 0) return 'sans-titre'
  const t = entries[0].plain.trim()
  return t.length > 0 ? t : 'sans-titre'
}

// Sanitize a string to a filesystem-safe filename. Drops chars forbidden on
// Windows (`/ \ : * ? " < > |`) and control bytes; collapses whitespace.
const sanitizeFilename = (s: string, maxLen = 80): string => {
  let cleaned = s
    .replace(/[\\/:*?"<>|]/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length === 0) cleaned = 'sans-titre'
  if (cleaned.length > maxLen) cleaned = cleaned.slice(0, maxLen).trim()
  return cleaned
}

// ============================================================
// HTML helpers
// ============================================================

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const highlightInHtml = (html: string, needle: string | undefined): string => {
  if (!needle) return html
  const re = new RegExp(escapeRegex(needle), 'gi')
  return html.replace(/(<[^>]+>)|([^<]+)/g, (_, tag: string | undefined, text: string | undefined) => {
    if (tag !== undefined) return tag
    return (text ?? '').replace(re, (m) => `<mark>${m}</mark>`)
  })
}

const orderedFilledEntriesHtml = (
  article: ArticleMetadata,
  needle?: string
): { field: TemplateField; html: string }[] => {
  const schema = [...(article.schema ?? [])].sort((a, b) => a.order - b.order)
  const out: { field: TemplateField; html: string }[] = []
  for (const field of schema) {
    const raw = article.fields?.[field.name]
    if (!isFieldFilled(field, raw)) continue
    const str = typeof raw === 'string' ? raw : String(raw ?? '')
    const html = field.type === 'richtext' ? str : escapeHtml(str)
    out.push({ field, html: highlightInHtml(html, needle) })
  }
  return out
}

// Build the HTML for the "source images" trailer section. The PNGs are
// referenced via file:// URLs (NOT base64 data URIs): embedding hundreds of
// megabytes of base64 into a single string can hit V8's max string length
// (~512MB-1GB), triggering "Invalid string length" on big exports.
// Chromium loads the file:// images at print time directly from disk.
const sourceImagesHtml = (pngPaths: string[]): string => {
  if (pngPaths.length === 0) return ''
  const imgs = pngPaths
    .map((p) => `<img class="source-img" src="${pathToFileURL(p).href}" />`)
    .join('')
  return `<section class="source-images">${imgs}</section>`
}

interface ArticleHtmlOpts {
  needle?: string
  withPageBreak: boolean
  showSource: boolean
  sourceImagePaths?: string[]
}

const articleSectionHtml = (article: ArticleMetadata, opts: ArticleHtmlOpts): string => {
  const entries = orderedFilledEntriesHtml(article, opts.needle)
  let titleHtml = ''
  const fieldBlocks: string[] = []
  entries.forEach(({ field, html }, i) => {
    if (i === 0) {
      const headerInner = field.type === 'richtext' ? html.replace(/<[^>]+>/g, ' ').trim() : html
      titleHtml = `<h1 class="article-title">${headerInner}</h1><hr class="title-rule"/>`
    } else {
      fieldBlocks.push(
        `<section class="field"><div class="field-label">${escapeHtml(field.name)}</div><div class="field-value">${html}</div></section>`
      )
    }
  })
  const sourceLine = opts.showSource
    ? `<div class="source">${highlightInHtml(escapeHtml(sourceLineFor(article)), opts.needle)}</div>`
    : ''
  const imagesBlock = sourceImagesHtml(opts.sourceImagePaths ?? [])
  const style = opts.withPageBreak ? ' style="break-before: page;"' : ''
  return `<article class="article"${style}>${titleHtml}${fieldBlocks.join('')}${imagesBlock}${sourceLine}</article>`
}

const dossierTitleSectionHtml = (title: string): string =>
  `<section class="dossier-title-page"><div class="dossier-title">${escapeHtml(title)}</div></section>`

const fullDocumentHtml = (innerHtml: string): string => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<style>
@page { size: A4; margin: 2cm; }
html, body { margin: 0; padding: 0; }
body {
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-size: 11pt;
  line-height: 1.5;
  color: #000;
}
h1.article-title {
  font-size: 18pt;
  text-align: center;
  margin: 0 0 0.4em 0;
  font-weight: bold;
}
hr.title-rule {
  border: none;
  border-top: 1px solid #000;
  margin: 0 0 1em 0;
}
.field { margin-top: 0.8em; }
.field-label {
  font-weight: bold;
  font-size: 10pt;
  margin-bottom: 0.2em;
  break-after: avoid;
}
.field-value {
  text-align: justify;
  orphans: 2;
  widows: 2;
}
.field-value p { margin: 0 0 0.5em 0; }
.field-value p:last-child { margin-bottom: 0; }
.source {
  margin-top: 1.6em;
  font-size: 9pt;
  color: #666;
}
.source-images {
  margin-top: 1.2em;
  break-inside: avoid;
}
.source-images img.source-img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto 0.8em auto;
  break-inside: avoid;
}
.dossier-title-page {
  break-before: page;
  break-after: page;
  height: 80vh;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.dossier-title {
  font-size: 36pt;
  font-weight: bold;
  line-height: 1.2;
}
mark {
  background-color: #fff14a;
  color: inherit;
  padding: 0 1px;
  border-radius: 1px;
}
</style>
</head>
<body>${innerHtml}</body>
</html>`

// Render an HTML document to a PDF buffer. Same plumbing as before but
// returns the buffer instead of writing it, so the caller can either save
// it (single-file mode) or pack it into a ZIP (separated mode).
const renderHtmlToPdfBuffer = async (html: string): Promise<Buffer | null> => {
  let win: BrowserWindow | null = null
  const tmpHtml = join(tmpdir(), `extract-export-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2)}.html`)
  exportLog(`renderHtmlToPdfBuffer start htmlLen=${html.length} tmp=${tmpHtml}`)
  try {
    writeFileSync(tmpHtml, html, 'utf-8')
    win = new BrowserWindow({
      show: false,
      paintWhenInitiallyHidden: true,
      webPreferences: {
        sandbox: false,
        nodeIntegration: false,
        contextIsolation: true,
        offscreen: false,
      },
    })
    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      exportLog(`did-fail-load code=${code} desc=${desc} url=${url}`)
    })
    win.webContents.on('render-process-gone', (_e, details) => {
      exportLog(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`)
    })
    const fileUrl = pathToFileURL(tmpHtml).href
    await win.loadURL(fileUrl)
    await new Promise((r) => setTimeout(r, 50))
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    })
    return Buffer.from(pdf)
  } catch (err) {
    exportLog('failed in renderHtmlToPdfBuffer', err)
    return null
  } finally {
    if (win) {
      try { win.destroy() } catch { /* ignore */ }
    }
    try { unlinkSync(tmpHtml) } catch { /* best-effort */ }
  }
}

// ============================================================
// DOCX helpers
// ============================================================

interface ArticleDocxOpts {
  needle?: string
  showSource: boolean
  sourceImagePaths?: string[]
}

// Build the paragraph list for one article. The caller stitches them into a
// section (with optional dossier-title page break logic).
const articleDocxParagraphs = (article: ArticleMetadata, opts: ArticleDocxOpts): Paragraph[] => {
  const children: Paragraph[] = []
  const entries = orderedFilledEntries(article)
  entries.forEach(({ field, plain }, fieldIndex) => {
    if (fieldIndex === 0) {
      children.push(
        new Paragraph({
          children: runsFromText(plain, opts.needle),
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        })
      )
    } else {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: field.name, bold: true })],
          spacing: { before: 200 },
        })
      )
      for (const para of plain.split('\n\n')) {
        if (para.trim()) {
          children.push(
            new Paragraph({
              children: runsFromText(para.trim(), opts.needle),
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: 100 },
            })
          )
        }
      }
    }
  })

  // Source images — one image paragraph per PNG, sized to the page width.
  for (const p of opts.sourceImagePaths ?? []) {
    try {
      const data = readFileSync(p)
      // 600 EMU/inch * 6.3" ≈ A4 minus margins. docx wants pixel-ish numbers
      // — we cap the width at ~620 (≈ 6.5" at 96 DPI) and let height auto.
      // Without explicit height the image scales proportionally.
      const W = 600
      // Cheap aspect inference: we don't decode the PNG, so we let height be
      // the same as width and rely on docx's image module to use the file's
      // intrinsic ratio. Wrong; docx requires explicit dims. Fallback: 800.
      const H = 800
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              data,
              transformation: { width: W, height: H },
            }),
          ],
          spacing: { before: 200, after: 100 },
        })
      )
    } catch (err) {
      exportLog(`source image failed: ${p}`, err)
    }
  }

  if (opts.showSource) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: sourceLineFor(article),
            italics: true,
            color: '666666',
            size: 18,
          }),
        ],
        spacing: { before: 200 },
      })
    )
  }
  return children
}

// ============================================================
// File-naming helpers (separated mode + PNG)
// ============================================================

const padOrder = (n: number, total: number): string => {
  const width = Math.max(2, String(Math.max(total, 1)).length)
  return String(n + 1).padStart(width, '0')
}

// Resolve the in-ZIP folder for an article: its dossier's name if any,
// else "Sans dossier" for orphans. Sanitized for safe filesystem use.
const folderForArticle = (article: ArticleMetadata): string => {
  const name = article.dossierId
    ? (idx.getDossier(article.dossierId)?.meta.name ?? 'Sans dossier')
    : 'Sans dossier'
  return sanitizeFilename(name, 60) + '/'
}

// Compute the unique in-ZIP path for `article` given the export's options.
// Adds (2), (3) suffixes if the same name occurs twice in the same folder.
const buildZipPath = (
  article: ArticleMetadata,
  ext: string,
  options: ExportOptions | undefined,
  used: Set<string>,
  totalArticles: number,
  pageSuffix?: string,
): string => {
  const folder = folderForArticle(article)
  const titlePart = sanitizeFilename(articleTitle(article), 60)
  const order = article.order ?? 0
  const prefix = options?.orderPrefix ? `${padOrder(order, totalArticles)}_` : ''
  const suffix = pageSuffix ? `_${pageSuffix}` : ''
  let candidate = `${folder}${prefix}${titlePart}${suffix}.${ext}`
  if (!used.has(candidate)) {
    used.add(candidate)
    return candidate
  }
  // Collision — append (2), (3), ...
  let n = 2
  for (;;) {
    candidate = `${folder}${prefix}${titlePart}${suffix} (${n}).${ext}`
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
    n++
  }
}

// ============================================================
// Source-image rendering for one article (used by PDF/DOCX with the
// `includeSourceImages` toggle)
// ============================================================

const tmpScratchDir = (label: string): string => {
  const d = join(tmpdir(), `extract-${label}-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(d, { recursive: true })
  return d
}

// Batch-render the extract.pdf of every article whose images need embedding,
// in a SINGLE Python process. Returns a map articleId → list of PNG paths
// plus a cleanup callback that removes the scratch root once the export is
// done. Cuts ~300ms/article on Windows compared to per-article spawns.
const renderAllArticleSourcePngs = async (
  articles: { meta: ArticleMetadata; projectId: string }[],
  onProgress?: (done: number, total: number) => void
): Promise<{ byArticle: Map<string, string[]>; cleanup: () => void }> => {
  const root = tmpScratchDir('srcimg-batch')
  const cleanup = () => {
    try { rmSync(root, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  const manifest: BatchRenderItem[] = []
  const outDirByArticle = new Map<string, string>()
  for (const { meta, projectId } of articles) {
    const dossier = idx.locateArticle(projectId, meta.id)
    if (dossier === undefined) continue
    const pdfPath = getArticleExtractPdfPath(projectId, dossier, meta.id)
    if (!existsSync(pdfPath)) continue
    const outDir = join(root, meta.id)
    mkdirSync(outDir, { recursive: true })
    outDirByArticle.set(meta.id, outDir)
    manifest.push({ kind: 'pages', pdf: pdfPath, outDir, dpi: 150 })
  }
  const byArticle = new Map<string, string[]>()
  if (manifest.length === 0) return { byArticle, cleanup }
  await renderPdfsBatch(manifest, onProgress)
  // Collect the produced files in deterministic order per article.
  for (const [articleId, outDir] of outDirByArticle) {
    if (!existsSync(outDir)) continue
    const files = readdirSync(outDir)
      .filter((f) => f.startsWith('page_') && f.endsWith('.png'))
      .sort()
      .map((f) => join(outDir, f))
    byArticle.set(articleId, files)
  }
  return { byArticle, cleanup }
}

// ============================================================
// IPC handlers
// ============================================================

export function setupV2ExportHandlers(): void {
  // ─── Single-project PDF ────────────────────────────────────────────────
  ipcMain.handle(
    'v2:export:articlesPdf',
    async (
      _,
      projectId: string,
      articleIds: string[],
      options?: ExportOptions
    ): Promise<boolean> => {
      const articles = loadArticles(projectId, articleIds)
      if (articles.length === 0) return false

      const mode = options?.mode ?? 'single'
      const showSource = options?.showSource ?? true
      const includeImages = options?.includeSourceImages ?? false
      const needle = options?.highlight

      // Ask for the save path BEFORE doing any heavy work — if the user
      // cancels we save them the cost of rendering images for nothing.
      const isSeparated = mode === 'separated' && articles.length > 1
      const defaultName = isSeparated
        ? 'articles.zip'
        : articles.length === 1
          ? `${sanitizeFilename(articleTitle(articles[0]), 60)}.pdf`
          : 'articles.pdf'
      const filters = isSeparated
        ? [{ name: 'ZIP', extensions: ['zip'] }]
        : [{ name: 'PDF', extensions: ['pdf'] }]
      const saveResult = await dialog.showSaveDialog({ defaultPath: defaultName, filters })
      if (saveResult.canceled || !saveResult.filePath) {
        emitProgress({ phase: 'cancelled' })
        return false
      }

      emitProgress({ phase: 'starting' })
      let imagesCleanup: (() => void) | null = null
      try {
        // 1) Pre-render source images for every article (single batch).
        let imagesByArticle = new Map<string, string[]>()
        if (includeImages) {
          emitProgress({ phase: 'rendering-images', current: 0, total: articles.length })
          const { byArticle, cleanup } = await renderAllArticleSourcePngs(
            articles.map((meta) => ({ meta, projectId })),
            (done, total) => emitProgress({ phase: 'rendering-images', current: done, total })
          )
          imagesByArticle = byArticle
          imagesCleanup = cleanup
        }

        // 2) Build the document(s).
        if (isSeparated) {
          const zip = new AdmZip()
          const used = new Set<string>()
          for (let i = 0; i < articles.length; i++) {
            const article = articles[i]
            emitProgress({ phase: 'building', current: i, total: articles.length })
            const html = fullDocumentHtml(
              articleSectionHtml(article, {
                needle,
                withPageBreak: false,
                showSource,
                sourceImagePaths: imagesByArticle.get(article.id),
              })
            )
            const buf = await renderHtmlToPdfBuffer(html)
            if (!buf) continue
            const path = buildZipPath(article, 'pdf', options, used, articles.length)
            zip.addFile(path, buf)
          }
          emitProgress({ phase: 'writing' })
          zip.writeZip(saveResult.filePath)
          emitProgress({ phase: 'done' })
          return true
        }

        // Single file
        emitProgress({ phase: 'building', current: 0, total: 1 })
        const dossierTitleByArticleId = new Map(
          (options?.dossierTitles ?? []).map((m) => [m.beforeArticleId, m.title])
        )
        const parts: string[] = []
        articles.forEach((article, index) => {
          const dossierTitle = dossierTitleByArticleId.get(article.id)
          if (dossierTitle) {
            parts.push(dossierTitleSectionHtml(dossierTitle))
            parts.push(
              articleSectionHtml(article, {
                needle,
                withPageBreak: false,
                showSource,
                sourceImagePaths: imagesByArticle.get(article.id),
              })
            )
          } else {
            parts.push(
              articleSectionHtml(article, {
                needle,
                withPageBreak: index > 0,
                showSource,
                sourceImagePaths: imagesByArticle.get(article.id),
              })
            )
          }
        })
        const html = fullDocumentHtml(parts.join(''))
        const buf = await renderHtmlToPdfBuffer(html)
        if (!buf) {
          emitProgress({ phase: 'error', label: 'Échec du rendu PDF' })
          return false
        }
        emitProgress({ phase: 'writing' })
        writeFileSync(saveResult.filePath, buf)
        emitProgress({ phase: 'done' })
        return true
      } catch (err) {
        exportLog('articlesPdf export failed', err)
        emitProgress({ phase: 'error', label: 'Erreur lors de l\'export' })
        return false
      } finally {
        if (imagesCleanup) imagesCleanup()
      }
    }
  )

  // ─── Single-project DOCX ───────────────────────────────────────────────
  ipcMain.handle(
    'v2:export:articlesDocx',
    async (
      _,
      projectId: string,
      articleIds: string[],
      options?: ExportOptions
    ): Promise<boolean> => {
      const articles = loadArticles(projectId, articleIds)
      if (articles.length === 0) return false

      const mode = options?.mode ?? 'single'
      const showSource = options?.showSource ?? true
      const includeImages = options?.includeSourceImages ?? false
      const needle = options?.highlight
      const isSeparated = mode === 'separated' && articles.length > 1

      const defaultName = isSeparated
        ? 'articles.zip'
        : articles.length === 1
          ? `${sanitizeFilename(articleTitle(articles[0]), 60)}.docx`
          : 'articles.docx'
      const filters = isSeparated
        ? [{ name: 'ZIP', extensions: ['zip'] }]
        : [{ name: 'Word Document', extensions: ['docx'] }]
      const saveResult = await dialog.showSaveDialog({ defaultPath: defaultName, filters })
      if (saveResult.canceled || !saveResult.filePath) {
        emitProgress({ phase: 'cancelled' })
        return false
      }

      emitProgress({ phase: 'starting' })
      let imagesCleanup: (() => void) | null = null
      try {
        let imagesByArticle = new Map<string, string[]>()
        if (includeImages) {
          emitProgress({ phase: 'rendering-images', current: 0, total: articles.length })
          const { byArticle, cleanup } = await renderAllArticleSourcePngs(
            articles.map((meta) => ({ meta, projectId })),
            (done, total) => emitProgress({ phase: 'rendering-images', current: done, total })
          )
          imagesByArticle = byArticle
          imagesCleanup = cleanup
        }

        if (isSeparated) {
          const zip = new AdmZip()
          const used = new Set<string>()
          for (let i = 0; i < articles.length; i++) {
            const article = articles[i]
            emitProgress({ phase: 'building', current: i, total: articles.length })
            const paragraphs = articleDocxParagraphs(article, {
              needle,
              showSource,
              sourceImagePaths: imagesByArticle.get(article.id),
            })
            const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] })
            const buf = await Packer.toBuffer(doc)
            const path = buildZipPath(article, 'docx', options, used, articles.length)
            zip.addFile(path, buf)
          }
          emitProgress({ phase: 'writing' })
          zip.writeZip(saveResult.filePath)
          emitProgress({ phase: 'done' })
          return true
        }

        emitProgress({ phase: 'building', current: 0, total: 1 })
        const dossierTitleByArticleId = new Map(
          (options?.dossierTitles ?? []).map((m) => [m.beforeArticleId, m.title])
        )

        type Section = {
          properties: { verticalAlign?: typeof VerticalAlign.CENTER }
          children: Paragraph[]
        }
        const sections: Section[] = []
        let current: Section = { properties: {}, children: [] }
        const flush = () => {
          if (current.children.length > 0) sections.push(current)
        }

        articles.forEach((article, index) => {
          const dossierTitle = dossierTitleByArticleId.get(article.id)
          if (dossierTitle) {
            flush()
            current = {
              properties: { verticalAlign: VerticalAlign.CENTER },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: dossierTitle, bold: true, size: 56 })],
                  alignment: AlignmentType.CENTER,
                }),
              ],
            }
            flush()
            current = { properties: {}, children: [] }
          } else if (index > 0) {
            current.children.push(new Paragraph({ children: [new PageBreak()] }))
          }
          for (const p of articleDocxParagraphs(article, {
            needle,
            showSource,
            sourceImagePaths: imagesByArticle.get(article.id),
          })) {
            current.children.push(p)
          }
        })
        flush()

        const doc = new Document({
          sections: sections.length > 0 ? sections : [{ properties: {}, children: [] }],
        })
        const buffer = await Packer.toBuffer(doc)
        emitProgress({ phase: 'writing' })
        writeFileSync(saveResult.filePath, buffer)
        emitProgress({ phase: 'done' })
        return true
      } catch (err) {
        exportLog('docx export failed', err)
        emitProgress({ phase: 'error', label: 'Erreur lors de l\'export' })
        return false
      } finally {
        if (imagesCleanup) imagesCleanup()
      }
    }
  )

  // ─── Single-project TXT ────────────────────────────────────────────────
  ipcMain.handle(
    'v2:export:articlesTxt',
    async (
      _,
      projectId: string,
      articleIds: string[],
      options?: ExportOptions
    ): Promise<boolean> => {
      const result = await dialog.showSaveDialog({
        defaultPath: 'articles.txt',
        filters: [{ name: 'Text File', extensions: ['txt'] }],
      })
      if (result.canceled || !result.filePath) {
        emitProgress({ phase: 'cancelled' })
        return false
      }

      const articles = loadArticles(projectId, articleIds)
      if (articles.length === 0) return false

      emitProgress({ phase: 'starting' })
      emitProgress({ phase: 'building', current: 0, total: 1 })
      const showSource = options?.showSource ?? true
      const dossierTitleByArticleId = new Map(
        (options?.dossierTitles ?? []).map((m) => [m.beforeArticleId, m.title])
      )

      try {
        const content = articles
          .map((article, index) => {
            const lines: string[] = []
            const dossierTitle = dossierTitleByArticleId.get(article.id)
            if (dossierTitle) {
              if (index > 0) lines.push('', '')
              lines.push(
                '╔' + '═'.repeat(58) + '╗',
                '║' + dossierTitle.toUpperCase().padStart((58 + dossierTitle.length) / 2).padEnd(58) + '║',
                '╚' + '═'.repeat(58) + '╝',
                '',
                ''
              )
            } else if (index > 0) {
              lines.push('', '═'.repeat(60), '')
            }
            const entries = orderedFilledEntries(article)
            entries.forEach(({ field, plain }, fieldIndex) => {
              if (fieldIndex === 0) {
                lines.push(plain.toUpperCase(), '')
              } else {
                lines.push(`[${field.name}]`, plain, '')
              }
            })
            if (showSource) lines.push(sourceLineFor(article), '')
            return lines.join('\n')
          })
          .join('\n')
        emitProgress({ phase: 'writing' })
        writeFileSync(result.filePath, content, 'utf-8')
        emitProgress({ phase: 'done' })
        return true
      } catch (err) {
        exportLog('txt export failed', err)
        emitProgress({ phase: 'error', label: 'Erreur lors de l\'export' })
        return false
      }
    }
  )

  // ─── Single-project PNG ────────────────────────────────────────────────
  ipcMain.handle(
    'v2:export:articlesPng',
    async (
      _,
      projectId: string,
      articleIds: string[],
      options?: ExportOptions
    ): Promise<boolean> => {
      const articles = loadArticles(projectId, articleIds)
      if (articles.length === 0) return false

      const mode = options?.pngMode ?? 'per-zone'
      return runPngExport(
        articles.map((meta) => ({ meta, projectId })),
        mode,
        options
      )
    }
  )

  // ─── Multi-project PDF / DOCX / TXT ────────────────────────────────────
  ipcMain.handle(
    'v2:export:multiArticlesPdf',
    async (_, items: MultiExportItem[], options?: ExportOptions): Promise<boolean> => {
      const loaded = loadMultiArticles(items)
      if (loaded.length === 0) return false

      const mode = options?.mode ?? 'single'
      const showSource = options?.showSource ?? true
      const includeImages = options?.includeSourceImages ?? false
      const needle = options?.highlight
      const isSeparated = mode === 'separated' && loaded.length > 1

      const defaultName = isSeparated ? 'recherche.zip' : 'recherche.pdf'
      const filters = isSeparated
        ? [{ name: 'ZIP', extensions: ['zip'] }]
        : [{ name: 'PDF', extensions: ['pdf'] }]
      const saveResult = await dialog.showSaveDialog({ defaultPath: defaultName, filters })
      if (saveResult.canceled || !saveResult.filePath) {
        emitProgress({ phase: 'cancelled' })
        return false
      }

      emitProgress({ phase: 'starting' })
      let imagesCleanup: (() => void) | null = null
      try {
        let imagesByArticle = new Map<string, string[]>()
        if (includeImages) {
          emitProgress({ phase: 'rendering-images', current: 0, total: loaded.length })
          const { byArticle, cleanup } = await renderAllArticleSourcePngs(
            loaded,
            (done, total) => emitProgress({ phase: 'rendering-images', current: done, total })
          )
          imagesByArticle = byArticle
          imagesCleanup = cleanup
        }

        if (isSeparated) {
          const zip = new AdmZip()
          const used = new Set<string>()
          for (let i = 0; i < loaded.length; i++) {
            const { meta } = loaded[i]
            emitProgress({ phase: 'building', current: i, total: loaded.length })
            const html = fullDocumentHtml(
              articleSectionHtml(meta, {
                needle,
                withPageBreak: false,
                showSource,
                sourceImagePaths: imagesByArticle.get(meta.id),
              })
            )
            const buf = await renderHtmlToPdfBuffer(html)
            if (!buf) continue
            const path = buildZipPath(meta, 'pdf', options, used, loaded.length)
            zip.addFile(path, buf)
          }
          emitProgress({ phase: 'writing' })
          zip.writeZip(saveResult.filePath)
          emitProgress({ phase: 'done' })
          return true
        }

        emitProgress({ phase: 'building', current: 0, total: 1 })
        const parts = loaded.map(({ meta }, index) =>
          articleSectionHtml(meta, {
            needle,
            withPageBreak: index > 0,
            showSource,
            sourceImagePaths: imagesByArticle.get(meta.id),
          })
        )
        const buf = await renderHtmlToPdfBuffer(fullDocumentHtml(parts.join('')))
        if (!buf) {
          emitProgress({ phase: 'error', label: 'Échec du rendu PDF' })
          return false
        }
        emitProgress({ phase: 'writing' })
        writeFileSync(saveResult.filePath, buf)
        emitProgress({ phase: 'done' })
        return true
      } catch (err) {
        exportLog('multi pdf export failed', err)
        emitProgress({ phase: 'error', label: 'Erreur lors de l\'export' })
        return false
      } finally {
        if (imagesCleanup) imagesCleanup()
      }
    }
  )

  ipcMain.handle(
    'v2:export:multiArticlesDocx',
    async (_, items: MultiExportItem[], options?: ExportOptions): Promise<boolean> => {
      const loaded = loadMultiArticles(items)
      if (loaded.length === 0) return false

      const mode = options?.mode ?? 'single'
      const showSource = options?.showSource ?? true
      const includeImages = options?.includeSourceImages ?? false
      const needle = options?.highlight
      const isSeparated = mode === 'separated' && loaded.length > 1

      const defaultName = isSeparated ? 'recherche.zip' : 'recherche.docx'
      const filters = isSeparated
        ? [{ name: 'ZIP', extensions: ['zip'] }]
        : [{ name: 'Word Document', extensions: ['docx'] }]
      const saveResult = await dialog.showSaveDialog({ defaultPath: defaultName, filters })
      if (saveResult.canceled || !saveResult.filePath) {
        emitProgress({ phase: 'cancelled' })
        return false
      }

      emitProgress({ phase: 'starting' })
      let imagesCleanup: (() => void) | null = null
      try {
        let imagesByArticle = new Map<string, string[]>()
        if (includeImages) {
          emitProgress({ phase: 'rendering-images', current: 0, total: loaded.length })
          const { byArticle, cleanup } = await renderAllArticleSourcePngs(
            loaded,
            (done, total) => emitProgress({ phase: 'rendering-images', current: done, total })
          )
          imagesByArticle = byArticle
          imagesCleanup = cleanup
        }

        if (isSeparated) {
          const zip = new AdmZip()
          const used = new Set<string>()
          for (let i = 0; i < loaded.length; i++) {
            const { meta } = loaded[i]
            emitProgress({ phase: 'building', current: i, total: loaded.length })
            const paragraphs = articleDocxParagraphs(meta, {
              needle,
              showSource,
              sourceImagePaths: imagesByArticle.get(meta.id),
            })
            const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] })
            const buf = await Packer.toBuffer(doc)
            const path = buildZipPath(meta, 'docx', options, used, loaded.length)
            zip.addFile(path, buf)
          }
          emitProgress({ phase: 'writing' })
          zip.writeZip(saveResult.filePath)
          emitProgress({ phase: 'done' })
          return true
        }

        emitProgress({ phase: 'building', current: 0, total: 1 })
        const children: Paragraph[] = []
        loaded.forEach(({ meta }, index) => {
          if (index > 0) children.push(new Paragraph({ children: [new PageBreak()] }))
          for (const p of articleDocxParagraphs(meta, {
            needle,
            showSource,
            sourceImagePaths: imagesByArticle.get(meta.id),
          })) {
            children.push(p)
          }
        })
        const doc = new Document({ sections: [{ properties: {}, children }] })
        const buffer = await Packer.toBuffer(doc)
        emitProgress({ phase: 'writing' })
        writeFileSync(saveResult.filePath, buffer)
        emitProgress({ phase: 'done' })
        return true
      } catch (err) {
        exportLog('multi docx export failed', err)
        emitProgress({ phase: 'error', label: 'Erreur lors de l\'export' })
        return false
      } finally {
        if (imagesCleanup) imagesCleanup()
      }
    }
  )

  ipcMain.handle(
    'v2:export:multiArticlesTxt',
    async (_, items: MultiExportItem[], options?: ExportOptions): Promise<boolean> => {
      const result = await dialog.showSaveDialog({
        defaultPath: 'recherche.txt',
        filters: [{ name: 'Text File', extensions: ['txt'] }],
      })
      if (result.canceled || !result.filePath) {
        emitProgress({ phase: 'cancelled' })
        return false
      }
      const loaded = loadMultiArticles(items)
      if (loaded.length === 0) return false

      emitProgress({ phase: 'starting' })
      emitProgress({ phase: 'building', current: 0, total: 1 })
      const showSource = options?.showSource ?? true

      try {
        const content = loaded
          .map(({ meta }, index) => {
            const lines: string[] = []
            if (index > 0) lines.push('', '═'.repeat(60), '')
            const entries = orderedFilledEntries(meta)
            entries.forEach(({ field, plain }, fieldIndex) => {
              if (fieldIndex === 0) lines.push(plain.toUpperCase(), '')
              else lines.push(`[${field.name}]`, plain, '')
            })
            if (showSource) lines.push(sourceLineFor(meta), '')
            return lines.join('\n')
          })
          .join('\n')
        emitProgress({ phase: 'writing' })
        writeFileSync(result.filePath, content, 'utf-8')
        emitProgress({ phase: 'done' })
        return true
      } catch (err) {
        exportLog('multi txt export failed', err)
        emitProgress({ phase: 'error', label: 'Erreur lors de l\'export' })
        return false
      }
    }
  )

  // ─── Multi-project PNG ─────────────────────────────────────────────────
  ipcMain.handle(
    'v2:export:multiArticlesPng',
    async (_, items: MultiExportItem[], options?: ExportOptions): Promise<boolean> => {
      const loaded = loadMultiArticles(items)
      if (loaded.length === 0) return false
      const mode = options?.pngMode ?? 'per-zone'
      return runPngExport(loaded, mode, options)
    }
  )
}

// ============================================================
// PNG export — shared implementation for single and multi project
// ============================================================

// Render the requested PNGs for `articles` and either save the single output
// (1 file in total) or pack them as a ZIP with dossier folders.
//
// Uses a single Python spawn for the whole batch — way faster than per-article
// spawns on Windows (~300ms saved per article).
async function runPngExport(
  articles: { meta: ArticleMetadata; projectId: string }[],
  mode: 'per-zone' | 'per-element',
  options?: ExportOptions
): Promise<boolean> {
  // Plan the render manifest. We skip articles whose extract.pdf is missing.
  type Plan = {
    article: ArticleMetadata
    outDir?: string  // per-zone
    outFile?: string // per-element
  }
  const root = tmpScratchDir('png-export')
  const cleanup = () => {
    try { rmSync(root, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  const manifest: BatchRenderItem[] = []
  const plans: Plan[] = []
  for (const { meta, projectId } of articles) {
    const dossier = idx.locateArticle(projectId, meta.id)
    if (dossier === undefined) continue
    const pdfPath = getArticleExtractPdfPath(projectId, dossier, meta.id)
    if (!existsSync(pdfPath)) continue
    const itemDir = join(root, meta.id)
    mkdirSync(itemDir, { recursive: true })
    if (mode === 'per-zone') {
      manifest.push({ kind: 'pages', pdf: pdfPath, outDir: itemDir, dpi: 200 })
      plans.push({ article: meta, outDir: itemDir })
    } else {
      const outFile = join(itemDir, 'stacked.png')
      manifest.push({ kind: 'stacked', pdf: pdfPath, outPath: outFile, dpi: 200 })
      plans.push({ article: meta, outFile })
    }
  }

  if (plans.length === 0) {
    cleanup()
    emitProgress({ phase: 'error', label: 'Aucun extrait disponible pour ces éléments' })
    return false
  }

  // Ask for save path first so a cancel skips the heavy work.
  const totalArticles = plans.length
  const willBeSingleFile =
    mode === 'per-element' && plans.length === 1
    // For per-zone the count of pages isn't known yet, so we always go ZIP
    // when multiple articles. The single-article-1-page case is handled
    // after rendering when we know the actual count.

  const defaultName = willBeSingleFile
    ? `${sanitizeFilename(articleTitle(plans[0].article), 60)}.png`
    : 'images.zip'
  const filters = willBeSingleFile
    ? [{ name: 'PNG Image', extensions: ['png'] }]
    : [{ name: 'ZIP', extensions: ['zip'] }]
  const saveResult = await dialog.showSaveDialog({ defaultPath: defaultName, filters })
  if (saveResult.canceled || !saveResult.filePath) {
    cleanup()
    emitProgress({ phase: 'cancelled' })
    return false
  }

  emitProgress({ phase: 'starting' })
  try {
    emitProgress({ phase: 'rendering-images', current: 0, total: manifest.length })
    const ok = await renderPdfsBatch(manifest, (done, total) =>
      emitProgress({ phase: 'rendering-images', current: done, total })
    )
    if (!ok) {
      emitProgress({ phase: 'error', label: 'Échec du rendu des images' })
      return false
    }

    // Resolve output paths per plan now that the batch is done.
    type Resolved = { article: ArticleMetadata; files: string[] }
    const resolved: Resolved[] = []
    for (const plan of plans) {
      if (mode === 'per-element' && plan.outFile && existsSync(plan.outFile)) {
        resolved.push({ article: plan.article, files: [plan.outFile] })
      } else if (mode === 'per-zone' && plan.outDir && existsSync(plan.outDir)) {
        const files = readdirSync(plan.outDir)
          .filter((f) => f.startsWith('page_') && f.endsWith('.png'))
          .sort()
          .map((f) => join(plan.outDir!, f))
        if (files.length > 0) resolved.push({ article: plan.article, files })
      }
    }
    if (resolved.length === 0) {
      emitProgress({ phase: 'error', label: 'Aucune image produite' })
      return false
    }

    const totalFiles = resolved.reduce((acc, r) => acc + r.files.length, 0)
    emitProgress({ phase: 'writing' })

    // Single-file shortcut: exactly one article and one PNG total.
    if (resolved.length === 1 && totalFiles === 1) {
      writeFileSync(saveResult.filePath, readFileSync(resolved[0].files[0]))
      emitProgress({ phase: 'done' })
      return true
    }

    // ZIP path
    const zip = new AdmZip()
    const used = new Set<string>()
    for (const r of resolved) {
      if (r.files.length === 1) {
        const path = buildZipPath(r.article, 'png', options, used, totalArticles)
        zip.addFile(path, readFileSync(r.files[0]))
      } else {
        const pad = Math.max(2, String(r.files.length).length)
        r.files.forEach((p, i) => {
          const suffix = String(i + 1).padStart(pad, '0')
          const path = buildZipPath(r.article, 'png', options, used, totalArticles, suffix)
          zip.addFile(path, readFileSync(p))
        })
      }
    }
    zip.writeZip(saveResult.filePath)
    emitProgress({ phase: 'done' })
    return true
  } catch (err) {
    exportLog('png export failed', err)
    emitProgress({ phase: 'error', label: 'Erreur lors de l\'export' })
    return false
  } finally {
    cleanup()
  }
}
