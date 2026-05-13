// v2 ArticlesTable. ID-keyed (no numeric index). Multi-select + bulk actions.
import { useState } from 'react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  RowSelectionState,
} from '@tanstack/react-table'
import { Download, MoreHorizontal, Sparkles, Trash2, X } from 'lucide-react'
import type { ArticleMetadata } from '@shared/types'
import {
  Badge,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui'

interface ArticlesTableV2Props {
  articles: ArticleMetadata[]
  currentArticleId: string | null
  draftIds: Set<string>
  onSelectArticle: (articleId: string) => void
  onTranscribe?: (articleId: string) => void
  onDelete?: (articleId: string) => void
  onBulkTranscribe?: (articleIds: string[]) => void
  onBulkDelete?: (articleIds: string[]) => void
  onBulkExport?: (articleIds: string[]) => void
}

export function ArticlesTableV2({
  articles,
  currentArticleId,
  draftIds,
  onSelectArticle,
  onTranscribe,
  onDelete,
  onBulkTranscribe,
  onBulkDelete,
  onBulkExport,
}: ArticlesTableV2Props) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  // Each element carries its own schema — completion is filled-fields-in-schema
  // out of schema.length, computed per-row.
  const getCompletion = (article: ArticleMetadata): { filled: number; total: number } => {
    const schema = article.schema ?? []
    const fields = article.fields ?? {}
    const filled = schema.filter((f) => fields[f.name]).length
    return { filled, total: schema.length }
  }

  const columns: ColumnDef<ArticleMetadata>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Tout sélectionner"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Sélectionner la ligne"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: 'title',
      header: 'Élément',
      cell: ({ row }) => {
        const article = row.original
        const displayName =
          article.fields?.['Titre'] || article.fields?.['title'] || 'Sans titre'
        const hasDraft = draftIds.has(article.id)
        return (
          <button
            onClick={() => onSelectArticle(article.id)}
            className="text-left hover:underline font-medium truncate max-w-[200px] block"
          >
            {displayName}
            {hasDraft && (
              <span
                className="ml-1 text-amber-500"
                title="Modifications non sauvegardées"
              >
                ●
              </span>
            )}
          </button>
        )
      },
    },
    {
      id: 'completion',
      header: 'Champs',
      cell: ({ row }) => {
        const { filled, total } = getCompletion(row.original)
        const complete = total > 0 && filled === total
        return (
          <Badge variant={complete ? 'success' : 'secondary'}>
            {filled}/{total}
          </Badge>
        )
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const article = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Ouvrir le menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onTranscribe?.(article.id)}>
                <Sparkles className="h-4 w-4 mr-2" />
                Transcrire
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete?.(article.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  const table = useReactTable({
    data: articles,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onRowSelectionChange: setRowSelection,
    state: { rowSelection },
    getRowId: (row) => row.id,
  })

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id])

  return (
    <div className="w-full">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => {
              const isCurrent = row.original.id === currentArticleId
              return (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={isCurrent ? 'bg-primary/10' : ''}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              )
            })
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                Aucun élément.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card border rounded-lg shadow-lg p-2 flex items-center gap-2">
          <span className="text-sm px-3 text-muted-foreground">
            {selectedIds.length} sélectionné(s)
          </span>
          <Button size="sm" variant="outline" onClick={() => onBulkTranscribe?.(selectedIds)}>
            <Sparkles className="h-4 w-4 mr-2" />
            Transcrire
          </Button>
          <Button size="sm" variant="outline" onClick={() => onBulkExport?.(selectedIds)}>
            <Download className="h-4 w-4 mr-2" />
            Exporter
          </Button>
          <Button size="sm" variant="destructive" onClick={() => onBulkDelete?.(selectedIds)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Supprimer
          </Button>
          <Button size="sm" variant="ghost" onClick={() => table.resetRowSelection()}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
