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
}

contextBridge.exposeInMainWorld('api', api)
