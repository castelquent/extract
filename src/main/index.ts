import * as Sentry from '@sentry/electron/main'
import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { autoUpdater } from 'electron-updater'
import { setupIpcHandlers } from './ipc'
import { setupFsWatchers, teardownFsWatchers } from './watchers'
import { buildIndex, idx } from './ipc/v2/_index'
import { getArticleAssetPath } from './ipc/_fs'

// Register the `extract-asset://` scheme as privileged BEFORE app.ready so
// it behaves like http (URL parsing, fetch API, secure context). The actual
// handler is wired below inside app.whenReady. This lets content.md store
// portable references like `extract-asset://{articleId}/{filename}` that
// resolve to the article's assets/ folder on disk regardless of where the
// project lives or whether the article has been moved.
protocol.registerSchemesAsPrivileged([
  { scheme: 'extract-asset', privileges: { standard: true, supportFetchAPI: true, secure: true, stream: true } },
])

// Read the telemetry consent flag synchronously from disk before initialising
// Sentry. The settings file is the single source of truth; the renderer's
// onboarding step writes it and we re-read it on every cold start. We never
// init Sentry until the user has explicitly opted in (RGPD: no telemetry
// without informed, specific consent).
function isTelemetryEnabled(): boolean {
  try {
    const path = join(app.getPath('userData'), 'settings.json')
    if (!existsSync(path)) return false
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    return parsed?.app?.telemetryEnabled === true
  } catch {
    return false
  }
}

if (app.isPackaged && isTelemetryEnabled()) {
  Sentry.init({
    dsn: 'https://69d2a7cc6f89691253af58fda7410ae1@o4511299765796864.ingest.de.sentry.io/4511390055071824',
    // Tag every event with the running app version. Critical for triaging
    // bugs: "this stack only happens on 2.0.7" is the first question you
    // ask in front of a Sentry issue.
    release: `extract@${app.getVersion()}`,
    // No PII (user paths, IPs). Researcher targets are GDPR/Loi 25 sensitive.
    sendDefaultPii: false,
  })
}

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
  // Seed the in-memory index of projects/sources/dossiers/articles BEFORE
  // the window asks for any data. The walk is sync and cheap (~5ms per
  // project on a typical corpus). Watcher updates the cache incrementally
  // afterwards.
  buildIndex()

  // Wire the `extract-asset://` handler. URL shape:
  //   extract-asset://{articleId}/{filename}
  // We look up the article in the in-memory index to find its on-disk
  // location (project + dossier), then serve the requested file from its
  // assets/ folder. Returning a 404 Response on miss keeps Milkdown's
  // <img> tags from throwing.
  protocol.handle('extract-asset', async (request) => {
    try {
      // URL shape: extract-asset://a/{articleId}/{filename}
      // "a" is a bidon hostname; URLs lowercase hostnames by RFC 3986 so
      // case-sensitive ULIDs must live in the path. We split off the
      // leading "/" then take everything before the last "/" as the
      // articleId (allows future nesting if we ever need it).
      const url = new URL(request.url)
      const segments = url.pathname.replace(/^\//, '').split('/').map((s) => decodeURIComponent(s))
      const articleId = segments[0] ?? ''
      const filename = segments.slice(1).join('/')
      console.log(`[extract-asset] request: articleId=${articleId} filename=${filename}`)
      if (!articleId || !filename) {
        return new Response('Bad asset URL', { status: 400 })
      }
      const entry = idx.getArticle(articleId)
      if (!entry) {
        console.warn(`[extract-asset] 404: article ${articleId} not in index`)
        return new Response(`Article ${articleId} not found`, { status: 404 })
      }
      const filePath = getArticleAssetPath(entry.projectId, entry.meta.dossierId, articleId, filename)
      if (!existsSync(filePath)) {
        console.warn(`[extract-asset] 404: file does not exist at ${filePath}`)
        return new Response(`Asset ${filename} not found`, { status: 404 })
      }
      return net.fetch(pathToFileURL(filePath).toString())
    } catch (err) {
      console.error('[extract-asset] handler error:', err)
      return new Response('Asset handler error', { status: 500 })
    }
  })

  createWindow()

  // Watch the projects/ tree for changes so the renderer can refresh
  // its caches without polling.
  setupFsWatchers(() => mainWindow)

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

app.on('before-quit', () => {
  teardownFsWatchers().catch(() => undefined)
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
