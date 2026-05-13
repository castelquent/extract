import { setupV2ProjectHandlers } from './projects'
import { setupV2SourceHandlers } from './sources'
import { setupV2DossierHandlers } from './dossiers'
import { setupV2ArticleHandlers } from './articles'
import { setupV2TranscriptionHandlers } from './transcription'
import { setupV2ExportHandlers } from './export'
import { setupV2ZipHandlers } from './zip'

// Register all v2 IPC handlers. File watchers (chokidar) are registered
// separately in setupFsWatchers (src/main/watchers.ts).
export function setupV2Handlers(): void {
  setupV2ProjectHandlers()
  setupV2SourceHandlers()
  setupV2DossierHandlers()
  setupV2ArticleHandlers()
  setupV2TranscriptionHandlers()
  setupV2ExportHandlers()
  setupV2ZipHandlers()
}
