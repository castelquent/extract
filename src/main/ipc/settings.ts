import { ipcMain, app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { autoUpdater } from 'electron-updater'
import type { Settings } from '@shared/types'

const getSettingsPath = (): string => {
  return join(app.getPath('userData'), 'settings.json')
}

const defaultSettings: Settings = {
  ai: {
    provider: 'openai',
    apiKey: '',
    model: 'gpt-4o',
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
      if (existsSync(settingsPath)) {
        const saved = JSON.parse(readFileSync(settingsPath, 'utf-8'))
        return { ...defaultSettings, ...saved }
      }
      return defaultSettings
    } catch (error) {
      console.error('Error loading settings:', error)
      return defaultSettings
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
}
