// v2 export handlers. Take an array of articleIds, load each article's
// metadata, and produce a single output file (PDF / DOCX / TXT).
import { ipcMain, dialog } from 'electron'
import { join } from 'path'
import { createWriteStream, existsSync, writeFileSync } from 'fs'
import PDFDocument from 'pdfkit'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak } from 'docx'
import { convert } from 'html-to-text'
import type { ArticleMetadata } from '@shared/types'
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
    async (_, projectId: string, articleIds: string[]): Promise<boolean> => {
      const result = await dialog.showSaveDialog({
        defaultPath: 'articles.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (result.canceled || !result.filePath) return false

      const articles = loadArticles(projectId, articleIds)
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
            bufferPages: true,
            font: regularFont,
          })
          doc.registerFont('Regular', regularFont)
          doc.registerFont('Bold', boldFont)
          doc.addPage()
          const stream = createWriteStream(result.filePath!)
          doc.pipe(stream)

          articles.forEach((article, index) => {
            if (index > 0) doc.addPage()
            const entries = Object.entries(article.fields || {}).filter(([, v]) => v)
            entries.forEach(([fieldName, value], fieldIndex) => {
              const plain = convert(value, { wordwrap: false, preserveNewlines: true })
              if (fieldIndex === 0) {
                doc.fontSize(18).font('Bold')
                doc.text(plain, { align: 'center' })
                doc.moveDown(0.5)
                doc.moveTo(72, doc.y).lineTo(doc.page.width - 72, doc.y).stroke()
                doc.moveDown(1)
              } else {
                doc.fontSize(10).font('Bold').text(`${fieldName}`, { continued: false })
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
    async (_, projectId: string, articleIds: string[]): Promise<boolean> => {
      const result = await dialog.showSaveDialog({
        defaultPath: 'articles.docx',
        filters: [{ name: 'Word Document', extensions: ['docx'] }],
      })
      if (result.canceled || !result.filePath) return false

      const articles = loadArticles(projectId, articleIds)
      if (articles.length === 0) return false

      try {
        const children: Paragraph[] = []
        articles.forEach((article, index) => {
          if (index > 0) {
            children.push(new Paragraph({ children: [new PageBreak()] }))
          }
          const entries = Object.entries(article.fields || {}).filter(([, v]) => v)
          entries.forEach(([fieldName, value], fieldIndex) => {
            const plain = convert(value, { wordwrap: false, preserveNewlines: true })
            if (fieldIndex === 0) {
              children.push(
                new Paragraph({
                  text: plain,
                  heading: HeadingLevel.HEADING_1,
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 200 },
                })
              )
            } else {
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: fieldName, bold: true })],
                  spacing: { before: 200 },
                })
              )
              for (const para of plain.split('\n\n')) {
                if (para.trim()) {
                  children.push(
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

        const doc = new Document({ sections: [{ properties: {}, children }] })
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
    async (_, projectId: string, articleIds: string[]): Promise<boolean> => {
      const result = await dialog.showSaveDialog({
        defaultPath: 'articles.txt',
        filters: [{ name: 'Text File', extensions: ['txt'] }],
      })
      if (result.canceled || !result.filePath) return false

      const articles = loadArticles(projectId, articleIds)
      if (articles.length === 0) return false

      try {
        const content = articles
          .map((article, index) => {
            const lines: string[] = []
            if (index > 0) {
              lines.push('', '═'.repeat(60), '')
            }
            const entries = Object.entries(article.fields || {}).filter(([, v]) => v)
            entries.forEach(([fieldName, value], fieldIndex) => {
              const plain = convert(value, { wordwrap: false, preserveNewlines: true })
              if (fieldIndex === 0) {
                lines.push(plain.toUpperCase(), '')
              } else {
                lines.push(`[${fieldName}]`, plain, '')
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
