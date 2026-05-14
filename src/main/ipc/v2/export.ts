// v2 export handlers. Take an array of articleIds, load each article's
// metadata, and produce a single output file (PDF / DOCX / TXT).
//
// PDF generation runs through Electron's headless BrowserWindow +
// webContents.printToPDF rather than PDFKit. That gives us native
// support for everything HTML/CSS does (highlight via <mark>, page
// breaks via CSS, accented text, real typography) at the cost of
// spinning up a Chromium renderer per export — still seconds for a
// few hundred articles.
import { ipcMain, dialog, BrowserWindow } from 'electron'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'

// Forward export diagnostics to every renderer's DevTools console.
// (main process stdout isn't visible in a packaged Electron app, so the
// renderer is the only place a user can watch the trace.)
const exportLog = (msg: string, err?: unknown): void => {
  const line = `[pdf-export ${new Date().toISOString()}] ${msg}${err ? ` :: ${err instanceof Error ? err.stack || err.message : String(err)}` : ''}`
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('v2:export:log', line)
  }
}
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak, VerticalAlign } from 'docx'
import { convert } from 'html-to-text'
import type {
  ArticleMetadata,
  ExportOptions,
  MultiExportItem,
  TemplateField,
} from '@shared/types'
import { isFieldFilled } from '@shared/fieldValue'
import { idx } from './_index'

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

const loadMultiArticles = (items: MultiExportItem[]): ArticleMetadata[] => {
  const result: ArticleMetadata[] = []
  for (const { projectId, articleId } of items) {
    const e = idx.getArticle(articleId)
    if (e && e.projectId === projectId) result.push(e.meta)
  }
  return result
}

// Split a piece of text into runs around occurrences of `needle` (case-
// insensitive). Used by the DOCX export to emit yellow-highlight runs.
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
    const idx = lowerText.indexOf(lowerNeedle, i)
    if (idx === -1) {
      if (i < text.length) out.push({ text: text.slice(i), match: false })
      break
    }
    if (idx > i) out.push({ text: text.slice(i, idx), match: false })
    out.push({ text: text.slice(idx, idx + needle.length), match: true })
    i = idx + needle.length
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

// Plain-text per-field (used by DOCX/TXT). Richtext fields go through
// html-to-text; everything else stays as the raw string.
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

// ============================================================
// HTML helpers (used by the printToPDF path)
// ============================================================

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Wrap each occurrence of `needle` in <mark>, but only inside text content
// (not inside tag names or attributes). The regex splits the HTML into
// `(<tag>) | (text)` alternations and only rewrites the text branches.
const highlightInHtml = (html: string, needle: string | undefined): string => {
  if (!needle) return html
  const re = new RegExp(escapeRegex(needle), 'gi')
  return html.replace(/(<[^>]+>)|([^<]+)/g, (_, tag: string | undefined, text: string | undefined) => {
    if (tag !== undefined) return tag
    return (text ?? '').replace(re, (m) => `<mark>${m}</mark>`)
  })
}

// HTML-ready per-field entries. Richtext fields keep their Quill HTML
// (we trust it — same renderer that produced it owns the input). Plain
// values are escaped. Optional needle inserts <mark> wraps around hits.
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

// One article's HTML section. The first field is rendered as the H1
// title; subsequent fields as labelled blocks. The article-level
// `break-before` is controlled by the caller (first article has no
// break; subsequent ones get a forced page break).
const articleSectionHtml = (
  article: ArticleMetadata,
  needle: string | undefined,
  withPageBreak: boolean
): string => {
  const entries = orderedFilledEntriesHtml(article, needle)
  let titleHtml = ''
  const fieldBlocks: string[] = []
  entries.forEach(({ field, html }, i) => {
    if (i === 0) {
      // First field = title. If it's richtext (unusual), strip tags so
      // it reads as a clean heading.
      const headerInner = field.type === 'richtext' ? html.replace(/<[^>]+>/g, ' ').trim() : html
      titleHtml = `<h1 class="article-title">${headerInner}</h1><hr class="title-rule"/>`
    } else {
      fieldBlocks.push(
        `<section class="field"><div class="field-label">${escapeHtml(field.name)}</div><div class="field-value">${html}</div></section>`
      )
    }
  })
  const sourceLine = `<div class="source">${highlightInHtml(escapeHtml(sourceLineFor(article)), needle)}</div>`
  const style = withPageBreak ? ' style="break-before: page;"' : ''
  return `<article class="article"${style}>${titleHtml}${fieldBlocks.join('')}${sourceLine}</article>`
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
.field {
  margin-top: 0.8em;
}
.field-label {
  font-weight: bold;
  font-size: 10pt;
  margin-bottom: 0.2em;
  /* Keep the label glued to at least the start of its value (avoid a label
     stranded at the bottom of a page with its content starting on the next). */
  break-after: avoid;
}
.field-value {
  text-align: justify;
  /* Prevent single-line orphans/widows at page boundaries. */
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

// Render an HTML document to a PDF file by loading it in a hidden
// BrowserWindow and calling webContents.printToPDF. The window is
// destroyed when done, the temp HTML file is removed on a best-effort
// basis. We use a temp file rather than a `data:` URL so we don't hit
// Chromium's data-URL size limits on large exports.
const renderHtmlToPdf = async (html: string, savePath: string): Promise<boolean> => {
  let win: BrowserWindow | null = null
  const tmpHtml = join(tmpdir(), `extract-export-${Date.now()}-${process.pid}.html`)
  exportLog(`start: htmlLen=${html.length} tmp=${tmpHtml} save=${savePath}`)
  try {
    writeFileSync(tmpHtml, html, 'utf-8')
    exportLog('wrote tmp html')

    win = new BrowserWindow({
      show: false,
      // CRITICAL on macOS: a `show: false` BrowserWindow doesn't render
      // its DOM by default — printToPDF would then produce a blank file
      // or fail silently. paintWhenInitiallyHidden forces the renderer to
      // paint anyway. Default has been `true` since Electron 14 but we
      // set it explicitly to be safe across versions.
      paintWhenInitiallyHidden: true,
      webPreferences: {
        sandbox: false,
        nodeIntegration: false,
        contextIsolation: true,
        offscreen: false,
      },
    })
    exportLog('created BrowserWindow')

    win.webContents.on('did-fail-load', (_e, code, desc, url) => {
      exportLog(`did-fail-load code=${code} desc=${desc} url=${url}`)
    })
    win.webContents.on('render-process-gone', (_e, details) => {
      exportLog(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`)
    })

    const fileUrl = pathToFileURL(tmpHtml).href
    exportLog(`loading url: ${fileUrl}`)
    await win.loadURL(fileUrl)
    exportLog('loadURL resolved')

    // One animation frame's worth of grace so the renderer commits its
    // layout before we ask for a print. Cheap insurance against races on
    // slower Macs where loadURL resolves before paint.
    await new Promise((r) => setTimeout(r, 50))

    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    })
    exportLog(`printToPDF returned ${pdf.byteLength} bytes`)

    writeFileSync(savePath, pdf)
    exportLog(`wrote save file (${pdf.byteLength} bytes)`)
    return true
  } catch (err) {
    exportLog('failed in renderHtmlToPdf', err)
    return false
  } finally {
    if (win) {
      try { win.destroy() } catch { /* ignore */ }
    }
    try { unlinkSync(tmpHtml) } catch { /* best-effort cleanup */ }
  }
}

// ============================================================
// IPC handlers
// ============================================================

export function setupV2ExportHandlers(): void {
  ipcMain.handle(
    'v2:export:articlesPdf',
    async (
      _,
      projectId: string,
      articleIds: string[],
      options?: ExportOptions
    ): Promise<boolean> => {
      const result = await dialog.showSaveDialog({
        defaultPath: 'articles.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (result.canceled || !result.filePath) return false

      const articles = loadArticles(projectId, articleIds)
      if (articles.length === 0) return false

      const dossierTitleByArticleId = new Map(
        (options?.dossierTitles ?? []).map((m) => [m.beforeArticleId, m.title])
      )

      const parts: string[] = []
      articles.forEach((article, index) => {
        const dossierTitle = dossierTitleByArticleId.get(article.id)
        if (dossierTitle) {
          parts.push(dossierTitleSectionHtml(dossierTitle))
          // The article that follows a dossier title already starts on
          // a fresh page (dossier-title-page has break-after: page).
          parts.push(articleSectionHtml(article, undefined, false))
        } else {
          parts.push(articleSectionHtml(article, undefined, index > 0))
        }
      })

      return renderHtmlToPdf(fullDocumentHtml(parts.join('')), result.filePath)
    }
  )

  ipcMain.handle(
    'v2:export:articlesDocx',
    async (
      _,
      projectId: string,
      articleIds: string[],
      options?: ExportOptions
    ): Promise<boolean> => {
      const result = await dialog.showSaveDialog({
        defaultPath: 'articles.docx',
        filters: [{ name: 'Word Document', extensions: ['docx'] }],
      })
      if (result.canceled || !result.filePath) return false

      const articles = loadArticles(projectId, articleIds)
      if (articles.length === 0) return false

      const dossierTitleByArticleId = new Map(
        (options?.dossierTitles ?? []).map((m) => [m.beforeArticleId, m.title])
      )

      try {
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
          const entries = orderedFilledEntries(article)
          entries.forEach(({ field, plain }, fieldIndex) => {
            if (fieldIndex === 0) {
              current.children.push(
                new Paragraph({
                  text: plain,
                  heading: HeadingLevel.HEADING_1,
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 200 },
                })
              )
            } else {
              current.children.push(
                new Paragraph({
                  children: [new TextRun({ text: field.name, bold: true })],
                  spacing: { before: 200 },
                })
              )
              for (const para of plain.split('\n\n')) {
                if (para.trim()) {
                  current.children.push(
                    new Paragraph({
                      text: para.trim(),
                      alignment: AlignmentType.JUSTIFIED,
                      spacing: { after: 100 },
                    })
                  )
                }
              }
            }
          })
          current.children.push(
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
        })
        flush()

        const doc = new Document({
          sections: sections.length > 0 ? sections : [{ properties: {}, children: [] }],
        })
        const buffer = await Packer.toBuffer(doc)
        writeFileSync(result.filePath, buffer)
        return true
      } catch (err) {
        console.error('[v2 DOCX Export] Error:', err)
        return false
      }
    }
  )

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
      if (result.canceled || !result.filePath) return false

      const articles = loadArticles(projectId, articleIds)
      if (articles.length === 0) return false

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
            lines.push(sourceLineFor(article), '')
            return lines.join('\n')
          })
          .join('\n')
        writeFileSync(result.filePath, content, 'utf-8')
        return true
      } catch (err) {
        console.error('[v2 TXT Export] Error:', err)
        return false
      }
    }
  )

  // ============================================================
  // Multi-project exports (search results)
  // ============================================================
  //
  // Article order matches the input items list — caller decides grouping.
  // `options.highlight` wraps occurrences of the term in <mark> (PDF) or
  // yellow highlight runs (DOCX). TXT has no markup convention so the
  // term is left alone.

  ipcMain.handle(
    'v2:export:multiArticlesPdf',
    async (_, items: MultiExportItem[], options?: ExportOptions): Promise<boolean> => {
      const result = await dialog.showSaveDialog({
        defaultPath: 'recherche.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (result.canceled || !result.filePath) return false
      const articles = loadMultiArticles(items)
      if (articles.length === 0) return false

      const needle = options?.highlight
      const parts = articles.map((article, index) =>
        articleSectionHtml(article, needle, index > 0)
      )
      return renderHtmlToPdf(fullDocumentHtml(parts.join('')), result.filePath)
    }
  )

  ipcMain.handle(
    'v2:export:multiArticlesDocx',
    async (_, items: MultiExportItem[], options?: ExportOptions): Promise<boolean> => {
      const result = await dialog.showSaveDialog({
        defaultPath: 'recherche.docx',
        filters: [{ name: 'Word Document', extensions: ['docx'] }],
      })
      if (result.canceled || !result.filePath) return false
      const articles = loadMultiArticles(items)
      if (articles.length === 0) return false

      const needle = options?.highlight

      try {
        const children: Paragraph[] = []
        articles.forEach((article, index) => {
          if (index > 0) {
            children.push(new Paragraph({ children: [new PageBreak()] }))
          }
          const entries = orderedFilledEntries(article)
          entries.forEach(({ field, plain }, fieldIndex) => {
            if (fieldIndex === 0) {
              children.push(
                new Paragraph({
                  children: runsFromText(plain, needle),
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
                      children: runsFromText(para.trim(), needle),
                      alignment: AlignmentType.JUSTIFIED,
                      spacing: { after: 100 },
                    })
                  )
                }
              }
            }
          })
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
        })

        const doc = new Document({
          sections: [{ properties: {}, children }],
        })
        const buffer = await Packer.toBuffer(doc)
        writeFileSync(result.filePath, buffer)
        return true
      } catch (err) {
        console.error('[v2 Multi DOCX Export] Error:', err)
        return false
      }
    }
  )

  ipcMain.handle(
    'v2:export:multiArticlesTxt',
    async (_, items: MultiExportItem[], _options?: ExportOptions): Promise<boolean> => {
      void _options
      const result = await dialog.showSaveDialog({
        defaultPath: 'recherche.txt',
        filters: [{ name: 'Text File', extensions: ['txt'] }],
      })
      if (result.canceled || !result.filePath) return false
      const articles = loadMultiArticles(items)
      if (articles.length === 0) return false

      try {
        const content = articles
          .map((article, index) => {
            const lines: string[] = []
            if (index > 0) lines.push('', '═'.repeat(60), '')
            const entries = orderedFilledEntries(article)
            entries.forEach(({ field, plain }, fieldIndex) => {
              if (fieldIndex === 0) lines.push(plain.toUpperCase(), '')
              else lines.push(`[${field.name}]`, plain, '')
            })
            lines.push(sourceLineFor(article), '')
            return lines.join('\n')
          })
          .join('\n')
        writeFileSync(result.filePath, content, 'utf-8')
        return true
      } catch (err) {
        console.error('[v2 Multi TXT Export] Error:', err)
        return false
      }
    }
  )
}
