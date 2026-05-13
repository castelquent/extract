// v2 project ZIP export/import. Bundles a project's filesystem tree
// (sources/, dossiers/, orphans/, metadata.json, thumbnail.png). Each element
// carries its own schema snapshot, so the archive is self-contained — no need
// to embed a separate template.json.
import { ipcMain, dialog } from 'electron'
import {
  createWriteStream,
  existsSync,
  writeFileSync,
} from 'fs'
import { join } from 'path'
import archiver from 'archiver'
import AdmZip from 'adm-zip'
import type {
  ProjectMetadataV2,
  ProjectView,
} from '@shared/types'
import {
  ensureDir,
  getProjectDir,
  getProjectMetadataPath,
  newId,
  readProjectMetadata,
  writeJson,
} from '../_fs'
import { buildProjectView } from './projects'

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

      const newProjectId = newId()
      const newProjectDir = getProjectDir(newProjectId)
      ensureDir(newProjectDir)

      // Extract everything into the project folder (skip any legacy template.json)
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
        defaultTemplateId: importedMetadata.defaultTemplateId,
        createdAt: now,
        modifiedAt: now,
      }
      writeJson(getProjectMetadataPath(newProjectId), newMetadata)

      return buildProjectView(newProjectId)
    } catch (err) {
      console.error('v2 ZIP import error:', err)
      return null
    }
  })
}
