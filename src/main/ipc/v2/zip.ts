// v2 project ZIP export/import. Bundles a project's filesystem tree
// (sources/, dossiers/, orphans/, metadata.json, thumbnail.png). If the
// project uses a non-default template, the template is included as
// template.json at the ZIP root and recreated on import.
import { ipcMain, dialog, app } from 'electron'
import {
  createWriteStream,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'
import archiver from 'archiver'
import AdmZip from 'adm-zip'
import type {
  ProjectMetadataV2,
  ProjectView,
  Template,
} from '@shared/types'
import {
  ensureDir,
  getProjectDir,
  getProjectMetadataPath,
  listSubdirs,
  newId,
  readProjectMetadata,
  writeJson,
} from '../_fs'
import { buildProjectView } from './projects'

const getTemplatesPath = (): string => join(app.getPath('userData'), 'templates.json')

const loadTemplates = (): Template[] => {
  const p = getTemplatesPath()
  if (!existsSync(p)) return []
  try { return JSON.parse(readFileSync(p, 'utf-8')) as Template[] } catch { return [] }
}

const saveTemplates = (templates: Template[]): boolean => {
  try {
    writeFileSync(getTemplatesPath(), JSON.stringify(templates, null, 2))
    return true
  } catch { return false }
}

export function setupV2ZipHandlers(): void {
  ipcMain.handle('v2:projects:exportZip', async (_, projectId: string): Promise<boolean> => {
    const metadata = readProjectMetadata(projectId)
    if (!metadata) return false
    const projectDir = getProjectDir(projectId)
    if (!existsSync(projectDir)) return false

    const result = await dialog.showSaveDialog({
      defaultPath: `${metadata.name}.zip`,
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    })
    if (result.canceled || !result.filePath) return false

    const templates = loadTemplates()
    const template = templates.find((t) => t.id === metadata.templateId)
    const includeTemplate = template && !template.isDefault

    return new Promise((resolve) => {
      const output = createWriteStream(result.filePath!)
      const archive = archiver('zip', { zlib: { level: 9 } })
      output.on('close', () => resolve(true))
      archive.on('error', (err) => {
        console.error('Error creating v2 ZIP:', err)
        resolve(false)
      })
      archive.pipe(output)
      archive.directory(projectDir, false)
      if (includeTemplate && template) {
        archive.append(JSON.stringify(template, null, 2), { name: 'template.json' })
      }
      archive.finalize()
    })
  })

  ipcMain.handle('v2:projects:importZip', async (): Promise<ProjectView | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null

    try {
      const zipPath = result.filePaths[0]
      const zip = new AdmZip(zipPath)
      const entries = zip.getEntries()

      const metadataEntry = entries.find((e) => e.entryName === 'metadata.json')
      if (!metadataEntry) {
        console.error('Invalid project ZIP: no metadata.json')
        return null
      }
      const importedMetadata = JSON.parse(metadataEntry.getData().toString('utf-8')) as ProjectMetadataV2

      // Generate new ULID for the imported project, and create the folder.
      const newProjectId = newId()
      const newProjectDir = getProjectDir(newProjectId)
      ensureDir(newProjectDir)

      // Optional template
      const templateEntry = entries.find((e) => e.entryName === 'template.json')
      let newTemplateId = importedMetadata.templateId
      if (templateEntry) {
        try {
          const importedTemplate = JSON.parse(templateEntry.getData().toString('utf-8')) as Template
          const templates = loadTemplates()
          const newId2 = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          const newTemplate: Template = {
            ...importedTemplate,
            id: newId2,
            name: `${importedTemplate.name} (importé)`,
            isDefault: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          templates.push(newTemplate)
          saveTemplates(templates)
          newTemplateId = newId2
        } catch (err) {
          console.error('Failed to import bundled template:', err)
        }
      }

      // Extract everything except template.json into the project folder
      for (const entry of entries) {
        if (entry.entryName === 'template.json') continue
        if (entry.isDirectory) {
          ensureDir(join(newProjectDir, entry.entryName))
        } else {
          const targetPath = join(newProjectDir, entry.entryName)
          const targetDir = join(targetPath, '..')
          ensureDir(targetDir)
          writeFileSync(targetPath, entry.getData())
        }
      }

      const now = new Date().toISOString()
      const newMetadata: ProjectMetadataV2 = {
        id: newProjectId,
        name: `${importedMetadata.name} (importé)`,
        templateId: newTemplateId,
        createdAt: now,
        modifiedAt: now,
      }
      writeJson(getProjectMetadataPath(newProjectId), newMetadata)

      // Bonus: scrub any stale projectId references in source/dossier/article
      // metadata is unnecessary — they only reference IDs relative to the
      // project (sourceId, dossierId, articleId). Cross-project refs don't
      // exist in v2.
      void listSubdirs

      return buildProjectView(newProjectId)
    } catch (err) {
      console.error('v2 ZIP import error:', err)
      return null
    }
  })
}
