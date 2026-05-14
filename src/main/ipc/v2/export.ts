// v2 export handlers. Take an array of articleIds, load each article's
// metadata, and produce a single output file (PDF / DOCX / TXT).
import { ipcMain, dialog } from 'electron'
import { join } from 'path'
import { createWriteStream, existsSync, writeFileSync } from 'fs'
import PDFDocument from 'pdfkit'
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

// Load metadata for a list of article IDs in a project. Reads from the
// in-memory index (no file walk).
const loadArticles = (projectId: string, articleIds: string[]): ArticleMetadata[] => {
  const result: ArticleMetadata[] = []
  for (const id of articleIds) {
    const e = idx.getArticle(id)
    if (e && e.projectId === projectId) result.push(e.meta)
  }
  return result
}

// Multi-project variant: each item already names its own project. Used by
// the search-results export. Article order in the output matches the input
// item order — the caller (SearchPage) decides grouping.
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

// Build TextRuns from a plain string, splitting around highlight matches.
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

// Build the ordered list of `(field, plainText)` entries we want to export
// for one article. Driven by `article.schema` (not by `Object.entries(fields)`,
// which would yield JSON-insertion order). Empty values are dropped via
// `isFieldFilled` so a Quill `<p><br></p>` placeholder doesn't render as
// a blank section. Richtext values go through html-to-text; plain text /
// textarea / numeric values are used as-is (string-coerced) — running them
// through html-to-text silently swallows non-HTML scalars like the number
// `3` stored in a "Nombre de paragraphes" field.
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

// Compact page range formatting: [1,2,3,5,7,8] → "1-3, 5, 7-8".
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

// "Source : <name>, page(s) <N>". Falls back to "Source inconnue" if the
// referenced source is missing (article still on disk, source deleted).
const sourceLineFor = (article: ArticleMetadata): string => {
  const entry = idx.getSource(article.sourceId)
  const sourceName =
    entry?.meta.name?.trim() ||
    entry?.meta.originalFilename ||
    'Source inconnue'
  const pages = article.pages ?? []
  if (pages.length === 0) return `Source : ${sourceName}`
  const pageStr = formatPages(pages)
  // Plural if multiple pages OR a range (e.g. "3-5" reads as plural too).
  const isPlural = pages.length > 1 || pageStr.includes('-')
  return `Source : ${sourceName}, ${isPlural ? 'pages' : 'page'} ${pageStr}`
}

const getFontPath = (fontName: string): string | null => {
  const systemFonts = process.env.WINDIR ? join(process.env.WINDIR, 'Fonts') : '/usr/share/fonts'
  const fontMap: Record<string, string[]> = {
    regular: ['arial.ttf', 'Arial.ttf', 'DejaVuSans.ttf'],
    bold: ['arialbd.ttf', 'Arial Bold.ttf', 'DejaVuSans-Bold.ttf'],
  }
  const fonts = fontMap[fontName] || fontMap['regular']
  for (const f of fonts) {
    const p = join(systemFonts, f)
    if (existsSync(p)) return p
  }
  return null
}

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

      return new Promise((resolve) => {
        try {
          const regularFont = getFontPath('regular')
          const boldFont = getFontPath('bold')
          if (!regularFont || !boldFont) {
            console.error('[PDF Export] System fonts not found')
            resolve(false)
            return
          }
          const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 72, bottom: 72, left: 72, right: 72 },
            autoFirstPage: false,
            bufferPages: true,
            font: regularFont,
          })
          doc.registerFont('Regular', regularFont)
          doc.registerFont('Bold', boldFont)
          const stream = createWriteStream(result.filePath!)
          doc.pipe(stream)

          // No eager first page — each iteration adds the page(s) it needs.
          // This keeps the loop uniform whether the first item starts with
          // a dossier title or not.
          articles.forEach((article) => {
            const dossierTitle = dossierTitleByArticleId.get(article.id)
            if (dossierTitle) {
              doc.addPage()
              // Vertically-centred dossier title page.
              const innerH = doc.page.height - 144
              doc.fontSize(36).font('Bold')
              doc.text(dossierTitle, 72, 72 + innerH / 2 - 24, {
                align: 'center',
                width: doc.page.width - 144,
              })
            }
            doc.addPage()
            const entries = orderedFilledEntries(article)
            entries.forEach(({ field, plain }, fieldIndex) => {
              if (fieldIndex === 0) {
                doc.fontSize(18).font('Bold')
                doc.text(plain, { align: 'center' })
                doc.moveDown(0.5)
                doc.moveTo(72, doc.y).lineTo(doc.page.width - 72, doc.y).stroke()
                doc.moveDown(1)
              } else {
                doc.fontSize(10).font('Bold').text(field.name, { continued: false })
                doc.fontSize(11).font('Regular')
                doc.text(plain, { align: 'justify', lineGap: 2 })
                doc.moveDown(0.5)
              }
            })
            // Source line at the bottom of the article — smaller, muted.
            doc.moveDown(0.5)
            doc.fontSize(9).font('Regular').fillColor('#666666')
            doc.text(sourceLineFor(article), { align: 'left' })
            doc.fillColor('black')
          })
          doc.end()
          stream.on('finish', () => resolve(true))
          stream.on('error', () => resolve(false))
        } catch (err) {
          console.error('[v2 PDF Export] Error:', err)
          resolve(false)
        }
      })
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
        // Each dossier title gets its OWN section with `verticalAlign:
        // CENTER` so Word centres the title vertically on its page no
        // matter how many lines it wraps to. Article content lives in
        // separate default-aligned sections that follow.
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
          // Source line at the bottom of the article — italic, slightly muted.
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

        // docx requires at least one section even if export was empty.
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
  // The current callers (SearchPage) hand articles in the same order they
  // appear on screen. `options.highlight` is honoured in DOCX only; PDF
  // and TXT just render without emphasis (PDFKit can't style inline spans
  // cleanly; TXT has no markup convention here).

  ipcMain.handle(
    'v2:export:multiArticlesPdf',
    async (_, items: MultiExportItem[], _options?: ExportOptions): Promise<boolean> => {
      void _options
      const result = await dialog.showSaveDialog({
        defaultPath: 'recherche.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (result.canceled || !result.filePath) return false
      const articles = loadMultiArticles(items)
      if (articles.length === 0) return false

      return new Promise((resolve) => {
        try {
          const regularFont = getFontPath('regular')
          const boldFont = getFontPath('bold')
          if (!regularFont || !boldFont) {
            console.error('[PDF Export] System fonts not found')
            resolve(false)
            return
          }
          const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 72, bottom: 72, left: 72, right: 72 },
            autoFirstPage: false,
            font: regularFont,
          })
          doc.registerFont('Regular', regularFont)
          doc.registerFont('Bold', boldFont)
          const stream = createWriteStream(result.filePath!)
          doc.pipe(stream)
          articles.forEach((article) => {
            doc.addPage()
            const entries = orderedFilledEntries(article)
            entries.forEach(({ field, plain }, fieldIndex) => {
              if (fieldIndex === 0) {
                doc.fontSize(18).font('Bold')
                doc.text(plain, { align: 'center' })
                doc.moveDown(0.5)
                doc.moveTo(72, doc.y).lineTo(doc.page.width - 72, doc.y).stroke()
                doc.moveDown(1)
              } else {
                doc.fontSize(10).font('Bold').text(field.name, { continued: false })
                doc.fontSize(11).font('Regular')
                doc.text(plain, { align: 'justify', lineGap: 2 })
                doc.moveDown(0.5)
              }
            })
            doc.moveDown(0.5)
            doc.fontSize(9).font('Regular').fillColor('#666666')
            doc.text(sourceLineFor(article), { align: 'left' })
            doc.fillColor('black')
          })
          doc.end()
          stream.on('finish', () => resolve(true))
          stream.on('error', () => resolve(false))
        } catch (err) {
          console.error('[v2 Multi PDF Export] Error:', err)
          resolve(false)
        }
      })
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
                  // Heading title: keep H1 styling AND highlight matches.
                  // Using `children` (runs) is incompatible with the `text`
                  // shortcut, but `heading` works alongside `children`.
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
