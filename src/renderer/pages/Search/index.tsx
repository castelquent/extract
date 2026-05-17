import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Download, FileText, Loader2, Search as SearchIcon, X } from 'lucide-react'
import type {
  ArticleMetadata,
  DossierView,
  MultiExportItem,
  ProjectView,
} from '@shared/types'
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
} from '@/components/ui'
import { useProjectsStoreV2, useSearchStore, useTemplatesStore } from '@/stores'
import { asString, stripHtml } from '@shared/fieldValue'
import { sameSchema } from '@/lib/templateMerge'
import { SearchResult } from './SearchResult'
import { ExportModal, ExportFormat, ExportModalChoices, buildExportOptions } from '../Editor/ExportModal'

// Per-field, precomputed text used by the live filter. We fold + strip
// once at index-build time so each keystroke only runs `indexOf` on already-
// prepared strings (the heavy lifting was stripHtml + fold inside the
// keystroke loop on 547 articles × N fields — ~1-2s of work every keypress).
interface IndexedField {
  fieldName: string
  plain: string   // HTML-stripped, for snippet display
  folded: string  // length-preserving fold, for indexOf
}

interface IndexedArticle {
  project: ProjectView
  article: ArticleMetadata
  searchable: IndexedField[]
}

interface IndexedDossier {
  project: ProjectView
  dossier: DossierView
  // Precomputed fold of the dossier name (same rationale).
  folded: string
}

interface SearchIndex {
  articles: IndexedArticle[]
  dossiers: IndexedDossier[]
}

// One discrete occurrence inside a field's text. Snippet is the local
// context window; matchStart/matchLength locate the highlighted run within
// the snippet (not within the full field).
export interface FieldMatch {
  snippet: string
  matchStart: number
  matchLength: number
}

// Article-field hit groups every occurrence in a single field of a single
// article. The card shows the first match by default and lets the user
// expand to see the rest. Dossier hits are emitted when the user's query
// matches the dossier's own name — these jump the user to the editor
// scoped to that dossier.
export type MatchHit =
  | {
      kind: 'article'
      project: ProjectView
      article: ArticleMetadata
      // Resolved at hit-building time from the project's dossier list.
      // Undefined when the article is orphan (article.dossierId === null).
      dossierName?: string
      fieldName: string
      matches: FieldMatch[]
    }
  | {
      kind: 'dossier'
      project: ProjectView
      dossier: DossierView
      match: FieldMatch
    }

// Fold a string for comparison: lowercased + NFD-decomposed + combining
// marks stripped. "Économie" → "economie", "café" → "cafe". The fold has
// the SAME length as the original (we drop only zero-width combining
// marks), so indices computed against the folded string still point at
// the right characters in the original.
const fold = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const buildSnippet = (
  text: string,
  matchIndex: number,
  matchLength: number,
  ctx = 50
): { snippet: string; start: number } => {
  const start = Math.max(0, matchIndex - ctx)
  const end = Math.min(text.length, matchIndex + matchLength + ctx)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  const snippet = prefix + text.slice(start, end) + suffix
  const adjusted = (start > 0 ? prefix.length : 0) + (matchIndex - start)
  return { snippet, start: adjusted }
}

// Multi-select dropdown used for each filter facet. Stays open on item
// click (onSelect.preventDefault) so the user can tick several values at
// once. Renders nothing when there are no options (e.g. a fresh app with
// no templates yet) to avoid a dead trigger.
const FilterDropdown = ({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: { id: string; label: string }[]
  selected: Set<string>
  onChange: (s: Set<string>) => void
}) => {
  if (options.length === 0) return null
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          {label}
          {selected.size > 0 && (
            <Badge variant="secondary" className="ml-2 px-1.5 py-0 tabular-nums">
              {selected.size}
            </Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-[400px] overflow-y-auto w-[260px]">
        <DropdownMenuLabel className="text-xs">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((opt) => (
          <DropdownMenuCheckboxItem
            key={opt.id}
            checked={selected.has(opt.id)}
            onCheckedChange={() => toggle(opt.id)}
            onSelect={(e) => e.preventDefault()}
          >
            {opt.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function SearchPage() {
  const { t } = useTranslation('search')
  const navigate = useNavigate()
  const projects = useProjectsStoreV2((s) => s.projects)
  const loadProjects = useProjectsStoreV2((s) => s.loadProjects)

  // Query lives in the URL so the browser back button / editor return
  // restores the typed search. We also mirror it to a persisted
  // searchStore so navigating "Recherche" from the sidebar (which can't
  // pass query params) brings the last query back too.
  //
  // The filter runs only on submit (Enter / button), not on each keystroke —
  // searching across 547 articles per keypress is pointless work, and the
  // user expects a "press search" affordance anyway. `inputValue` mirrors
  // what's in the input; `query` (URL) only updates on submit.
  const [searchParams, setSearchParams] = useSearchParams()
  const lastQuery = useSearchStore((s) => s.lastQuery)
  const setLastQuery = useSearchStore((s) => s.setLastQuery)
  const query = searchParams.get('q') ?? ''
  const [inputValue, setInputValue] = useState(query || lastQuery)
  const submitQuery = (q: string) => {
    const next = new URLSearchParams(searchParams)
    if (q) next.set('q', q)
    else next.delete('q')
    setSearchParams(next, { replace: true })
    setLastQuery(q)
  }

  // On mount: if the URL has no ?q= but the store remembers one, hydrate
  // the URL from the store so we land on the last results. The input is
  // already pre-filled (initial useState above).
  useEffect(() => {
    if (!searchParams.get('q') && lastQuery) {
      const next = new URLSearchParams(searchParams)
      next.set('q', lastQuery)
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [index, setIndex] = useState<SearchIndex | null>(null)
  const [indexing, setIndexing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Multi-select filters. Empty Set = "no filter on this dimension" (all
  // values pass). For templates the special id 'none' represents articles
  // whose schema doesn't match any known template.
  const [projectFilter, setProjectFilter] = useState<Set<string>>(new Set())
  const [dossierFilter, setDossierFilter] = useState<Set<string>>(new Set())
  const [fieldFilter, setFieldFilter] = useState<Set<string>>(new Set())
  const [templateFilter, setTemplateFilter] = useState<Set<string>>(new Set())
  const clearFilters = () => {
    setProjectFilter(new Set())
    setDossierFilter(new Set())
    setFieldFilter(new Set())
    setTemplateFilter(new Set())
  }
  const hasAnyFilter =
    projectFilter.size > 0 ||
    dossierFilter.size > 0 ||
    fieldFilter.size > 0 ||
    templateFilter.size > 0

  // When the project filter changes, the previously-selected dossiers may no
  // longer belong to any selected project. Drop the stale ones (or clear the
  // whole set when no project is selected, since the dossier filter is then
  // hidden anyway).
  useEffect(() => {
    if (projectFilter.size === 0) {
      setDossierFilter((prev) => (prev.size === 0 ? prev : new Set()))
      return
    }
    if (!index) return
    const validDossierIds = new Set<string>()
    for (const { project, dossier } of index.dossiers) {
      if (projectFilter.has(project.id)) validDossierIds.add(dossier.id)
    }
    setDossierFilter((prev) => {
      const next = new Set<string>()
      for (const id of prev) if (validDossierIds.has(id)) next.add(id)
      return next.size === prev.size ? prev : next
    })
  }, [projectFilter, index])

  const templates = useTemplatesStore((s) => s.templates)
  const loadTemplates = useTemplatesStore((s) => s.loadTemplates)
  useEffect(() => {
    if (templates.length === 0) loadTemplates()
  }, [templates.length, loadTemplates])

  // Per-article template id, computed once per (index, templates) change.
  // Articles whose schema doesn't match any template get the sentinel 'none'.
  const articleTemplateIds = useMemo(() => {
    const map = new Map<string, string>()
    if (!index) return map
    for (const { article } of index.articles) {
      const tpl = templates.find((t) => sameSchema(t.fields, article.schema))
      map.set(article.id, tpl?.id ?? 'none')
    }
    return map
  }, [index, templates])

  // Available filter option sets, derived from the current index.
  // Dossiers are restricted to the currently selected projects — without a
  // project filter the list is overwhelming (every dossier across every
  // project), and choosing a dossier from a non-selected project would never
  // match anyway.
  const filterOptions = useMemo(() => {
    const projectOpts = new Map<string, string>()
    const dossierOpts = new Map<string, string>()
    const fieldOpts = new Set<string>()
    const templateOpts = new Map<string, string>()
    if (index) {
      for (const { project } of index.articles) projectOpts.set(project.id, project.name)
      for (const { project, dossier } of index.dossiers) {
        projectOpts.set(project.id, project.name)
        if (projectFilter.size === 0 || projectFilter.has(project.id)) {
          dossierOpts.set(dossier.id, dossier.name)
        }
      }
      for (const { article } of index.articles) {
        for (const f of article.schema ?? []) fieldOpts.add(f.name)
      }
      for (const tplId of articleTemplateIds.values()) {
        if (tplId === 'none') {
          templateOpts.set('none', t('filters.noTemplate'))
        } else {
          const tpl = templates.find((x) => x.id === tplId)
          if (tpl) templateOpts.set(tpl.id, tpl.name)
        }
      }
    }
    return {
      projects: Array.from(projectOpts, ([id, label]) => ({ id, label })).sort((a, b) =>
        a.label.localeCompare(b.label)
      ),
      dossiers: Array.from(dossierOpts, ([id, label]) => ({ id, label })).sort((a, b) =>
        a.label.localeCompare(b.label)
      ),
      fields: Array.from(fieldOpts).sort((a, b) => a.localeCompare(b)),
      templates: Array.from(templateOpts, ([id, label]) => ({ id, label })).sort((a, b) =>
        a.label.localeCompare(b.label)
      ),
    }
  }, [index, articleTemplateIds, templates, projectFilter])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  // Build the in-memory index. Pulls articles AND dossiers per project so
  // we can match dossier names too (typing "Mars 1920" surfaces a dossier
  // result, not just articles). Skips projects with no content.
  useEffect(() => {
    let cancelled = false
    const build = async () => {
      if (projects.length === 0) {
        setIndex({ articles: [], dossiers: [] })
        return
      }
      setIndexing(true)
      const articleResults = await Promise.all(
        projects
          .filter((p) => p.articlesTotal > 0)
          .map(async (project) => {
            try {
              const articles = await window.api.v2_articlesList(project.id)
              return articles.map<IndexedArticle>((article) => {
                // Precompute (plain, folded) per field once. The filter loop
                // below only does indexOf on these, no per-keystroke
                // stripHtml/fold work.
                const searchable: IndexedField[] = []
                for (const [fieldName, raw] of Object.entries(article.fields ?? {})) {
                  const plain = stripHtml(asString(raw))
                  if (!plain) continue
                  searchable.push({ fieldName, plain, folded: fold(plain) })
                }
                return { project, article, searchable }
              })
            } catch {
              return [] as IndexedArticle[]
            }
          })
      )
      const dossierResults = await Promise.all(
        projects.map(async (project) => {
          try {
            const dossiers = await window.api.v2_dossiersList(project.id)
            return dossiers.map<IndexedDossier>((dossier) => ({
              project,
              dossier,
              folded: fold(dossier.name),
            }))
          } catch {
            return [] as IndexedDossier[]
          }
        })
      )
      if (cancelled) return
      setIndex({
        articles: articleResults.flat(),
        dossiers: dossierResults.flat(),
      })
      setIndexing(false)
    }
    build()
    return () => {
      cancelled = true
    }
  }, [projects])

  const hits: MatchHit[] = useMemo(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2 || !index) return []
    // Fold the needle once. We fold each field's text inside the loop and
    // compare folded↔folded so accents and case don't matter ("economie"
    // matches "économie"). Fold is length-preserving for French
    // diacritics, so indices found in the folded text point at the right
    // characters in the original.
    const needleFolded = fold(trimmed)
    // dossierId → name lookup for the article-hit dossier label.
    const dossierNameById = new Map<string, string>()
    for (const { dossier } of index.dossiers) dossierNameById.set(dossier.id, dossier.name)

    // Per-project dossier rank, used to keep articles of the same dossier
    // adjacent in the results (no section header, just better ordering).
    // Orphans (dossierId === null) land last in each project via Infinity.
    const dossierRankByProject = new Map<string, Map<string, number>>()
    for (const { project, dossier } of index.dossiers) {
      let m = dossierRankByProject.get(project.id)
      if (!m) {
        m = new Map()
        dossierRankByProject.set(project.id, m)
      }
      m.set(dossier.id, m.size)
    }
    const dossierRank = (projectId: string, dossierId: string | null): number => {
      if (dossierId === null) return Number.POSITIVE_INFINITY
      return dossierRankByProject.get(projectId)?.get(dossierId) ?? Number.POSITIVE_INFINITY
    }

    const collected: MatchHit[] = []

    // Dossier-name matches first — they tend to be high-signal anchors
    // (numéro de revue, date, thème), and putting them at the top of the
    // results list helps the user navigate directly. Dossier hits respect
    // the project filter; field / template filters don't apply (a dossier
    // isn't an article with fields).
    for (const entry of index.dossiers) {
      if (projectFilter.size > 0 && !projectFilter.has(entry.project.id)) continue
      if (dossierFilter.size > 0 && !dossierFilter.has(entry.dossier.id)) continue
      if (fieldFilter.size > 0 || templateFilter.size > 0) continue
      const idx = entry.folded.indexOf(needleFolded)
      if (idx === -1) continue
      const { snippet, start } = buildSnippet(entry.dossier.name, idx, trimmed.length, 80)
      collected.push({
        kind: 'dossier',
        project: entry.project,
        dossier: entry.dossier,
        match: { snippet, matchStart: start, matchLength: trimmed.length },
      })
    }

    // Articles re-sorted within each project so same-dossier hits cluster.
    // JS Array.sort is stable → cross-project order from index.articles is
    // preserved when the comparator returns 0.
    const articlesSorted = [...index.articles].sort((a, b) => {
      if (a.project.id !== b.project.id) return 0
      const dA = dossierRank(a.project.id, a.article.dossierId)
      const dB = dossierRank(b.project.id, b.article.dossierId)
      if (dA !== dB) return dA - dB
      const oA = typeof a.article.order === 'number' ? a.article.order : Number.POSITIVE_INFINITY
      const oB = typeof b.article.order === 'number' ? b.article.order : Number.POSITIVE_INFINITY
      if (oA !== oB) return oA - oB
      return new Date(a.article.createdAt).getTime() - new Date(b.article.createdAt).getTime()
    })

    for (const entry of articlesSorted) {
      const { article, project, searchable } = entry
      if (projectFilter.size > 0 && !projectFilter.has(project.id)) continue
      if (dossierFilter.size > 0 && (!article.dossierId || !dossierFilter.has(article.dossierId))) continue
      if (templateFilter.size > 0) {
        const tplId = articleTemplateIds.get(article.id) ?? 'none'
        if (!templateFilter.has(tplId)) continue
      }
      for (const field of searchable) {
        if (fieldFilter.size > 0 && !fieldFilter.has(field.fieldName)) continue
        const matches: FieldMatch[] = []
        let cursor = 0
        while (cursor < field.folded.length) {
          const idx = field.folded.indexOf(needleFolded, cursor)
          if (idx === -1) break
          const { snippet, start } = buildSnippet(field.plain, idx, trimmed.length)
          matches.push({ snippet, matchStart: start, matchLength: trimmed.length })
          cursor = idx + needleFolded.length
        }
        if (matches.length === 0) continue
        const dossierName = entry.article.dossierId
          ? dossierNameById.get(entry.article.dossierId)
          : undefined
        collected.push({
          kind: 'article',
          project: entry.project,
          article: entry.article,
          dossierName,
          fieldName: field.fieldName,
          matches,
        })
      }
    }
    return collected
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, index, projectFilter, dossierFilter, fieldFilter, templateFilter, articleTemplateIds])

  const groupedHits = useMemo(() => {
    const map = new Map<string, { project: ProjectView; hits: MatchHit[] }>()
    for (const hit of hits) {
      const existing = map.get(hit.project.id)
      if (existing) existing.hits.push(hit)
      else map.set(hit.project.id, { project: hit.project, hits: [hit] })
    }
    return Array.from(map.values())
  }, [hits])

  const handleOpenResult = (hit: MatchHit) => {
    const searchUrl = `/search?q=${encodeURIComponent(query)}`
    const dest =
      hit.kind === 'article'
        ? `/editor/${hit.project.id}?article=${hit.article.id}`
        : `/editor/${hit.project.id}?dossier=${hit.dossier.id}`
    navigate(dest, { state: { from: searchUrl, fromLabel: t('backLabel') } })
  }

  const [exportOpen, setExportOpen] = useState(false)

  // De-duplicate article hits by (projectId, articleId) — a single article
  // matching across 3 fields appears 3 times in `hits`. Export wants each
  // article once. Dossier hits aren't exportable on their own (no fields
  // to render), so they're filtered out.
  const exportItems = useMemo<MultiExportItem[]>(() => {
    const seen = new Set<string>()
    const items: MultiExportItem[] = []
    for (const h of hits) {
      if (h.kind !== 'article') continue
      const key = `${h.project.id}|${h.article.id}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push({ projectId: h.project.id, articleId: h.article.id })
    }
    return items
  }, [hits])

  const handleExportResults = async (format: ExportFormat, choices: ExportModalChoices) => {
    if (exportItems.length === 0) return
    const highlight = query.trim().length >= 2 ? query.trim() : undefined
    const options = buildExportOptions(format, choices, { highlight })
    switch (format) {
      case 'pdf':
        await window.api.v2_exportMultiArticlesPdf(exportItems, options)
        break
      case 'docx':
        await window.api.v2_exportMultiArticlesDocx(exportItems, options)
        break
      case 'txt':
        await window.api.v2_exportMultiArticlesTxt(exportItems, options)
        break
      case 'png':
        await window.api.v2_exportMultiArticlesPng(exportItems, options)
        break
    }
  }

  const totalArticles = index?.articles.length ?? 0
  const showResults = query.trim().length >= 2

  return (
    <div className="min-h-screen p-8 flex flex-col">
      <header className="flex items-center gap-3 mb-6">
        <SearchIcon className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">
            {t('subtitle')}
          </p>
        </div>
      </header>

      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitQuery(inputValue.trim())
              else if (e.key === 'Escape') {
                setInputValue('')
                submitQuery('')
              }
            }}
            placeholder={t('inputPlaceholder')}
            className="pl-10 h-11 text-base"
          />
        </div>
        <Button
          onClick={() => submitQuery(inputValue.trim())}
          disabled={inputValue.trim().length < 2 || inputValue.trim() === query}
          className="h-11 px-5"
        >
          {t('submit')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <FilterDropdown
          label={t('filters.projects')}
          options={filterOptions.projects}
          selected={projectFilter}
          onChange={setProjectFilter}
        />
        {projectFilter.size > 0 && (
          <FilterDropdown
            label={t('filters.dossiers')}
            options={filterOptions.dossiers}
            selected={dossierFilter}
            onChange={setDossierFilter}
          />
        )}
        <FilterDropdown
          label={t('filters.templates')}
          options={filterOptions.templates}
          selected={templateFilter}
          onChange={setTemplateFilter}
        />
        <FilterDropdown
          label={t('filters.fields')}
          options={filterOptions.fields.map((f) => ({ id: f, label: f }))}
          selected={fieldFilter}
          onChange={setFieldFilter}
        />
        {hasAnyFilter && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={clearFilters}>
            <X className="h-3.5 w-3.5 mr-1" />
            {t('filters.clear')}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 min-h-[1.5rem]">
        {indexing ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>{t('status.indexing')}</span>
          </>
        ) : showResults ? (
          <>
            <Badge variant="secondary">{hits.length}</Badge>
            <span>
              {t('status.results', { count: hits.length, projectCount: groupedHits.length })}
            </span>
          </>
        ) : index ? (
          <span>{t('status.indexed', { count: totalArticles })}</span>
        ) : null}
        <span className="flex-1" />
        {showResults && exportItems.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
            <Download className="h-4 w-4 mr-1" />
            {t('exportResults')}
          </Button>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {!showResults ? (
          <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mb-3 opacity-50" />
            <p>{t('empty')}</p>
          </div>
        ) : hits.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground">
            <SearchIcon className="h-12 w-12 mb-3 opacity-50" />
            <p>{t('noResults', { query })}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedHits.map(({ project, hits: projectHits }) => (
              <div key={project.id}>
                <div className="flex items-center gap-2 mb-2 py-1">
                  <h2 className="font-semibold">{project.name}</h2>
                  <Badge variant="outline">
                    {t('perProject', { count: projectHits.length })}
                  </Badge>
                </div>
                <div className="space-y-2">
                  {projectHits.map((hit, idx) => {
                    const key =
                      hit.kind === 'article'
                        ? `${hit.project.id}-a-${hit.article.id}-${hit.fieldName}-${idx}`
                        : `${hit.project.id}-d-${hit.dossier.id}-${idx}`
                    return (
                      <SearchResult
                        key={key}
                        hit={hit}
                        onClick={() => handleOpenResult(hit)}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onExport={handleExportResults}
        articleCount={exportItems.length}
        highlightTerm={query.trim().length >= 2 ? query.trim() : undefined}
      />
    </div>
  )
}
