import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { spawn } from 'child_process'
import type { Article, ExtractionData } from '@shared/types'

const getProjectPath = (projectId: string): string => {
  return join(app.getPath('userData'), 'projects', projectId)
}

// In dev, process.cwd() is src/, so we need to go up one level
const getProjectRoot = (): string => {
  const isDev = !app.isPackaged
  return isDev ? join(process.cwd(), '..') : process.resourcesPath
}

const getPythonPath = (): string => {
  return join(getProjectRoot(), 'python-portable', 'python.exe')
}

const getScriptsPath = (): string => {
  return join(getProjectRoot(), 'scripts')
}

export function setupExtractionHandlers(): void {
  // Save extraction progress to data.json
  ipcMain.handle('extraction:save', async (_, projectId: string, data: ExtractionData): Promise<boolean> => {
    const projectPath = getProjectPath(projectId)
    const dataPath = join(projectPath, 'data.json')

    try {
      writeFileSync(dataPath, JSON.stringify(data, null, 2))
      return true
    } catch (error) {
      console.error('Error saving extraction:', error)
      return false
    }
  })

  // Load extraction progress from data.json
  ipcMain.handle('extraction:load', async (_, projectId: string): Promise<ExtractionData | null> => {
    const projectPath = getProjectPath(projectId)
    const dataPath = join(projectPath, 'data.json')

    try {
      if (existsSync(dataPath)) {
        return JSON.parse(readFileSync(dataPath, 'utf-8'))
      }
      return null
    } catch (error) {
      console.error('Error loading extraction:', error)
      return null
    }
  })

  // Export articles to images - returns updated articles with imagePath
  ipcMain.handle('extraction:exportImages', async (_, projectId: string, articles: Article[]): Promise<Article[] | null> => {
    const projectPath = getProjectPath(projectId)
    const pdfPath = join(projectPath, 'source.pdf')
    const imagesPath = join(projectPath, 'images')
    const pythonPath = getPythonPath()
    const scriptPath = join(getScriptsPath(), 'pdf_to_image.py')

    // Écrire les articles dans un fichier temporaire pour éviter ENAMETOOLONG
    const articlesJsonPath = join(projectPath, 'articles_export.json')
    writeFileSync(articlesJsonPath, JSON.stringify(articles))

    return new Promise((resolve) => {
      const proc = spawn(pythonPath, [
        scriptPath,
        pdfPath,
        imagesPath,
        articlesJsonPath
      ])

      proc.on('close', (code) => {
        // Nettoyer le fichier temporaire
        try {
          if (existsSync(articlesJsonPath)) {
            require('fs').unlinkSync(articlesJsonPath)
          }
        } catch (e) {
          // Ignorer les erreurs de nettoyage
        }

        if (code === 0) {
          // Ajouter les imagePath aux articles
          const updatedArticles = articles.map((article, index) => ({
            ...article,
            imagePath: `images/article_${index + 1}.pdf`
          }))

          // Sauvegarder dans data.json
          const exportData: ExtractionData = { articles: updatedArticles }
          writeFileSync(
            join(projectPath, 'data.json'),
            JSON.stringify(exportData, null, 2)
          )

          resolve(updatedArticles)
        } else {
          console.error('Python script failed with code:', code)
          resolve(null)
        }
      })

      proc.on('error', (error) => {
        console.error('Failed to start Python process:', error)
        resolve(null)
      })
    })
  })

  // Extract text directly from the article PDF (works if PDF has a text layer:
  // soit natif, soit injecte par ocrArticle apres Tesseract)
  ipcMain.handle('extraction:extractText', async (_, projectId: string, imagePath: string): Promise<string | null> => {
    const projectPath = getProjectPath(projectId)
    const fullPdfPath = imagePath.includes(':') || imagePath.startsWith('/')
      ? imagePath
      : join(projectPath, imagePath)

    if (!existsSync(fullPdfPath)) return null

    const pythonPath = getPythonPath()
    const scriptPath = join(getScriptsPath(), 'extract_text.py')
    const outputPath = join(projectPath, 'extract_text_output.txt')

    return new Promise((resolve) => {
      const proc = spawn(pythonPath, [scriptPath, fullPdfPath, outputPath])

      proc.on('close', (code) => {
        if (code !== 0) {
          console.error('extract_text.py failed with code:', code)
          try { if (existsSync(outputPath)) unlinkSync(outputPath) } catch {}
          resolve(null)
          return
        }

        try {
          const text = existsSync(outputPath) ? readFileSync(outputPath, 'utf-8') : ''
          if (existsSync(outputPath)) unlinkSync(outputPath)
          resolve(text)
        } catch (error) {
          console.error('Error reading extracted text:', error)
          resolve(null)
        }
      })

      proc.on('error', (error) => {
        console.error('Failed to start Python process:', error)
        resolve(null)
      })
    })
  })

  // Get PDF path for a project
  ipcMain.handle('extraction:getPdfPath', async (_, projectId: string): Promise<string | null> => {
    const pdfPath = join(getProjectPath(projectId), 'source.pdf')
    return existsSync(pdfPath) ? pdfPath : null
  })

  // Get PDF data as ArrayBuffer (for renderer with contextIsolation)
  ipcMain.handle('extraction:getPdfData', async (_, projectId: string): Promise<ArrayBuffer | null> => {
    const pdfPath = join(getProjectPath(projectId), 'source.pdf')

    try {
      if (existsSync(pdfPath)) {
        const buffer = readFileSync(pdfPath)
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      }
      return null
    } catch (error) {
      console.error('Error reading PDF:', error)
      return null
    }
  })

  // Get image data as base64 (for renderer with contextIsolation)
  // imagePath can be relative (images/article_1.png) or absolute
  ipcMain.handle('extraction:getImageData', async (_, projectId: string, imagePath: string): Promise<string | null> => {
    try {
      // Resolve path: if relative, prepend project path
      const fullPath = imagePath.includes(':') || imagePath.startsWith('/')
        ? imagePath
        : join(getProjectPath(projectId), imagePath)

      if (existsSync(fullPath)) {
        const buffer = readFileSync(fullPath)
        const base64 = buffer.toString('base64')
        const ext = fullPath.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'
        return `data:image/${ext};base64,${base64}`
      }
      return null
    } catch (error) {
      console.error('Error reading image:', error)
      return null
    }
  })
  // Get PDF data as base64 (for renderer with contextIsolation)
  ipcMain.handle('extraction:getPdfFile', async (_, projectId: string, pdfPath: string): Promise<string | null> => {
    try {
      // Resolve path: if relative, prepend project path
      const fullPath = pdfPath.includes(':') || pdfPath.startsWith('/')
        ? pdfPath
        : join(getProjectPath(projectId), pdfPath)

      if (existsSync(fullPath)) {
        const buffer = readFileSync(fullPath)
        const base64 = buffer.toString('base64')
        return `data:application/pdf;base64,${base64}`
      }
      return null
    } catch (error) {
      console.error('Error reading PDF:', error)
      return null
    }
  })

}
