const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadJSON: () => ipcRenderer.invoke('load-json'),
  onJSONLoaded: (callback) => ipcRenderer.on('json-loaded', (event, data) => callback(data)),
  saveJSON: (data) => ipcRenderer.invoke('save-json-file', data),
  onSaveRequested: (callback) => ipcRenderer.on('save-json', () => callback()),
  transcribeImage: (data) => ipcRenderer.invoke('transcribe-image', data),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  extractPDF: (params) => ipcRenderer.invoke('extract-pdf', params),
  loadPDF: () => ipcRenderer.invoke('load-pdf'),
  savePDFProgress: (data) => ipcRenderer.invoke('save-pdf-progress', data),
  exportPDFWithImages: (data) => ipcRenderer.invoke('export-pdf-with-images', data),
  loadPDFSave: () => ipcRenderer.invoke('load-pdf-save')
});

contextBridge.exposeInMainWorld('settingsAPI', {
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  closeWindow: () => ipcRenderer.invoke('close-settings-window')
});

// Projects API
contextBridge.exposeInMainWorld('api', {
  // Project management
  getProjects: () => ipcRenderer.invoke('get-projects'),
  createProject: (pdfPath) => ipcRenderer.invoke('create-project', pdfPath),
  deleteProject: (projectId) => ipcRenderer.invoke('delete-project', projectId),
  renameProject: (projectId, newName) => ipcRenderer.invoke('rename-project', { projectId, newName }),
  getProjectDetails: (projectId) => ipcRenderer.invoke('get-project-details', projectId),
  updateProjectStatus: (projectId, status) => ipcRenderer.invoke('update-project-status', { projectId, status }),

  // Navigation
  openSettings: () => ipcRenderer.send('open-settings'),
  openExtraction: (projectId) => ipcRenderer.send('open-extraction', projectId),
  openEditor: (projectId) => ipcRenderer.send('open-editor', projectId),
  navigateToProjects: () => ipcRenderer.send('navigate-to-projects'),

  // Legacy APIs for extraction and editor
  loadPDF: () => ipcRenderer.invoke('load-pdf'),
  savePDFProgress: (data) => ipcRenderer.invoke('save-pdf-progress', data),
  exportPDFWithImages: (data) => ipcRenderer.invoke('export-pdf-with-images', data),
  loadPDFSave: () => ipcRenderer.invoke('load-pdf-save'),
  transcribeImage: (data) => ipcRenderer.invoke('transcribe-image', data),
  loadJSON: () => ipcRenderer.invoke('load-json'),
  onJSONLoaded: (callback) => ipcRenderer.on('json-loaded', (event, data) => callback(data)),
  saveJSON: (data) => ipcRenderer.invoke('save-json-file', data),
  onSaveRequested: (callback) => ipcRenderer.on('save-json', () => callback()),
  loadSettings: () => ipcRenderer.invoke('load-settings'),

  // Event listeners for project loading
  onLoadProject: (callback) => ipcRenderer.on('load-project', (event, projectId) => callback(projectId)),
  onLoadProjectEditor: (callback) => ipcRenderer.on('load-project-editor', (event, projectId) => callback(projectId)),

  // Load project save
  loadProjectSave: (projectId) => ipcRenderer.invoke('load-project-save', projectId),
  loadProjectExport: (projectId) => ipcRenderer.invoke('load-project-export', projectId),

  // Menu event listeners
  onTriggerNewProject: (callback) => ipcRenderer.on('trigger-new-project', () => callback()),
  onTriggerImportProject: (callback) => ipcRenderer.on('trigger-import-project', () => callback()),
  onRefreshProjects: (callback) => ipcRenderer.on('refresh-projects', () => callback()),

  // Export functionality
  selectExportDestination: (extension, defaultName) => ipcRenderer.invoke('select-export-destination', { extension, defaultName }),
  exportArticles: (data) => ipcRenderer.invoke('export-articles', data),
  exportProjectZip: (projectId, destinationPath) => ipcRenderer.invoke('export-project-zip', { projectId, destinationPath }),

  // Import functionality
  importProject: () => ipcRenderer.invoke('import-project')
});
