import { setupProjectHandlers } from './projects'
import { setupExtractionHandlers } from './extraction'
import { setupTranscriptionHandlers } from './transcription'
import { setupExportHandlers } from './export'
import { setupSettingsHandlers } from './settings'
import { setupTemplateHandlers } from './templates'
import { setupV2Handlers } from './v2'

export function setupIpcHandlers(): void {
  setupProjectHandlers()
  setupExtractionHandlers()
  setupTranscriptionHandlers()
  setupExportHandlers()
  setupSettingsHandlers()
  setupTemplateHandlers()
  setupV2Handlers()
}
