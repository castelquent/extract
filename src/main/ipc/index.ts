import { setupProjectHandlers } from './projects'
import { setupExtractionHandlers } from './extraction'
import { setupTranscriptionHandlers } from './transcription'
import { setupExportHandlers } from './export'
import { setupSettingsHandlers } from './settings'

export function setupIpcHandlers(): void {
  setupProjectHandlers()
  setupExtractionHandlers()
  setupTranscriptionHandlers()
  setupExportHandlers()
  setupSettingsHandlers()
}
