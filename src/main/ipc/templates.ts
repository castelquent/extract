import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import type { Template, TemplateField, FieldType, DeleteTemplateResult } from '@shared/types'

// Default templates carry their strings in both languages. At load time we
// "freeze" the seed to the user's current language and return a plain
// Template — the rest of the codebase reads `template.name` as a string
// without ever knowing about i18n. User-created templates are pure data
// (single language, never touched by this).
interface I18nString {
  fr: string
  en: string
}
interface SeedField {
  // Stable id within the seed (e.g. 'title', 'author'). Surfaced on the
  // localized TemplateField so the UI can match snapshotted article schemas
  // back to the live template even when the localized name has changed.
  id: string
  name: I18nString
  type: FieldType
  aiHint?: I18nString
  order: number
}
interface SeedTemplate {
  id: string
  name: I18nString
  description: I18nString
  aiContext: I18nString
  fields: SeedField[]
  createdAt: string
  updatedAt: string
}

const DEFAULT_SEEDS: SeedTemplate[] = [
  {
    id: 'press-article',
    name: { fr: 'Article de presse', en: 'Press article' },
    description: { fr: 'Journaux, magazines, revues', en: 'Newspapers, magazines, journals' },
    aiContext: {
      fr: 'Ceci est un article de presse à transcrire.',
      en: 'This is a press article to transcribe.',
    },
    fields: [
      {
        id: 'title',
        name: { fr: 'Titre', en: 'Title' },
        type: 'text',
        aiHint: { fr: "Le titre de l'article", en: "The article's title" },
        order: 0,
      },
      {
        id: 'author',
        name: { fr: 'Auteur', en: 'Author' },
        type: 'text',
        aiHint: { fr: "L'auteur de l'article", en: "The article's author" },
        order: 1,
      },
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'correspondence',
    name: { fr: 'Correspondance', en: 'Correspondence' },
    description: { fr: 'Lettres, courriers', en: 'Letters, mail' },
    aiContext: {
      fr: 'Ceci est une lettre ou correspondance à transcrire.',
      en: 'This is a letter or correspondence to transcribe.',
    },
    fields: [
      {
        id: 'date',
        name: { fr: 'Date', en: 'Date' },
        type: 'text',
        aiHint: { fr: 'La date du document', en: "The document's date" },
        order: 0,
      },
      {
        id: 'sender',
        name: { fr: 'Expéditeur', en: 'Sender' },
        type: 'text',
        aiHint: { fr: "L'expéditeur de la lettre", en: "The letter's sender" },
        order: 1,
      },
      {
        id: 'recipient',
        name: { fr: 'Destinataire', en: 'Recipient' },
        type: 'text',
        aiHint: { fr: 'Le destinataire de la lettre', en: "The letter's recipient" },
        order: 2,
      },
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
]

// Read the user's UI language straight from settings.json. Sync read keeps
// the templates IPC handlers non-async at their boundary; the file is tiny.
function readLang(): 'fr' | 'en' {
  try {
    const path = join(app.getPath('userData'), 'settings.json')
    if (!existsSync(path)) return 'fr'
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    return parsed?.app?.language === 'en' ? 'en' : 'fr'
  } catch {
    return 'fr'
  }
}

function localizeSeed(seed: SeedTemplate, lang: 'fr' | 'en'): Template {
  const fields: TemplateField[] = seed.fields.map((f) => ({
    id: f.id,
    name: f.name[lang],
    type: f.type,
    aiHint: f.aiHint?.[lang],
    order: f.order,
  }))
  return {
    id: seed.id,
    name: seed.name[lang],
    description: seed.description[lang],
    aiContext: seed.aiContext[lang],
    fields,
    isDefault: true,
    createdAt: seed.createdAt,
    updatedAt: seed.updatedAt,
  }
}

const getTemplatesPath = (): string => {
  return join(app.getPath('userData'), 'templates.json')
}

export const loadTemplates = (): Template[] => {
  const lang = readLang()
  const templatesPath = getTemplatesPath()

  if (!existsSync(templatesPath)) {
    const seeded = DEFAULT_SEEDS.map((s) => localizeSeed(s, lang))
    writeFileSync(templatesPath, JSON.stringify(seeded, null, 2))
    return seeded
  }

  try {
    const stored = JSON.parse(readFileSync(templatesPath, 'utf-8')) as Template[]
    // Re-derive default templates from the bilingual seed at every load so
    // they always match the current UI language. User-created templates pass
    // through untouched.
    return stored.map((t) => {
      if (!t.isDefault) return t
      const seed = DEFAULT_SEEDS.find((s) => s.id === t.id)
      return seed ? localizeSeed(seed, lang) : t
    })
  } catch (error) {
    console.error('Error loading templates:', error)
    return DEFAULT_SEEDS.map((s) => localizeSeed(s, lang))
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
  ipcMain.handle('templates:getAll', async (): Promise<Template[]> => {
    return loadTemplates()
  })

  ipcMain.handle('templates:getById', async (_, templateId: string): Promise<Template | null> => {
    const templates = loadTemplates()
    return templates.find((t) => t.id === templateId) || null
  })

  ipcMain.handle('templates:save', async (_, template: Template): Promise<boolean> => {
    const templates = loadTemplates()
    const existingIndex = templates.findIndex((t) => t.id === template.id)

    if (existingIndex >= 0) {
      templates[existingIndex] = {
        ...template,
        updatedAt: new Date().toISOString(),
      }
    } else {
      templates.push({
        ...template,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    }

    return saveTemplates(templates)
  })

  // Delete template. Default templates are protected; articles snapshot
  // their schema so removing a custom template can't break anything live.
  ipcMain.handle('templates:delete', async (_, templateId: string): Promise<DeleteTemplateResult> => {
    const templates = loadTemplates()
    const template = templates.find((t) => t.id === templateId)

    if (template?.isDefault) {
      return { success: false, reason: 'is_default' }
    }

    const filtered = templates.filter((t) => t.id !== templateId)
    const saved = saveTemplates(filtered)
    return { success: saved }
  })
}
