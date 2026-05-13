import { Lock, Send, Trash2 } from 'lucide-react'
import type { WorkingArticle as Article } from '@/stores/extractionStore'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui'

interface ZoneContextMenuProps {
  children: React.ReactNode
  articles: Article[]
  currentArticleId: number | null
  onDelete: () => void
  onMoveToArticle: (targetArticleId: number) => void
  // When true, hide destructive actions. The zone belongs to a locked element.
  locked?: boolean
}

export function ZoneContextMenu({
  children,
  articles,
  currentArticleId,
  onDelete,
  onMoveToArticle,
  locked,
}: ZoneContextMenuProps) {
  // Get other articles for the "Send to" submenu (most recent first = reverse order)
  const otherArticles = articles
    .filter((a) => a.id !== currentArticleId)
    .slice()
    .reverse()

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>

      <ContextMenuContent>
        {locked ? (
          <ContextMenuItem disabled>
            <Lock className="h-4 w-4 mr-2 text-amber-500" />
            Élément verrouillé — déverrouillez-le pour modifier
          </ContextMenuItem>
        ) : (
          <>
            {otherArticles.length > 0 && (
              <>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>
                    <Send className="h-4 w-4 mr-2" />
                    Envoyer à l'élément
                  </ContextMenuSubTrigger>
                  <ContextMenuSubContent>
                    {otherArticles.map((article) => {
                      const articleIndex = articles.findIndex((a) => a.id === article.id)
                      return (
                        <ContextMenuItem
                          key={article.id}
                          onClick={() => onMoveToArticle(article.id)}
                        >
                          Élément {articleIndex + 1}
                          <span className="ml-2 text-muted-foreground text-xs">
                            ({article.zones.length} zone{article.zones.length > 1 ? 's' : ''})
                          </span>
                        </ContextMenuItem>
                      )
                    })}
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSeparator />
              </>
            )}

            <ContextMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Supprimer
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
