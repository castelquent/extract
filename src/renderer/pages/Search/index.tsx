import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Loader2, Search as SearchIcon } from 'lucide-react'
import type { ArticleMetadata, ProjectView } from '@shared/types'
import { Badge, Input, ScrollArea } from '@/components/ui'
import { useProjectsStoreV2 } from '@/stores'
import { SearchResult } from './SearchResult'

interface IndexedArticle {
  project: ProjectView
  article: ArticleMetadata
}

interface MatchHit {
  project: ProjectView
  article: ArticleMetadata
  fieldName: string
  snippet: string
  matchStart: number
  matchLength: number
}

const stripHtml = (html: string): string => {
  if (!html) return ''
  return html
    .replace(/<\/(p|div|li|h[1-6]|br)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

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

export function SearchPage() {
  const navigate = useNavigate()
  const projects = useProjectsStoreV2((s) => s.projects)
  const loadProjects = useProjectsStoreV2((s) => s.loadProjects)

  const [query, setQuery] = useState('')
  const [indexedArticles, setIndexedArticles] = useState<IndexedArticle[] | null>(null)
  const [indexing, setIndexing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  // Build the in-memory index — one v2_articlesList call per project that has
  // any articles. Skips empty projects.
  useEffect(() => {
    let cancelled = false
    const build = async () => {
      if (projects.length === 0) {
        setIndexedArticles([])
        return
      }
      setIndexing(true)
      const searchable = projects.filter((p) => p.articlesTotal > 0)
      const results = await Promise.all(
        searchable.map(async (project) => {
          try {
            const articles = await window.api.v2_articlesList(project.id)
            return articles.map((article) => ({ project, article }))
          } catch {
            return [] as IndexedArticle[]
          }
        })
      )
      if (cancelled) return
      setIndexedArticles(results.flat())
      setIndexing(false)
    }
    build()
    return () => {
      cancelled = true
    }
  }, [projects])

  const hits: MatchHit[] = useMemo(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2 || !indexedArticles) return []
    const needle = trimmed.toLowerCase()
    const collected: MatchHit[] = []

    for (const entry of indexedArticles) {
      const { article } = entry
      if (!article.fields) continue
      for (const [fieldName, raw] of Object.entries(article.fields)) {
        if (!raw) continue
        const text = stripHtml(raw)
        if (!text) continue
        const idx = text.toLowerCase().indexOf(needle)
        if (idx === -1) continue
        const { snippet, start } = buildSnippet(text, idx, trimmed.length)
        collected.push({
          ...entry,
          fieldName,
          snippet,
          matchStart: start,
          matchLength: trimmed.length,
        })
      }
    }
    return collected
  }, [query, indexedArticles])

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
    navigate(`/editor/${hit.project.id}?article=${hit.article.id}`)
  }

  const totalArticles = indexedArticles?.length ?? 0
  const showResults = query.trim().length >= 2

  return (
    <div className="min-h-screen p-8 flex flex-col">
      <header className="flex items-center gap-3 mb-6">
        <SearchIcon className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Recherche</h1>
          <p className="text-muted-foreground text-sm">
            Rechercher dans tous les éléments de tous les projets
          </p>
        </div>
      </header>

      <div className="relative mb-4">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tapez au moins 2 caractères…"
          className="pl-10 h-11 text-base"
        />
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 min-h-[1.5rem]">
        {indexing ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Indexation des projets…</span>
          </>
        ) : showResults ? (
          <>
            <Badge variant="secondary">{hits.length}</Badge>
            <span>
              résultat{hits.length > 1 ? 's' : ''} dans {groupedHits.length} projet
              {groupedHits.length > 1 ? 's' : ''}
            </span>
          </>
        ) : indexedArticles ? (
          <span>
            {totalArticles} élément{totalArticles > 1 ? 's' : ''} indexé
            {totalArticles > 1 ? 's' : ''}
          </span>
        ) : null}
      </div>

      <div className="flex-1 min-h-0">
        {!showResults ? (
          <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mb-3 opacity-50" />
            <p>Tapez votre recherche pour commencer</p>
          </div>
        ) : hits.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground">
            <SearchIcon className="h-12 w-12 mb-3 opacity-50" />
            <p>Aucun résultat pour « {query} »</p>
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-260px)]">
            <div className="space-y-6 pr-3">
              {groupedHits.map(({ project, hits: projectHits }) => (
                <div key={project.id}>
                  <div className="flex items-center gap-2 mb-2 sticky top-0 bg-background py-1">
                    <h2 className="font-semibold">{project.name}</h2>
                    <Badge variant="outline">
                      {projectHits.length} résultat{projectHits.length > 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {projectHits.map((hit, idx) => (
                      <SearchResult
                        key={`${hit.project.id}-${hit.article.id}-${hit.fieldName}-${idx}`}
                        hit={hit}
                        onClick={() => handleOpenResult(hit)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
