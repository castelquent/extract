import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { autoUpdater } from 'electron-updater'
import type { Settings, TranscriptionLog, AppLanguage } from '@shared/types'

const getSettingsPath = (): string => {
  return join(app.getPath('userData'), 'settings.json')
}

// Detect the OS UI locale and map to one of our supported app languages.
// French locales → 'fr', everything else → 'en'. Used as a one-shot default
// on first launch (and whenever a saved settings.json lacks a language field).
const detectAppLanguage = (): AppLanguage => {
  try {
    const loc = app.getLocale().toLowerCase()
    if (loc.startsWith('fr')) return 'fr'
    return 'en'
  } catch {
    return 'fr'
  }
}

const defaultSettings: Settings = {
  ai: {
    provider: 'anthropic',
    apiKey: '',
    model: 'claude-sonnet-4-6',
    prompt: `Tu es un assistant spécialisé dans l'extraction d'articles.
Analyse l'image de l'article et retourne un JSON avec les champs suivants:
- title: le titre de l'article
- author: l'auteur de l'article (si disponible)
- content: le contenu complet de l'article

Réponds uniquement avec le JSON, sans texte additionnel.`
  },
  app: {
    checkUpdatesOnStart: true,
    theme: 'dark'
  }
}

export function setupSettingsHandlers(): void {
  // Get settings
  ipcMain.handle('settings:get', async (): Promise<Settings> => {
    const settingsPath = getSettingsPath()

    try {
      const base: Settings = existsSync(settingsPath)
        ? { ...defaultSettings, ...JSON.parse(readFileSync(settingsPath, 'utf-8')) }
        : defaultSettings
      // Backfill the language field for installs predating i18n. We only
      // detect from the OS locale when nothing is persisted — once the user
      // explicitly picks a language we respect it.
      if (!base.app.language) {
        base.app = { ...base.app, language: detectAppLanguage() }
      }
      return base
    } catch (error) {
      console.error('Error loading settings:', error)
      return { ...defaultSettings, app: { ...defaultSettings.app, language: detectAppLanguage() } }
    }
  })

  // Save settings
  ipcMain.handle('settings:save', async (_, settings: Settings): Promise<boolean> => {
    const settingsPath = getSettingsPath()

    try {
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2))
      return true
    } catch (error) {
      console.error('Error saving settings:', error)
      return false
    }
  })

  // Get app version
  ipcMain.handle('settings:getVersion', async (): Promise<string> => {
    return app.getVersion()
  })

  // Check for updates
  ipcMain.handle('settings:checkUpdates', async (): Promise<{ available: boolean; version?: string }> => {
    try {
      const result = await autoUpdater.checkForUpdates()
      if (result && result.updateInfo) {
        return {
          available: result.updateInfo.version !== app.getVersion(),
          version: result.updateInfo.version
        }
      }
      return { available: false }
    } catch (error) {
      console.error('Update check error:', error)
      return { available: false }
    }
  })

  // Download update
  ipcMain.handle('settings:downloadUpdate', async (): Promise<boolean> => {
    try {
      await autoUpdater.downloadUpdate()
      return true
    } catch (error) {
      console.error('Update download error:', error)
      return false
    }
  })

  // Install update
  ipcMain.handle('settings:installUpdate', async (): Promise<void> => {
    autoUpdater.quitAndInstall()
  })

  // Get transcription logs
  ipcMain.handle('settings:getLogs', async (): Promise<TranscriptionLog[]> => {
    const logsPath = join(app.getPath('userData'), 'logs.json')

    try {
      if (existsSync(logsPath)) {
        return JSON.parse(readFileSync(logsPath, 'utf-8'))
      }
      return []
    } catch (error) {
      console.error('Error loading logs:', error)
      return []
    }
  })
}
