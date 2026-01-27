import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '@shared/types'

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
  downloadUpdate: () => ipcRenderer.invoke('settings:downloadUpdate'),
  installUpdate: () => ipcRenderer.invoke('settings:installUpdate'),

  // Logs
  getLogs: () => ipcRenderer.invoke('settings:getLogs'),

  // Window close management
  onCheckUnsavedChanges: (callback: () => void) => {
    ipcRenderer.on('check-unsaved-changes', callback)
    // Retourner une fonction de cleanup
    return () => {
      ipcRenderer.removeListener('check-unsaved-changes', callback)
    }
  },
  confirmClose: () => ipcRenderer.send('confirm-close'),
  cancelClose: () => ipcRenderer.send('cancel-close'),
}

contextBridge.exposeInMainWorld('api', api)
