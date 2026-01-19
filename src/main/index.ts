import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { setupIpcHandlers } from './ipc'

let mainWindow: BrowserWindow | null = null
let forceQuit = false

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createWindow(): void {
  mainWindow = new BrowserWindow({
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
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

export { mainWindow }
