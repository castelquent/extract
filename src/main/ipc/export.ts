import { ipcMain, dialog, app } from 'electron'
import { join } from 'path'
import { existsSync, createWriteStream, writeFileSync } from 'fs'
import PDFDocument from 'pdfkit'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak } from 'docx'
import AdmZip from 'adm-zip'
import { convert } from 'html-to-text'
import type { Article } from '@shared/types'

// Get path to bundled fonts or system fonts
const getFontPath = (fontName: string): string | null => {
  // Try Windows system fonts
  const systemFonts = process.env.WINDIR
    ? join(process.env.WINDIR, 'Fonts')
    : '/usr/share/fonts'

  const fontMap: Record<string, string[]> = {
    'regular': ['arial.ttf', 'Arial.ttf', 'DejaVuSans.ttf'],
    'bold': ['arialbd.ttf', 'Arial Bold.ttf', 'DejaVuSans-Bold.ttf']
  }

  const fonts = fontMap[fontName] || fontMap['regular']
  for (const font of fonts) {
    const fontPath = join(systemFonts, font)
    if (existsSync(fontPath)) {
      return fontPath
    }
  }
  return null
}

const getProjectPath = (projectId: string): string => {
  return join(app.getPath('userData'), 'projects', projectId)
}

export function setupExportHandlers(): void {
  // Export to PDF
  ipcMain.handle('export:pdf', async (_, _projectId: string, articles: Article[]): Promise<boolean> => {
    const result = await dialog.showSaveDialog({
      defaultPath: 'articles.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })

    if (result.canceled || !result.filePath) {
      return false
    }

    return new Promise((resolve) => {
      try {
        // Get system fonts BEFORE creating PDFDocument
        const regularFont = getFontPath('regular')
        const boldFont = getFontPath('bold')

        if (!regularFont || !boldFont) {
          console.error('[PDF Export] System fonts not found')
          resolve(false)
          return
        }

        // Pass font option in constructor to avoid loading Helvetica
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 72, bottom: 72, left: 72, right: 72 },
          autoFirstPage: false,
          bufferPages: true,
          font: regularFont
        })

        // Register fonts for easy switching
        doc.registerFont('Regular', regularFont)
        doc.registerFont('Bold', boldFont)

        // Now add first page
        doc.addPage()

        const stream = createWriteStream(result.filePath!)
        doc.pipe(stream)

        articles.forEach((article, index) => {
          if (index > 0) {
            doc.addPage()
          }

          const fields = article.fields || {}
          const fieldEntries = Object.entries(fields).filter(([_, v]) => v)

          fieldEntries.forEach(([fieldName, value], fieldIndex) => {
            const plainValue = convert(value, {
              wordwrap: false,
              preserveNewlines: true
            })

            if (fieldIndex === 0) {
              // Premier champ = Titre (en gros, centré)
              doc.fontSize(18).font('Bold')
              doc.text(plainValue, { align: 'center' })
              doc.moveDown(0.5)
              doc.moveTo(72, doc.y).lineTo(doc.page.width - 72, doc.y).stroke()
              doc.moveDown(1)
            } else {
              // Autres champs
              doc.fontSize(10).font('Bold').text(`${fieldName}`, { continued: false })
              doc.fontSize(11).font('Regular')
              doc.text(plainValue, {
                align: 'justify',
                lineGap: 2
              })
              doc.moveDown(0.5)
            }
          })
        })

        doc.end()

        stream.on('finish', () => resolve(true))
        stream.on('error', () => resolve(false))
      } catch (error) {
        console.error('[PDF Export] Error:', error)
        resolve(false)
      }
    })
  })

  // Export to DOCX
  ipcMain.handle('export:docx', async (_, _projectId: string, articles: Article[]): Promise<boolean> => {
    const result = await dialog.showSaveDialog({
      defaultPath: 'articles.docx',
      filters: [{ name: 'Word Document', extensions: ['docx'] }]
    })

    if (result.canceled || !result.filePath) {
      return false
    }

    try {
      const children: Paragraph[] = []

      articles.forEach((article, index) => {
        if (index > 0) {
          // Saut de page entre les articles
          children.push(new Paragraph({
            children: [new PageBreak()]
          }))
        }

        const fields = article.fields || {}
        const fieldEntries = Object.entries(fields).filter(([_, v]) => v)

        fieldEntries.forEach(([fieldName, value], fieldIndex) => {
          const plainValue = convert(value, {
            wordwrap: false,
            preserveNewlines: true
          })

          if (fieldIndex === 0) {
            // Premier champ = Titre
            children.push(new Paragraph({
              text: plainValue,
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 }
            }))
          } else {
            // Autres champs avec leur nom
            children.push(new Paragraph({
              children: [
                new TextRun({ text: fieldName, bold: true })
              ],
              spacing: { before: 200 }
            }))

            const paragraphs = plainValue.split('\n\n')
            paragraphs.forEach(para => {
              if (para.trim()) {
                children.push(new Paragraph({
                  text: para.trim(),
                  alignment: AlignmentType.JUSTIFIED,
                  spacing: { after: 100 }
                }))
              }
            })
          }
        })
      })

      const doc = new Document({
        sections: [{
          properties: {},
          children
        }]
      })

      const buffer = await Packer.toBuffer(doc)
      writeFileSync(result.filePath, buffer)

      return true
    } catch (error) {
      console.error('DOCX export error:', error)
      return false
    }
  })

  // Export to TXT
  ipcMain.handle('export:txt', async (_, _projectId: string, articles: Article[]): Promise<boolean> => {
    const result = await dialog.showSaveDialog({
      defaultPath: 'articles.txt',
      filters: [{ name: 'Text File', extensions: ['txt'] }]
    })

    if (result.canceled || !result.filePath) {
      return false
    }

    try {
      const content = articles.map((article, index) => {
        const lines: string[] = []

        if (index > 0) {
          lines.push('')
          lines.push('═'.repeat(60))
          lines.push('')
        }

        const fields = article.fields || {}
        const fieldEntries = Object.entries(fields).filter(([_, v]) => v)

        fieldEntries.forEach(([fieldName, value], fieldIndex) => {
          const plainValue = convert(value, {
            wordwrap: false,
            preserveNewlines: true
          })

          if (fieldIndex === 0) {
            // Premier champ = Titre (en majuscules)
            lines.push(plainValue.toUpperCase())
            lines.push('')
          } else {
            // Autres champs avec leur nom
            lines.push(`[${fieldName}]`)
            lines.push(plainValue)
            lines.push('')
          }
        })

        return lines.join('\n')
      }).join('\n')

      writeFileSync(result.filePath, content, 'utf-8')
      return true
    } catch (error) {
      console.error('TXT export error:', error)
      return false
    }
  })

  // Export to ZIP (backup)
  ipcMain.handle('export:zip', async (_, projectId: string): Promise<boolean> => {
    const projectPath = getProjectPath(projectId)

    if (!existsSync(projectPath)) {
      return false
    }

    const result = await dialog.showSaveDialog({
      defaultPath: `project_${projectId}.zip`,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
    })

    if (result.canceled || !result.filePath) {
      return false
    }

    try {
      const zip = new AdmZip()
      zip.addLocalFolder(projectPath)
      zip.writeZip(result.filePath)
      return true
    } catch (error) {
      console.error('ZIP export error:', error)
      return false
    }
  })

  // Import from ZIP
  ipcMain.handle('export:importZip', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
    })

    if (result.canceled || !result.filePaths[0]) {
      return null
    }

    try {
      const zip = new AdmZip(result.filePaths[0])
      const projectsPath = join(app.getPath('userData'), 'projects')

      // Read metadata to get project ID
      const metadataEntry = zip.getEntry('metadata.json')
      if (!metadataEntry) {
        throw new Error('Invalid project archive: missing metadata.json')
      }

      const metadata = JSON.parse(metadataEntry.getData().toString('utf-8'))
      const projectId = metadata.id || Date.now().toString()
      const projectPath = join(projectsPath, projectId)

      zip.extractAllTo(projectPath, true)

      return projectId
    } catch (error) {
      console.error('ZIP import error:', error)
      return null
    }
  })
}
