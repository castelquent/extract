import { contextBridge, ipcRenderer, webFrame } from 'electron'
import type { ElectronAPI } from '@shared/types'

// Disable Electron's built-in zoom (Ctrl+wheel, pinch on trackpad) so the
// extraction page can implement its own zoom on the PDF viewer.
webFrame.setVisualZoomLevelLimits(1, 1)

const api: ElectronAPI & {
  onCheckUnsavedChanges: (callback: () => void) => () => void
  confirmClose: () => void
  cancelClose: () => void
} = {
  // Templates
  getTemplates: () => ipcRenderer.invoke('templates:getAll'),
  getTemplate: (templateId) => ipcRenderer.invoke('templates:getById', templateId),
  saveTemplate: (template) => ipcRenderer.invoke('templates:save', template),
  deleteTemplate: (templateId) => ipcRenderer.invoke('templates:delete', templateId),

  // Projects
  getProjects: () => ipcRenderer.invoke('projects:getAll'),
  createProject: (name, templateId) => ipcRenderer.invoke('projects:create', name, templateId),
  deleteProject: (projectId) => ipcRenderer.invoke('projects:delete', projectId),
  duplicateProject: (projectId) => ipcRenderer.invoke('projects:duplicate', projectId),
  getProject: (projectId) => ipcRenderer.invoke('projects:getById', projectId),
  updateProject: (projectId, updates) => ipcRenderer.invoke('projects:update', projectId, updates),
  exportProjectZip: (projectId) => ipcRenderer.invoke('projects:exportZip', projectId),
  importProjectZip: () => ipcRenderer.invoke('projects:importZip'),

  // Extraction
  saveExtraction: (projectId, data) => ipcRenderer.invoke('extraction:save', projectId, data),
  loadExtraction: (projectId) => ipcRenderer.invoke('extraction:load', projectId),
  exportImages: (projectId, articles) => ipcRenderer.invoke('extraction:exportImages', projectId, articles),
  getPdfPath: (projectId) => ipcRenderer.invoke('extraction:getPdfPath', projectId),
  getPdfData: (projectId) => ipcRenderer.invoke('extraction:getPdfData', projectId),
  getImageData: (projectId, imagePath) => ipcRenderer.invoke('extraction:getImageData', projectId, imagePath),
  getPdfFile: (projectId, imagePath) => ipcRenderer.invoke('extraction:getPdfFile', projectId, imagePath),
  extractText: (projectId, imagePath) => ipcRenderer.invoke('extraction:extractText', projectId, imagePath),

  // Transcription
  transcribe: (projectId, imagePath, settings, template) => ipcRenderer.invoke('transcription:transcribe', projectId, imagePath, settings, template),

  // Export
  exportPdf: (projectId, articles) => ipcRenderer.invoke('export:pdf', projectId, articles),
  exportDocx: (projectId, articles) => ipcRenderer.invoke('export:docx', projectId, articles),
  exportTxt: (projectId, articles) => ipcRenderer.invoke('export:txt', projectId, articles),
  exportZip: (projectId) => ipcRenderer.invoke('export:zip', projectId),
  importZip: () => ipcRenderer.invoke('export:importZip'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  getVersion: () => ipcRenderer.invoke('settings:getVersion'),
  checkUpdates: () => ipcRenderer.invoke('settings:checkUpdates'),

  // Logs
  getLogs: () => ipcRenderer.invoke('settings:getLogs'),

  // Window close management
  onCheckUnsavedChanges: (callback: () => void) => {
    ipcRenderer.on('check-unsaved-changes', callback)
    return () => {
      ipcRenderer.removeListener('check-unsaved-changes', callback)
    }
  },
  confirmClose: () => ipcRenderer.send('confirm-close'),
  cancelClose: () => ipcRenderer.send('cancel-close'),

  // Auto-update events
  onUpdateAvailable: (callback: (version: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, version: string) => callback(version)
    ipcRenderer.on('update-available', handler)
    return () => {
      ipcRenderer.removeListener('update-available', handler)
    }
  },
  onUpdateProgress: (callback: (percent: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, percent: number) => callback(percent)
    ipcRenderer.on('update-progress', handler)
    return () => {
      ipcRenderer.removeListener('update-progress', handler)
    }
  },
  onUpdateDownloaded: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('update-downloaded', handler)
    return () => {
      ipcRenderer.removeListener('update-downloaded', handler)
    }
  },
  onUpdateError: (callback: (error: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, error: string) => callback(error)
    ipcRenderer.on('update-error', handler)
    return () => {
      ipcRenderer.removeListener('update-error', handler)
    }
  },
  startUpdateDownload: () => ipcRenderer.invoke('start-update-download'),
  installUpdate: () => ipcRenderer.send('install-update'),

  // External shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // ============================================================
  // v2 API surface: Project > Dossier > Article (filesystem-as-truth)
  // ============================================================

  // Projects v2
  v2_projectsList: () => ipcRenderer.invoke('v2:projects:list'),
  v2_projectsGet: (projectId) => ipcRenderer.invoke('v2:projects:get', projectId),
  v2_projectsCreate: (name, templateId) => ipcRenderer.invoke('v2:projects:create', name, templateId),
  v2_projectsRename: (projectId, name) => ipcRenderer.invoke('v2:projects:rename', projectId, name),
  v2_projectsDelete: (projectId) => ipcRenderer.invoke('v2:projects:delete', projectId),
  v2_projectsDuplicate: (projectId) => ipcRenderer.invoke('v2:projects:duplicate', projectId),
  v2_projectsOpenFolder: (projectId) => ipcRenderer.invoke('v2:projects:openFolder', projectId),

  // Sources v2
  v2_sourcesAdd: (projectId) => ipcRenderer.invoke('v2:sources:add', projectId),
  v2_sourcesList: (projectId) => ipcRenderer.invoke('v2:sources:list', projectId),
  v2_sourcesGet: (projectId, sourceId) => ipcRenderer.invoke('v2:sources:get', projectId, sourceId),
  v2_sourcesDelete: (projectId, sourceId, force) => ipcRenderer.invoke('v2:sources:delete', projectId, sourceId, force),
  v2_sourcesGetPdfData: (projectId, sourceId) => ipcRenderer.invoke('v2:sources:getPdfData', projectId, sourceId),
  v2_sourcesGetThumbnail: (projectId, sourceId) => ipcRenderer.invoke('v2:sources:getThumbnail', projectId, sourceId),

  // Dossiers v2
  v2_dossiersCreate: (projectId, name) => ipcRenderer.invoke('v2:dossiers:create', projectId, name),
  v2_dossiersList: (projectId) => ipcRenderer.invoke('v2:dossiers:list', projectId),
  v2_dossiersGet: (projectId, dossierId) => ipcRenderer.invoke('v2:dossiers:get', projectId, dossierId),
  v2_dossiersRename: (projectId, dossierId, name) => ipcRenderer.invoke('v2:dossiers:rename', projectId, dossierId, name),
  v2_dossiersDelete: (projectId, dossierId, mode) => ipcRenderer.invoke('v2:dossiers:delete', projectId, dossierId, mode),

  // Articles v2
  v2_articlesList: (projectId, scope) => ipcRenderer.invoke('v2:articles:list', projectId, scope),
  v2_articlesGet: (projectId, articleId) => ipcRenderer.invoke('v2:articles:get', projectId, articleId),
  v2_articlesCreate: (projectId, payload) => ipcRenderer.invoke('v2:articles:create', projectId, payload),
  v2_articlesUpdate: (projectId, articleId, patch) => ipcRenderer.invoke('v2:articles:update', projectId, articleId, patch),
  v2_articlesDelete: (projectId, articleId) => ipcRenderer.invoke('v2:articles:delete', projectId, articleId),
  v2_articlesMove: (projectId, articleId, target) => ipcRenderer.invoke('v2:articles:move', projectId, articleId, target),
  v2_articlesMoveBulk: (projectId, articleIds, target) => ipcRenderer.invoke('v2:articles:moveBulk', projectId, articleIds, target),
  v2_articlesGetExtractData: (projectId, articleId) => ipcRenderer.invoke('v2:articles:getExtractData', projectId, articleId),
  v2_articlesRegenerateExtract: (projectId, articleId) => ipcRenderer.invoke('v2:articles:regenerateExtract', projectId, articleId),

  // Transcription v2
  v2_transcribe: (projectId, articleId, settings, template) => ipcRenderer.invoke('v2:transcription:transcribe', projectId, articleId, settings, template),

  // Export v2
  v2_exportArticlesPdf: (projectId, articleIds) => ipcRenderer.invoke('v2:export:articlesPdf', projectId, articleIds),
  v2_exportArticlesDocx: (projectId, articleIds) => ipcRenderer.invoke('v2:export:articlesDocx', projectId, articleIds),
  v2_exportArticlesTxt: (projectId, articleIds) => ipcRenderer.invoke('v2:export:articlesTxt', projectId, articleIds),

  // File watcher notifications (main → renderer)
  v2_onProjectsListChanged: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('v2:fs:projectsListChanged', handler)
    return () => {
      ipcRenderer.removeListener('v2:fs:projectsListChanged', handler)
    }
  },
  v2_onProjectChanged: (callback: (projectId: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, projectId: string) => callback(projectId)
    ipcRenderer.on('v2:fs:projectChanged', handler)
    return () => {
      ipcRenderer.removeListener('v2:fs:projectChanged', handler)
    }
  },
}

contextBridge.exposeInMainWorld('api', api)
