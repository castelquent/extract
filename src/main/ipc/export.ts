import { ipcMain, dialog, app } from 'electron'
import { join } from 'path'
import { existsSync, createWriteStream, writeFileSync } from 'fs'
import PDFDocument from 'pdfkit'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import AdmZip from 'adm-zip'
import { convert } from 'html-to-text'
import type { Article } from '@shared/types'

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
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 72, bottom: 72, left: 72, right: 72 }
        })

        const stream = createWriteStream(result.filePath!)
        doc.pipe(stream)

        articles.forEach((article, index) => {
          if (index > 0) {
            doc.addPage()
          }

          // Title
          doc.fontSize(18).font('Helvetica-Bold')
          doc.text(article.title || 'Sans titre', { align: 'center' })
          doc.moveDown(0.5)

          // Author
          if (article.author) {
            doc.fontSize(12).font('Helvetica-Oblique')
            doc.text(`Par ${article.author}`, { align: 'center' })
            doc.moveDown(1)
          }

          // Separator
          doc.moveTo(72, doc.y).lineTo(doc.page.width - 72, doc.y).stroke()
          doc.moveDown(1)

          // Content
          const plainContent = convert(article.content || '', {
            wordwrap: false,
            preserveNewlines: true
          })

          doc.fontSize(11).font('Helvetica')
          doc.text(plainContent, {
            align: 'justify',
            lineGap: 2
          })
        })

        doc.end()

        stream.on('finish', () => resolve(true))
        stream.on('error', () => resolve(false))
      } catch (error) {
        console.error('PDF export error:', error)
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
          children.push(new Paragraph({ text: '', spacing: { after: 400 } }))
          children.push(new Paragraph({
            text: '─'.repeat(50),
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
          }))
        }

        // Title
        children.push(new Paragraph({
          text: article.title || 'Sans titre',
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER
        }))

        // Author
        if (article.author) {
          children.push(new Paragraph({
            children: [
              new TextRun({
                text: `Par ${article.author}`,
                italics: true
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
          }))
        }

        // Content
        const plainContent = convert(article.content || '', {
          wordwrap: false,
          preserveNewlines: true
        })

        const paragraphs = plainContent.split('\n\n')
        paragraphs.forEach(para => {
          if (para.trim()) {
            children.push(new Paragraph({
              text: para.trim(),
              alignment: AlignmentType.JUSTIFIED,
              spacing: { after: 200 }
            }))
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
