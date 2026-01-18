import { ipcMain, dialog, app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync, rmSync, unlinkSync } from 'fs'
import { spawn } from 'child_process'
import type { Project, ProjectMetadata } from '@shared/types'

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

const generateThumbnail = (pdfPath: string, outputPath: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const pythonPath = getPythonPath()
    const scriptPath = join(getScriptsPath(), 'generate_thumbnail.py')

    // Create temp config file
    const configPath = join(app.getPath('temp'), `thumbnail-config-${Date.now()}.json`)
    const config = {
      pdfPath,
      outputPath,
      width: 300
    }

    try {
      writeFileSync(configPath, JSON.stringify(config))

      const process = spawn(pythonPath, [scriptPath, configPath])

      let output = ''
      process.stdout.on('data', (data) => {
        output += data.toString()
      })

      process.stderr.on('data', (data) => {
        console.error('Thumbnail stderr:', data.toString())
      })

      process.on('close', (code) => {
        // Clean up config file
        try {
          if (existsSync(configPath)) {
            unlinkSync(configPath)
          }
        } catch (e) {
          // Ignore cleanup errors
        }

        if (code === 0) {
          try {
            const result = JSON.parse(output)
            resolve(result.success === true)
          } catch {
            resolve(existsSync(outputPath))
          }
        } else {
          console.error('Thumbnail generation failed with code:', code)
          resolve(false)
        }
      })

      process.on('error', (err) => {
        console.error('Thumbnail process error:', err)
        resolve(false)
      })
    } catch (error) {
      console.error('Error setting up thumbnail generation:', error)
      resolve(false)
    }
  })
}

const getProjectsPath = (): string => {
  const userDataPath = app.getPath('userData')
  const projectsPath = join(userDataPath, 'projects')

  if (!existsSync(projectsPath)) {
    mkdirSync(projectsPath, { recursive: true })
  }

  return projectsPath
}

export function setupProjectHandlers(): void {
  // Get all projects
  ipcMain.handle('projects:getAll', async (): Promise<Project[]> => {
    const projectsPath = getProjectsPath()
    const projects: Project[] = []

    try {
      const dirs = readdirSync(projectsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())

      for (const dir of dirs) {
        const metadataPath = join(projectsPath, dir.name, 'metadata.json')

        if (existsSync(metadataPath)) {
          const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8')) as ProjectMetadata
          const thumbnailPath = join(projectsPath, dir.name, 'thumbnail.png')

          projects.push({
            ...metadata,
            thumbnailPath: existsSync(thumbnailPath) ? thumbnailPath : null
          })
        }
      }

      // Sort by modification date (most recent first)
      return projects.sort((a, b) =>
        new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
      )
    } catch (error) {
      console.error('Error loading projects:', error)
      return []
    }
  })

  // Create new project
  ipcMain.handle('projects:create', async (_, name: string, templateId: string): Promise<Project | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })

    if (result.canceled || !result.filePaths[0]) {
      return null
    }

    const pdfPath = result.filePaths[0]
    const projectId = Date.now().toString()
    const projectPath = join(getProjectsPath(), projectId)

    try {
      mkdirSync(projectPath, { recursive: true })
      mkdirSync(join(projectPath, 'images'), { recursive: true })

      // Copy PDF
      copyFileSync(pdfPath, join(projectPath, 'source.pdf'))

      // Create metadata
      const metadata: ProjectMetadata = {
        id: projectId,
        name: name || 'Nouveau projet',
        originalFilename: pdfPath.split(/[/\\]/).pop() || 'source.pdf',
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        status: 'new',
        articlesCount: 0,
        filledFields: 0,
        totalFields: 0,
        templateId: templateId || 'press-article'
      }

      writeFileSync(
        join(projectPath, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      )

      // Generate thumbnail
      const thumbnailPath = join(projectPath, 'thumbnail.png')
      const thumbnailSuccess = await generateThumbnail(
        join(projectPath, 'source.pdf'),
        thumbnailPath
      )

      return {
        ...metadata,
        thumbnailPath: thumbnailSuccess ? thumbnailPath : null
      }
    } catch (error) {
      console.error('Error creating project:', error)
      return null
    }
  })

  // Delete project
  ipcMain.handle('projects:delete', async (_, projectId: string): Promise<boolean> => {
    const projectPath = join(getProjectsPath(), projectId)

    try {
      if (existsSync(projectPath)) {
        rmSync(projectPath, { recursive: true, force: true })
        return true
      }
      return false
    } catch (error) {
      console.error('Error deleting project:', error)
      return false
    }
  })

  // Get project by ID
  ipcMain.handle('projects:getById', async (_, projectId: string): Promise<Project | null> => {
    const projectPath = join(getProjectsPath(), projectId)
    const metadataPath = join(projectPath, 'metadata.json')

    try {
      if (existsSync(metadataPath)) {
        const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8')) as ProjectMetadata
        const thumbnailPath = join(projectPath, 'thumbnail.png')

        return {
          ...metadata,
          thumbnailPath: existsSync(thumbnailPath) ? thumbnailPath : null
        }
      }
      return null
    } catch (error) {
      console.error('Error loading project:', error)
      return null
    }
  })

  // Update project metadata
  ipcMain.handle('projects:update', async (_, projectId: string, updates: Partial<ProjectMetadata>): Promise<boolean> => {
    const projectPath = join(getProjectsPath(), projectId)
    const metadataPath = join(projectPath, 'metadata.json')

    try {
      if (existsSync(metadataPath)) {
        const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8')) as ProjectMetadata
        const updated = {
          ...metadata,
          ...updates,
          modifiedAt: new Date().toISOString()
        }

        writeFileSync(metadataPath, JSON.stringify(updated, null, 2))
        return true
      }
      return false
    } catch (error) {
      console.error('Error updating project:', error)
      return false
    }
  })

  // Duplicate project
  ipcMain.handle('projects:duplicate', async (_, projectId: string): Promise<Project | null> => {
    const sourcePath = join(getProjectsPath(), projectId)
    const sourceMetadataPath = join(sourcePath, 'metadata.json')

    try {
      if (!existsSync(sourceMetadataPath)) {
        return null
      }

      const sourceMetadata = JSON.parse(readFileSync(sourceMetadataPath, 'utf-8')) as ProjectMetadata

      // Create new project with new ID
      const newProjectId = Date.now().toString()
      const newProjectPath = join(getProjectsPath(), newProjectId)

      // Copy entire directory
      mkdirSync(newProjectPath, { recursive: true })

      // Copy all files recursively
      const copyRecursive = (src: string, dest: string) => {
        const entries = readdirSync(src, { withFileTypes: true })
        for (const entry of entries) {
          const srcPath = join(src, entry.name)
          const destPath = join(dest, entry.name)
          if (entry.isDirectory()) {
            mkdirSync(destPath, { recursive: true })
            copyRecursive(srcPath, destPath)
          } else {
            copyFileSync(srcPath, destPath)
          }
        }
      }

      copyRecursive(sourcePath, newProjectPath)

      // Update metadata with new ID and name
      const newMetadata: ProjectMetadata = {
        ...sourceMetadata,
        id: newProjectId,
        name: `${sourceMetadata.name} (copie)`,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
      }

      writeFileSync(
        join(newProjectPath, 'metadata.json'),
        JSON.stringify(newMetadata, null, 2)
      )

      const thumbnailPath = join(newProjectPath, 'thumbnail.png')

      return {
        ...newMetadata,
        thumbnailPath: existsSync(thumbnailPath) ? thumbnailPath : null
      }
    } catch (error) {
      console.error('Error duplicating project:', error)
      return null
    }
  })
}
