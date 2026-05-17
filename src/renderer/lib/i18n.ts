// i18n init. Loaded once at app startup (imported by App.tsx).
//
// Namespacing: one JSON file per UI domain (common, settings, …) under
// `locales/{lng}/`. New domains are added by:
//   1. Creating `locales/fr/{ns}.json` and `locales/en/{ns}.json`
//   2. Adding the import + entry below
//   3. Calling `useTranslation('<ns>')` in the component
//
// Language is loaded from the persisted settings on mount (see App.tsx). The
// init below uses 'fr' as the placeholder until the settings come back.
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import frCommon from '@/locales/fr/common.json'
import frSettings from '@/locales/fr/settings.json'
import frNav from '@/locales/fr/nav.json'
import frProjects from '@/locales/fr/projects.json'
import frProject from '@/locales/fr/project.json'
import frArticles from '@/locales/fr/articles.json'
import frSources from '@/locales/fr/sources.json'
import frExtractor from '@/locales/fr/extractor.json'
import frEditor from '@/locales/fr/editor.json'
import frSearch from '@/locales/fr/search.json'
import frExport from '@/locales/fr/export.json'
import frTemplates from '@/locales/fr/templates.json'
import frHelp from '@/locales/fr/help.json'
import frOnboarding from '@/locales/fr/onboarding.json'
import enCommon from '@/locales/en/common.json'
import enSettings from '@/locales/en/settings.json'
import enNav from '@/locales/en/nav.json'
import enProjects from '@/locales/en/projects.json'
import enProject from '@/locales/en/project.json'
import enArticles from '@/locales/en/articles.json'
import enSources from '@/locales/en/sources.json'
import enExtractor from '@/locales/en/extractor.json'
import enEditor from '@/locales/en/editor.json'
import enSearch from '@/locales/en/search.json'
import enExport from '@/locales/en/export.json'
import enTemplates from '@/locales/en/templates.json'
import enHelp from '@/locales/en/help.json'
import enOnboarding from '@/locales/en/onboarding.json'

export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const isSupportedLanguage = (s: string): s is SupportedLanguage =>
  (SUPPORTED_LANGUAGES as readonly string[]).includes(s)

void i18n.use(initReactI18next).init({
  resources: {
    fr: {
      common: frCommon,
      settings: frSettings,
      nav: frNav,
      projects: frProjects,
      project: frProject,
      articles: frArticles,
      sources: frSources,
      extractor: frExtractor,
      editor: frEditor,
      search: frSearch,
      export: frExport,
      templates: frTemplates,
      help: frHelp,
      onboarding: frOnboarding,
    },
    en: {
      common: enCommon,
      settings: enSettings,
      nav: enNav,
      projects: enProjects,
      project: enProject,
      articles: enArticles,
      sources: enSources,
      extractor: enExtractor,
      editor: enEditor,
      search: enSearch,
      export: enExport,
      templates: enTemplates,
      help: enHelp,
      onboarding: enOnboarding,
    },
  },
  lng: 'fr',
  fallbackLng: 'fr',
  defaultNS: 'common',
  ns: [
    'common', 'settings', 'nav', 'projects', 'project', 'articles', 'sources',
    'extractor', 'editor', 'search', 'export', 'templates', 'help', 'onboarding',
  ],
  interpolation: {
    // React already escapes — disabling i18next's pass avoids double-encoding.
    escapeValue: false,
  },
  // Returning the key on miss helps spot un-translated strings during dev.
  returnNull: false,
})

export default i18n
