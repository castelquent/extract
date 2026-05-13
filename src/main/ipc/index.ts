import { setupSettingsHandlers } from './settings'
import { setupTemplateHandlers } from './templates'
import { setupV2Handlers } from './v2'

export function setupIpcHandlers(): void {
  setupSettingsHandlers()
  setupTemplateHandlers()
  setupV2Handlers()
}
