// Template types
export type FieldType = 'text' | 'textarea' | 'richtext'

export interface TemplateField {
  name: string
  type: FieldType
  aiHint?: string
  order: number
}

export interface Template {
  id: string
  name: string
  description?: string
  aiContext?: string
  fields: TemplateField[]
  isDefault?: boolean
  createdAt: string
  updatedAt: string
}

// Project types
export interface ProjectMetadata {
  id: string
  name: string
  originalFilename: string
  createdAt: string
  modifiedAt: string
  status: 'new' | 'extracting' | 'extracted' | 'in_progress' | 'completed'
  articlesCount: number
  filledFields: number
  totalFields: number
  templateId: string
}

export interface Project extends ProjectMetadata {
  thumbnailPath: string | null
}

// Article types
export interface Zone {
  page: number
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface Article {
  id: number
  zones: Zone[]
  fields: Record<string, string>
  imagePath?: string
}

export interface ExtractionData {
  articles: Article[]
}

// AI types
export type AIProvider = 'openai' | 'anthropic'

export interface AISettings {
  provider: AIProvider
  apiKey: string
  model: string
  prompt: string
}

export interface TranscriptionResult {
  success: boolean
  data?: {
    fields: Record<string, string>
  }
  error?: string
  rawContent?: string
}

// Settings types
export interface Settings {
  ai: AISettings
  app: {
    checkUpdatesOnStart: boolean
    theme: 'light' | 'dark'
  }
}

// IPC API types
export interface ElectronAPI {
  // Templates
  getTemplates: () => Promise<Template[]>
  getTemplate: (templateId: string) => Promise<Template | null>
  saveTemplate: (template: Template) => Promise<boolean>
  deleteTemplate: (templateId: string) => Promise<boolean>

  // Projects
  getProjects: () => Promise<Project[]>
  createProject: (name: string, templateId: string) => Promise<Project | null>
  deleteProject: (projectId: string) => Promise<boolean>
  duplicateProject: (projectId: string) => Promise<Project | null>
  getProject: (projectId: string) => Promise<Project | null>
  updateProject: (projectId: string, updates: Partial<ProjectMetadata>) => Promise<boolean>

  // Extraction
  saveExtraction: (projectId: string, data: ExtractionData) => Promise<boolean>
  loadExtraction: (projectId: string) => Promise<ExtractionData | null>
  exportImages: (projectId: string, articles: Article[]) => Promise<Article[] | null>
  getPdfPath: (projectId: string) => Promise<string | null>
  getPdfData: (projectId: string) => Promise<ArrayBuffer | null>
  getImageData: (projectId: string, imagePath: string) => Promise<string | null>
  getPdfFile: (projectId: string, imagePath: string) => Promise<string | null>
  // Transcription
  transcribe: (projectId: string, imagePath: string, settings: AISettings, template: Template) => Promise<TranscriptionResult>

  // Export
  exportPdf: (projectId: string, articles: Article[]) => Promise<boolean>
  exportDocx: (projectId: string, articles: Article[]) => Promise<boolean>
  exportTxt: (projectId: string, articles: Article[]) => Promise<boolean>
  exportZip: (projectId: string) => Promise<boolean>
  importZip: () => Promise<string | null>

  // Settings
  getSettings: () => Promise<Settings>
  saveSettings: (settings: Settings) => Promise<boolean>
  getVersion: () => Promise<string>
  checkUpdates: () => Promise<{ available: boolean; version?: string }>
  downloadUpdate: () => Promise<boolean>
  installUpdate: () => Promise<void>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
