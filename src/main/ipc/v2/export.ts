// v2 export handlers. Take an array of articleIds, load each article's
// metadata, and produce a single output file (PDF / DOCX / TXT).
import { ipcMain, dialog } from 'electron'
import { join } from 'path'
import { createWriteStream, existsSync, writeFileSync } from 'fs'
import PDFDocument from 'pdfkit'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak, VerticalAlign } from 'docx'
import { convert } from 'html-to-text'
import type { ArticleMetadata, ExportOptions, TemplateField } from '@shared/types'
import { isFieldFilled } from '@shared/fieldValue'
import { locateArticle, readArticleMetadata } from '../_fs'

// Locate + load metadata for a list of article IDs in a project.
const loadArticles = (projectId: string, articleIds: string[]): ArticleMetadata[] => {
  const result: ArticleMetadata[] = []
  for (const id of articleIds) {
    const dossierId = locateArticle(projectId, id)
    if (dossierId === undefined) continue
    const am = readArticleMetadata(projectId, dossierId, id)
    if (am) result.push(am)
  }
  return result
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
}
