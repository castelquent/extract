import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, ChevronDown, FolderOpen } from 'lucide-react'
import type { MatchHit, FieldMatch } from './index'

interface SearchResultProps {
  hit: MatchHit
  onClick: () => void
}

const HighlightedSnippet = ({ match }: { match: FieldMatch }) => {
  const before = match.snippet.slice(0, match.matchStart)
  const mid = match.snippet.slice(match.matchStart, match.matchStart + match.matchLength)
  const after = match.snippet.slice(match.matchStart + match.matchLength)
  return (
    <p className="text-sm leading-relaxed text-foreground/90 break-words">
      {before}
      <mark className="bg-yellow-200 dark:bg-yellow-500/40 text-foreground rounded px-0.5">
        {mid}
      </mark>
      {after}
    </p>
  )
}

export function SearchResult({ hit, onClick }: SearchResultProps) {
  const { t } = useTranslation('search')
  const [expanded, setExpanded] = useState(false)

  if (hit.kind === 'dossier') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group w-full text-left rounded-md border bg-card px-4 py-3 transition-colors hover:bg-accent hover:border-accent-foreground/20 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <div className="flex items-start gap-3">
          <FolderOpen className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{t('result.dossierLabel')}</span>
            </div>
            <HighlightedSnippet match={hit.match} />
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground mt-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </button>
    )
  }

  const title =
    hit.article.fields?.['Titre']?.trim() ||
    hit.article.fields?.['title']?.trim() ||
    t('result.untitledArticle')

  const total = hit.matches.length
  const hasMore = total > 1
  const firstMatch = hit.matches[0]
  const otherMatches = hit.matches.slice(1)

  // The badge needs its own click target so toggling expand doesn't open
  // the article. We stop propagation on the badge span.
  const toggleExpanded = (e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded((v) => !v)
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left rounded-md border bg-card px-4 py-3 transition-colors hover:bg-accent hover:border-accent-foreground/20 focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
            {hit.dossierName && (
              <>
                <span className="truncate max-w-[200px]">{hit.dossierName}</span>
                <span>›</span>
              </>
            )}
            <span className="font-medium text-foreground truncate max-w-[300px]">{title}</span>
            <span>·</span>
            <span>{hit.fieldName}</span>
            {hasMore && (
              <span
                role="button"
                tabIndex={0}
                onClick={toggleExpanded}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggleExpanded(e as unknown as React.MouseEvent)
                  }
                }}
                className="ml-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted-foreground/15 transition-colors cursor-pointer"
                title={expanded ? t('result.collapse') : t('result.viewMentions', { count: total })}
              >
                {expanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {t('result.mentionsCount', { count: total })}
              </span>
            )}
          </div>
          <HighlightedSnippet match={firstMatch} />
          {expanded && otherMatches.length > 0 && (
            <div className="mt-2 space-y-2 border-l-2 border-border/60 pl-3">
              {otherMatches.map((m, i) => (
                <HighlightedSnippet key={i} match={m} />
              ))}
            </div>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground mt-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </button>
  )
}
