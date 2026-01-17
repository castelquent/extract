import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
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

  // Export articles to images
  ipcMain.handle('extraction:exportImages', async (_, projectId: string, articles: Article[]): Promise<boolean> => {
    const projectPath = getProjectPath(projectId)
    const pdfPath = join(projectPath, 'source.pdf')
    const imagesPath = join(projectPath, 'images')
    const pythonPath = getPythonPath()
    const scriptPath = join(getScriptsPath(), 'pdf_to_image.py')

    return new Promise((resolve) => {
      const articlesJson = JSON.stringify(articles)

      const process = spawn(pythonPath, [
        scriptPath,
        pdfPath,
        imagesPath,
        articlesJson
      ])

      process.on('close', (code) => {
        if (code === 0) {
          // Save export data with relative paths (like V1)
          const exportData: ExtractionData = {
            articles: articles.map((article, index) => ({
              ...article,
              imagePath: `images/article_${index + 1}.pdf`
            }))
          }

          writeFileSync(
            join(projectPath, 'data.json'),
            JSON.stringify(exportData, null, 2)
          )

          resolve(true)
        } else {
          console.error('Python script failed with code:', code)
          resolve(false)
        }
      })

      process.on('error', (error) => {
        console.error('Failed to start Python process:', error)
        resolve(false)
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
