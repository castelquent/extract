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

export interface DeleteTemplateResult {
  success: boolean
  reason?: 'is_default'
}

// ============================================================
// v2 model: Project > Dossier > Article (with Sources)
// Filesystem-as-truth. Each entity lives in its own folder
// under %AppData%/Local/ExtrAct/projects/{projectId}/...
// ============================================================

// Generic PDF zone (article zones still use normalized coordinates)
export interface Zone {
  page: number
  x1: number
  y1: number
  x2: number
  y2: number
}

// --- Project (corpus / theme) ---
// `defaultTemplateId` is just the model pre-selected when creating a new
// element. It does NOT constrain element schemas: each element carries its
// own snapshotted schema (see ArticleMetadata.schema).
export interface ProjectMetadataV2 {
  id: string
  name: string
  defaultTemplateId: string
  createdAt: string
  modifiedAt: string
}

// Read-only aggregated view returned by projects:list / projects:get
export interface ProjectView extends ProjectMetadataV2 {
  thumbnailPath: string | null
  sourcesCount: number
  dossiersCount: number
  articlesToExtract: number  // status === 'draft' (PDF pending)
  articlesTotal: number       // status === 'ready' (real elements)
  articlesFilled: number      // status === 'ready' AND every schema field has a value
}

// --- Source (a PDF imported into a project) ---
export interface SourceMetadata {
  id: string
  originalFilename: string
  pageCount: number
  importedAt: string
}

export interface SourceView extends SourceMetadata {
  thumbnailPath: string | null
  articlesCount: number
}

// --- Dossier (optional grouping of articles inside a project) ---
export interface DossierMetadata {
  id: string
  name: string
  createdAt: string
  modifiedAt: string
}

export interface DossierView extends DossierMetadata {
  articlesCount: number
}

// --- Article (the portable unit) ---
// Binary status. 'draft' means the extract.pdf doesn't reflect the current
// zones (either never generated, or zones were modified since last gen).
// 'ready' means the PDF on disk is up to date. Completion (whether the
// element's fields are filled) is computed from `fields` + `schema`, NOT
// stored as a status — manual fills and AI transcriptions are equivalent.
export type ArticleStatus = 'draft' | 'ready'

// An article carries its own field schema (snapshotted from a Template at
// creation). Editing a Template afterwards does NOT mutate existing articles.
// "Apply a model" copies a new schema in via the merge strategy in
// EditorV2.
export interface ArticleMetadata {
  id: string
  sourceId: string
  dossierId: string | null   // null = orphan (no dossier)
  zones: Zone[]
  pages: number[]
  fields: Record<string, string>
  status: ArticleStatus
  schema: TemplateField[]
  aiContext?: string
  createdAt: string
  modifiedAt: string
}

// Filtering scope passed to articles:list. Drafts (status='draft') are
// hidden from every consumer by default — callers in extraction context
// must opt in via `includeDrafts: true` (or filter explicitly by
// status='draft').
export interface ArticleScope {
  dossierId?: string | null   // null = orphans only; undefined = any
  sourceId?: string
  articleId?: string          // when set: list returns at most this single article
  articleIds?: string[]       // when set: list returns only articles whose id is in this set
  status?: ArticleStatus
  includeDrafts?: boolean
}

// --- Dossier deletion mode ---
export type DossierDeleteMode = 'delete-content' | 'orphan-articles'

// --- Move target for articles ---
export interface ArticleMoveTarget {
  dossierId?: string | null              // intra-project: null = orphan
  targetProjectId?: string                // cross-project (overrides dossierId interpretation)
  targetDossierId?: string | null         // when targetProjectId set: null = orphan in target
}

// ============================================================
// AI / Settings
// ============================================================
export type AIProvider = 'openai' | 'anthropic'

export interface AISettings {
  provider: AIProvider
  apiKey: string  // Deprecated, kept for backward compatibility
  model: string
  prompt: string
  anthropicApiKey?: string
  openaiApiKey?: string
}

export interface TranscriptionResult {
  success: boolean
  data?: {
    fields: Record<string, string>
  }
  error?: string
  rawContent?: string
}

export interface TranscriptionLog {
  date: string
  projectId: string
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  success: boolean
  error?: string
}

export interface Settings {
  ai: AISettings
  app: {
    checkUpdatesOnStart: boolean
    theme: 'light' | 'dark'
    onboardingSeen?: boolean
  }
}

// ============================================================
// IPC API surface (v2 only)
// ============================================================
export interface ElectronAPI {
  // Templates
  getTemplates: () => Promise<Template[]>
  getTemplate: (templateId: string) => Promise<Template | null>
  saveTemplate: (template: Template) => Promise<boolean>
  deleteTemplate: (templateId: string) => Promise<DeleteTemplateResult>

  // Settings
  getSettings: () => Promise<Settings>
  saveSettings: (settings: Settings) => Promise<boolean>
  getVersion: () => Promise<string>
  checkUpdates: () => Promise<{ available: boolean; version?: string }>

  // Logs
  getLogs: () => Promise<TranscriptionLog[]>

  // Window close management
  onCheckUnsavedChanges: (callback: () => void) => () => void
  confirmClose: () => void
  cancelClose: () => void

  // Auto-update
  onUpdateAvailable: (callback: (version: string) => void) => () => void
  onUpdateProgress: (callback: (percent: number) => void) => () => void
  onUpdateDownloaded: (callback: () => void) => () => void
  onUpdateError: (callback: (error: string) => void) => () => void
  startUpdateDownload: () => Promise<void>
  installUpdate: () => void

  // External shell
  openExternal: (url: string) => Promise<void>

  // ============================================================
  // v2 surface
  // ============================================================

  // Projects
  v2_projectsList: () => Promise<ProjectView[]>
  v2_projectsGet: (projectId: string) => Promise<ProjectView | null>
  v2_projectsCreate: (name: string, templateId: string) => Promise<ProjectView | null>
  v2_projectsRename: (projectId: string, name: string) => Promise<boolean>
  v2_projectsUpdate: (
    projectId: string,
    patch: { name?: string; defaultTemplateId?: string }
  ) => Promise<boolean>
  v2_projectsDelete: (projectId: string) => Promise<boolean>
  v2_projectsDuplicate: (projectId: string) => Promise<ProjectView | null>
  v2_projectsOpenFolder: (projectId: string) => Promise<boolean>
  v2_projectsExportZip: (projectId: string) => Promise<boolean>
  v2_projectsImportZip: () => Promise<ProjectView | null>
  v2_projectsGetThumbnail: (projectId: string) => Promise<string | null>

  // Sources
  v2_sourcesAdd: (projectId: string) => Promise<SourceView[]>
  v2_sourcesList: (projectId: string) => Promise<SourceView[]>
  v2_sourcesGet: (projectId: string, sourceId: string) => Promise<SourceView | null>
  v2_sourcesDelete: (projectId: string, sourceId: string, force?: boolean) => Promise<{ ok: boolean; reason?: 'has-articles'; articlesCount?: number }>
  v2_sourcesGetPdfData: (projectId: string, sourceId: string) => Promise<ArrayBuffer | null>
  v2_sourcesGetThumbnail: (projectId: string, sourceId: string) => Promise<string | null>

  // Dossiers
  v2_dossiersCreate: (projectId: string, name: string) => Promise<DossierView | null>
  v2_dossiersList: (projectId: string) => Promise<DossierView[]>
  v2_dossiersGet: (projectId: string, dossierId: string) => Promise<DossierView | null>
  v2_dossiersRename: (projectId: string, dossierId: string, name: string) => Promise<boolean>
  v2_dossiersDelete: (projectId: string, dossierId: string, mode: DossierDeleteMode) => Promise<boolean>

  // Articles
  v2_articlesList: (projectId: string, scope?: ArticleScope) => Promise<ArticleMetadata[]>
  v2_articlesGet: (projectId: string, articleId: string) => Promise<ArticleMetadata | null>
  v2_articlesCreate: (
    projectId: string,
    payload: {
      sourceId: string
      dossierId: string | null
      zones: Zone[]
      pages: number[]
      fields?: Record<string, string>
      schema: TemplateField[]
      aiContext?: string
      // When true, do NOT run the PDF extraction script (no extract.pdf
      // generated, status stays 'draft'). Used by Sauvegarder in extraction.
      skipExtractGeneration?: boolean
    }
  ) => Promise<ArticleMetadata | null>
  v2_articlesUpdate: (
    projectId: string,
    articleId: string,
    patch: Partial<Pick<ArticleMetadata, 'fields' | 'zones' | 'pages' | 'status' | 'sourceId' | 'dossierId' | 'schema' | 'aiContext'>>
  ) => Promise<boolean>
  v2_articlesDelete: (projectId: string, articleId: string) => Promise<boolean>
  v2_articlesMove: (projectId: string, articleId: string, target: ArticleMoveTarget) => Promise<boolean>
  v2_articlesMoveBulk: (projectId: string, articleIds: string[], target: ArticleMoveTarget) => Promise<boolean>
  v2_articlesGetExtractData: (projectId: string, articleId: string) => Promise<string | null>
  v2_articlesRegenerateExtract: (projectId: string, articleId: string) => Promise<boolean>

  // Transcription — prompt is built server-side from article.schema + article.aiContext
  v2_transcribe: (projectId: string, articleId: string, settings: AISettings) => Promise<TranscriptionResult>

  // Export
  v2_exportArticlesPdf: (projectId: string, articleIds: string[]) => Promise<boolean>
  v2_exportArticlesDocx: (projectId: string, articleIds: string[]) => Promise<boolean>
  v2_exportArticlesTxt: (projectId: string, articleIds: string[]) => Promise<boolean>

  // File watcher notifications
  v2_onProjectsListChanged: (callback: () => void) => () => void
  v2_onProjectChanged: (callback: (projectId: string) => void) => () => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
