import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '@shared/types'

const api: ElectronAPI = {
  // Projects
  getProjects: () => ipcRenderer.invoke('projects:getAll'),
  createProject: (name) => ipcRenderer.invoke('projects:create', name),
  deleteProject: (projectId) => ipcRenderer.invoke('projects:delete', projectId),
  getProject: (projectId) => ipcRenderer.invoke('projects:getById', projectId),
  updateProject: (projectId, updates) => ipcRenderer.invoke('projects:update', projectId, updates),

  // Extraction
  saveExtraction: (projectId, data) => ipcRenderer.invoke('extraction:save', projectId, data),
  loadExtraction: (projectId) => ipcRenderer.invoke('extraction:load', projectId),
  exportImages: (projectId, articles) => ipcRenderer.invoke('extraction:exportImages', projectId, articles),
  getPdfPath: (projectId) => ipcRenderer.invoke('extraction:getPdfPath', projectId),
  getPdfData: (projectId) => ipcRenderer.invoke('extraction:getPdfData', projectId),
  getImageData: (projectId, imagePath) => ipcRenderer.invoke('extraction:getImageData', projectId, imagePath),
  getPdfFile: (projectId, imagePath) => ipcRenderer.invoke('extraction:getPdfFile', projectId, imagePath),

  // Transcription
  transcribe: (projectId, imagePath, settings) => ipcRenderer.invoke('transcription:transcribe', projectId, imagePath, settings),

  // Export
  exportPdf: (projectId, articles) => ipcRenderer.invoke('export:pdf', projectId, articles),
  exportDocx: (projectId, articles) => ipcRenderer.invoke('export:docx', projectId, articles),
  exportZip: (projectId) => ipcRenderer.invoke('export:zip', projectId),
  importZip: () => ipcRenderer.invoke('export:importZip'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  getVersion: () => ipcRenderer.invoke('settings:getVersion'),
  checkUpdates: () => ipcRenderer.invoke('settings:checkUpdates'),
  downloadUpdate: () => ipcRenderer.invoke('settings:downloadUpdate'),
  installUpdate: () => ipcRenderer.invoke('settings:installUpdate'),
}

contextBridge.exposeInMainWorld('api', api)
