import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { setupIpcHandlers } from './ipc'

let mainWindow: BrowserWindow | null = null
let forceQuit = false

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// Configure auto-updater
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    title: 'ExtrAct',
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#202123',
    show: false,
  })

  // Show window maximized when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize()
    mainWindow?.show()
  })

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(join(__dirname, '../../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Intercepter la fermeture pour vérifier les changements non sauvegardés
  mainWindow.on('close', (e) => {
    if (forceQuit) {
      return // Laisser fermer
    }

    e.preventDefault()
    // Demander au renderer s'il y a des changements non sauvegardés
    mainWindow?.webContents.send('check-unsaved-changes')
  })
}

// Setup all IPC handlers
setupIpcHandlers()

// Handler pour fermer la fenêtre (appelé par le renderer après confirmation)
ipcMain.on('confirm-close', () => {
  forceQuit = true
  mainWindow?.close()
})

// Handler pour annuler la fermeture
ipcMain.on('cancel-close', () => {
  // Ne rien faire, la fenêtre reste ouverte
})

app.whenReady().then(() => {
  createWindow()

  // Vérifier les mises à jour au démarrage (seulement en production)
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates()
    }, 3000) // Attendre 3s que l'app soit chargée
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Auto-updater events
autoUpdater.on('update-available', (info) => {
  mainWindow?.webContents.send('update-available', info.version)
})

autoUpdater.on('download-progress', (progress) => {
  mainWindow?.webContents.send('update-progress', progress.percent)
})

autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('update-downloaded')
})

autoUpdater.on('error', (error) => {
  mainWindow?.webContents.send('update-error', error.message)
})

// Handler pour démarrer le téléchargement
ipcMain.handle('start-update-download', async () => {
  await autoUpdater.downloadUpdate()
})

// Handler pour installer la mise à jour
ipcMain.on('install-update', () => {
  forceQuit = true
  autoUpdater.quitAndInstall()
})

// Open an external URL in the user's default browser
ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  if (!/^https?:\/\//i.test(url)) return
  await shell.openExternal(url)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

export { mainWindow }
