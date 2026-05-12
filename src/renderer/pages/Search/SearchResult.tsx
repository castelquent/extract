import { ChevronRight } from 'lucide-react'
import type { Project, Article } from '@shared/types'

interface MatchHit {
  project: Project
  articleIndex: number
  article: Article
  fieldName: string
  snippet: string
  matchStart: number
  matchLength: number
}

interface SearchResultProps {
  hit: MatchHit
  onClick: () => void
}

export function SearchResult({ hit, onClick }: SearchResultProps) {
  const before = hit.snippet.slice(0, hit.matchStart)
  const match = hit.snippet.slice(hit.matchStart, hit.matchStart + hit.matchLength)
  const after = hit.snippet.slice(hit.matchStart + hit.matchLength)

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left rounded-md border bg-card px-4 py-3 transition-colors hover:bg-accent hover:border-accent-foreground/20 focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Élément {hit.articleIndex + 1}</span>
            <span>·</span>
            <span>{hit.fieldName}</span>
          </div>
          <p className="text-sm leading-relaxed text-foreground/90 break-words">
            {before}
            <mark className="bg-yellow-200 dark:bg-yellow-500/40 text-foreground rounded px-0.5">
              {match}
            </mark>
            {after}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground mt-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </button>
  )
}
