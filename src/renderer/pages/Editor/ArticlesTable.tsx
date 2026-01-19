import { useState } from 'react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  RowSelectionState,
} from '@tanstack/react-table'
import { MoreHorizontal, Sparkles, Trash2, X } from 'lucide-react'
import type { Article } from '@shared/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Checkbox,
  Button,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui'

interface ArticlesTableProps {
  articles: Article[]
  currentIndex: number
  totalFields: number
  onSelectArticle: (index: number) => void
  onSelectionChange?: (selectedIds: number[]) => void
  onTranscribe?: (index: number) => void
  onDelete?: (index: number) => void
  onBulkTranscribe?: (indices: number[]) => void
  onBulkDelete?: (indices: number[]) => void
}

export function ArticlesTable({
  articles,
  currentIndex,
  totalFields,
  onSelectArticle,
  onSelectionChange,
  onTranscribe,
  onDelete,
  onBulkTranscribe,
  onBulkDelete,
}: ArticlesTableProps) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const getArticleCompletion = (article: Article) => {
    if (!article.fields) return 0
    return Object.values(article.fields).filter(Boolean).length
  }

  const columns: ColumnDef<Article>[] = [
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
      header: 'Article',
      cell: ({ row }) => {
        const article = row.original
        const index = articles.findIndex((a) => a.id === article.id)
        const displayName = article.fields?.Titre || `Article ${index + 1}`
        return (
          <button
            onClick={() => onSelectArticle(index)}
            className="text-left hover:underline font-medium truncate max-w-[200px] block"
          >
            {displayName}
          </button>
        )
      },
    },
    {
      id: 'completion',
      header: 'Champs',
      cell: ({ row }) => {
        const completion = getArticleCompletion(row.original)
        return (
          <Badge variant={completion === totalFields ? 'success' : 'secondary'}>
            {completion}/{totalFields}
          </Badge>
        )
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const index = articles.findIndex((a) => a.id === row.original.id)
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Ouvrir le menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onTranscribe?.(index)}>
                <Sparkles className="h-4 w-4 mr-2" />
                Transcrire
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete?.(index)}
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
    onRowSelectionChange: (updater) => {
      const newSelection = typeof updater === 'function' ? updater(rowSelection) : updater
      setRowSelection(newSelection)

      if (onSelectionChange) {
        const selectedIds = Object.keys(newSelection)
          .filter((key) => newSelection[key])
          .map((key) => articles[parseInt(key)].id)
        onSelectionChange(selectedIds)
      }
    },
    state: {
      rowSelection,
    },
    getRowId: (_row, index) => index.toString(),
  })

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
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => {
              const index = articles.findIndex((a) => a.id === row.original.id)
              const isCurrentArticle = index === currentIndex
              return (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={isCurrentArticle ? 'bg-primary/10' : ''}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              )
            })
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                Aucun article.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {/* Floating action bar */}
      {table.getFilteredSelectedRowModel().rows.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-card border rounded-lg shadow-lg p-2 flex items-center gap-2">
          <span className="text-sm px-3 text-muted-foreground">
            {table.getFilteredSelectedRowModel().rows.length} sélectionné(s)
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const indices = Object.keys(rowSelection)
                .filter((key) => rowSelection[key])
                .map((key) => parseInt(key))
              onBulkTranscribe?.(indices)
            }}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Transcrire
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              const indices = Object.keys(rowSelection)
                .filter((key) => rowSelection[key])
                .map((key) => parseInt(key))
              onBulkDelete?.(indices)
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Supprimer
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              table.resetRowSelection()
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
