import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import type { Template, DeleteTemplateResult } from '@shared/types'

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 'press-article',
    name: 'Article de presse',
    description: 'Journaux, magazines, revues',
    aiContext: 'Ceci est un article de presse à transcrire.',
    fields: [
      { name: 'Titre', type: 'text', order: 1 },
      { name: 'Auteur', type: 'text', order: 2 },
      { name: 'Contenu', type: 'richtext', order: 3 }
    ],
    isDefault: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  },
  {
    id: 'correspondence',
    name: 'Correspondance',
    description: 'Lettres, courriers',
    aiContext: 'Ceci est une lettre ou correspondance à transcrire.',
    fields: [
      { name: 'Date', type: 'text', order: 1 },
      { name: 'Expéditeur', type: 'text', order: 2 },
      { name: 'Destinataire', type: 'text', order: 3 },
      { name: 'Contenu', type: 'richtext', order: 4 }
    ],
    isDefault: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  }
]

const getTemplatesPath = (): string => {
  return join(app.getPath('userData'), 'templates.json')
}

const loadTemplates = (): Template[] => {
  const templatesPath = getTemplatesPath()

  if (!existsSync(templatesPath)) {
    // Initialize with default templates
    writeFileSync(templatesPath, JSON.stringify(DEFAULT_TEMPLATES, null, 2))
    return DEFAULT_TEMPLATES
  }

  try {
    const data = readFileSync(templatesPath, 'utf-8')
    return JSON.parse(data) as Template[]
  } catch (error) {
    console.error('Error loading templates:', error)
    return DEFAULT_TEMPLATES
  }
}

const saveTemplates = (templates: Template[]): boolean => {
  try {
    writeFileSync(getTemplatesPath(), JSON.stringify(templates, null, 2))
    return true
  } catch (error) {
    console.error('Error saving templates:', error)
    return false
  }
}

export function setupTemplateHandlers(): void {
  // Get all templates
  ipcMain.handle('templates:getAll', async (): Promise<Template[]> => {
    return loadTemplates()
  })

  // Get template by ID
  ipcMain.handle('templates:getById', async (_, templateId: string): Promise<Template | null> => {
    const templates = loadTemplates()
    return templates.find(t => t.id === templateId) || null
  })

  // Save template (create or update)
  ipcMain.handle('templates:save', async (_, template: Template): Promise<boolean> => {
    const templates = loadTemplates()
    const existingIndex = templates.findIndex(t => t.id === template.id)

    if (existingIndex >= 0) {
      // Update existing
      templates[existingIndex] = {
        ...template,
        updatedAt: new Date().toISOString()
      }
    } else {
      // Create new
      templates.push({
        ...template,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    }

    return saveTemplates(templates)
  })

  // Delete template — articles snapshot their schema, so a deleted model
  // never breaks anything. Only default models stay protected.
  ipcMain.handle('templates:delete', async (_, templateId: string): Promise<DeleteTemplateResult> => {
    const templates = loadTemplates()
    const template = templates.find(t => t.id === templateId)

    if (template?.isDefault) {
      return { success: false, reason: 'is_default' }
    }

    const filtered = templates.filter(t => t.id !== templateId)
    const saved = saveTemplates(filtered)
    return { success: saved }
  })
}
