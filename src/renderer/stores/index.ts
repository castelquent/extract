export { useUIStore } from './uiStore'
export {
  useExtractionStore,
  selectCurrentArticle,
  selectCurrentZones,
  selectTotalZonesCount,
  selectHasUnsavedChanges,
} from './extractionStore'
export { useSettingsStore, selectAISettings, selectAppSettings, selectHasAnyApiKey } from './settingsStore'
export { useTemplatesStore } from './templatesStore'

// v2 stores (Project > Dossier > Article, filesystem-as-truth)
export {
  useProjectsStoreV2,
  selectProjectsToExtract,
  selectProjectsToTranscribe,
  selectProjectsDone,
} from './projectsStoreV2'
export {
  useProjectStore,
  selectArticlesInDossier,
  selectArticlesBySource,
  selectArticlesByStatus,
  selectOrphanArticles,
} from './projectStore'
export {
  useEditorStore,
  selectCurrentArticle as selectV2CurrentArticle,
  selectCurrentFields as selectV2CurrentFields,
  selectHasUnsavedChanges as selectV2HasUnsavedChanges,
  selectArticleHasDraft,
} from './editorStore'
