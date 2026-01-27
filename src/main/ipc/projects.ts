import { ipcMain, dialog, app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync, rmSync, unlinkSync, createWriteStream } from 'fs'
import { spawn } from 'child_process'
import archiver from 'archiver'
import AdmZip from 'adm-zip'
import type { Project, ProjectMetadata, Template } from '@shared/types'

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

const convertImageToPdf = (imagePath: string, outputPath: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const pythonPath = getPythonPath()
    const scriptPath = join(getScriptsPath(), 'image_to_pdf.py')

    const configPath = join(app.getPath('temp'), `image-to-pdf-config-${Date.now()}.json`)
    const config = { imagePath, outputPath }

    try {
      writeFileSync(configPath, JSON.stringify(config))

      const proc = spawn(pythonPath, [scriptPath, configPath])

      let output = ''
      proc.stdout.on('data', (data) => {
        output += data.toString()
      })

      proc.stderr.on('data', (data) => {
        console.error('Image to PDF stderr:', data.toString())
      })

      proc.on('close', (code) => {
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
          console.error('Image to PDF conversion failed with code:', code)
          resolve(false)
        }
      })

      proc.on('error', (err) => {
        console.error('Image to PDF process error:', err)
        resolve(false)
      })
    } catch (error) {
      console.error('Error setting up image to PDF conversion:', error)
      resolve(false)
    }
  })
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

const getTemplatesPath = (): string => {
  return join(app.getPath('userData'), 'templates.json')
}

const loadTemplates = (): Template[] => {
  const templatesPath = getTemplatesPath()
  if (!existsSync(templatesPath)) {
    return []
  }
  try {
    return JSON.parse(readFileSync(templatesPath, 'utf-8')) as Template[]
  } catch {
    return []
  }
}

const saveTemplates = (templates: Template[]): boolean => {
  try {
    writeFileSync(getTemplatesPath(), JSON.stringify(templates, null, 2))
    return true
  } catch {
    return false
  }
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
      filters: [
        { name: 'Documents', extensions: ['pdf', 'jpg', 'jpeg', 'png'] },
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }
      ]
    })

    if (result.canceled || !result.filePaths[0]) {
      return null
    }

    const filePath = result.filePaths[0]
    const ext = filePath.split('.').pop()?.toLowerCase()
    const isImage = ['jpg', 'jpeg', 'png'].includes(ext || '')

    // Use filename (without extension) as default project name if not provided
    const fileName = filePath.split(/[/\\]/).pop() || 'source.pdf'
    const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, '')
    const projectName = name && name !== 'Nouveau projet' ? name : fileNameWithoutExt

    const projectId = Date.now().toString()
    const projectPath = join(getProjectsPath(), projectId)

    try {
      mkdirSync(projectPath, { recursive: true })
      mkdirSync(join(projectPath, 'images'), { recursive: true })

      const sourcePdfPath = join(projectPath, 'source.pdf')

      if (isImage) {
        // Convert image to PDF
        const success = await convertImageToPdf(filePath, sourcePdfPath)
        if (!success) {
          console.error('Failed to convert image to PDF')
          rmSync(projectPath, { recursive: true, force: true })
          return null
        }
      } else {
        // Copy PDF directly
        copyFileSync(filePath, sourcePdfPath)
      }

      // Create metadata
      const metadata: ProjectMetadata = {
        id: projectId,
        name: projectName,
        originalFilename: filePath.split(/[/\\]/).pop() || 'source.pdf',
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

  // Export project as ZIP
  ipcMain.handle('projects:exportZip', async (_, projectId: string): Promise<boolean> => {
    const projectPath = join(getProjectsPath(), projectId)
    const metadataPath = join(projectPath, 'metadata.json')

    try {
      if (!existsSync(metadataPath)) {
        return false
      }

      const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8')) as ProjectMetadata

      // Ask user where to save the ZIP
      const result = await dialog.showSaveDialog({
        defaultPath: `${metadata.name}.zip`,
        filters: [{ name: 'ZIP', extensions: ['zip'] }]
      })

      if (result.canceled || !result.filePath) {
        return false
      }

      // Check if template is custom (not default)
      const templates = loadTemplates()
      const template = templates.find(t => t.id === metadata.templateId)
      const includeTemplate = template && !template.isDefault

      // Create ZIP file
      return new Promise((resolve) => {
        const output = createWriteStream(result.filePath!)
        const archive = archiver('zip', { zlib: { level: 9 } })

        output.on('close', () => resolve(true))
        archive.on('error', (err) => {
          console.error('Error creating ZIP:', err)
          resolve(false)
        })

        archive.pipe(output)

        // Add all files from project directory to root of ZIP
        archive.directory(projectPath, false)

        // Add custom template if applicable
        if (includeTemplate && template) {
          archive.append(JSON.stringify(template, null, 2), { name: 'template.json' })
        }

        archive.finalize()
      })
    } catch (error) {
      console.error('Error exporting project as ZIP:', error)
      return false
    }
  })

  // Import project from ZIP
  ipcMain.handle('projects:importZip', async (): Promise<Project | null> => {
    try {
      // Ask user to select ZIP file
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'ZIP', extensions: ['zip'] }]
      })

      if (result.canceled || !result.filePaths[0]) {
        return null
      }

      const zipPath = result.filePaths[0]
      const zip = new AdmZip(zipPath)
      const zipEntries = zip.getEntries()

      // Check if valid project ZIP (must have metadata.json)
      const metadataEntry = zipEntries.find(e => e.entryName === 'metadata.json')
      if (!metadataEntry) {
        console.error('Invalid project ZIP: no metadata.json found')
        return null
      }

      // Read metadata
      const metadataContent = metadataEntry.getData().toString('utf-8')
      const importedMetadata = JSON.parse(metadataContent) as ProjectMetadata

      // Generate new project ID
      const newProjectId = Date.now().toString()
      const newProjectPath = join(getProjectsPath(), newProjectId)

      // Check for custom template
      const templateEntry = zipEntries.find(e => e.entryName === 'template.json')
      let newTemplateId = importedMetadata.templateId

      if (templateEntry) {
        // Import custom template with new ID
        const templateContent = templateEntry.getData().toString('utf-8')
        const importedTemplate = JSON.parse(templateContent) as Template

        // Generate new template ID and create it
        const newTemplateIdValue = Date.now().toString()
        const templates = loadTemplates()

        const newTemplate: Template = {
          ...importedTemplate,
          id: newTemplateIdValue,
          name: `${importedTemplate.name} (importé)`,
          isDefault: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        templates.push(newTemplate)
        saveTemplates(templates)
        newTemplateId = newTemplateIdValue
      }

      // Create project directory
      mkdirSync(newProjectPath, { recursive: true })

      // Extract all files except template.json
      for (const entry of zipEntries) {
        if (entry.entryName === 'template.json') continue
        if (entry.isDirectory) {
          mkdirSync(join(newProjectPath, entry.entryName), { recursive: true })
        } else {
          const targetPath = join(newProjectPath, entry.entryName)
          const targetDir = join(newProjectPath, entry.entryName.split('/').slice(0, -1).join('/'))
          if (targetDir && !existsSync(targetDir)) {
            mkdirSync(targetDir, { recursive: true })
          }
          writeFileSync(targetPath, entry.getData())
        }
      }

      // Update metadata with new ID and template reference
      const newMetadata: ProjectMetadata = {
        ...importedMetadata,
        id: newProjectId,
        name: `${importedMetadata.name} (importé)`,
        templateId: newTemplateId,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString()
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
      console.error('Error importing project from ZIP:', error)
      return null
    }
  })
}
