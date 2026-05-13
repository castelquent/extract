import { setupV2ProjectHandlers } from './projects'
import { setupV2SourceHandlers } from './sources'
import { setupV2DossierHandlers } from './dossiers'
import { setupV2ArticleHandlers } from './articles'
import { setupV2TranscriptionHandlers } from './transcription'
import { setupV2ExportHandlers } from './export'

// Register all v2 IPC handlers. File watchers (chokidar) are registered
// separately in step 10.
export function setupV2Handlers(): void {
  setupV2ProjectHandlers()
  setupV2SourceHandlers()
  setupV2DossierHandlers()
  setupV2ArticleHandlers()
  setupV2TranscriptionHandlers()
  setupV2ExportHandlers()
}
