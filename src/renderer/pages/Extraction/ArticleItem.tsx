import { FileStack, Lock, Trash2, Unlock } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { WorkingArticle as Article } from '@/stores/extractionStore'
import type { Template } from '@shared/types'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'

interface ArticleItemProps {
  article: Article
  index: number
  isActive: boolean
  setRef?: (el: HTMLDivElement | null) => void
  onSelect: () => void
  onRemove: () => void
  onReorderZones: (fromIndex: number, toIndex: number) => void
  // Optional: when provided, show an inline model selector for this element.
  templates?: Template[]
  // Silent swap (used for new/unlocked elements where fields are empty).
  onTemplateChange?: (template: Template) => void
  // Triggers the merge dialog from the parent — used for persisted-with-fields
  // elements where a model change must preserve / coerce field values.
  onChangeModelRequest?: () => void
  // When true, the element is persisted with filled fields. Zone edits + delete
  // are gated behind onUnlockRequest (confirms wiping fields).
  locked?: boolean
  onUnlockRequest?: () => void
  children: React.ReactNode
}

export function ArticleItem({
  article,
  index,
  isActive,
  setRef,
  onSelect,
  onRemove,
  onReorderZones,
  templates,
  onTemplateChange,
  onChangeModelRequest,
  locked,
  onUnlockRequest,
  children,
}: ArticleItemProps) {
  const currentTemplateName =
    templates?.find((t) => t.id === article.templateId)?.name ?? 'Personnalisé'
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const fromIndex = active.data.current?.zoneIndex
    const toIndex = over.data.current?.zoneIndex

    if (typeof fromIndex === 'number' && typeof toIndex === 'number') {
      onReorderZones(fromIndex, toIndex)
    }
  }

  // Generate sortable IDs for zones
  const sortableIds = article.zones.map((_, zoneIndex) => `zone-${article.id}-${zoneIndex}`)

  return (
    <Card
      ref={setRef}
      className={`group transition-all cursor-pointer ${
        isActive
          ? 'bg-primary/10 ring-2 ring-primary shadow-sm'
          : 'hover:bg-muted/50'
      }`}
      onClick={onSelect}
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-2">
          {/* Article number */}
          <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-medium ${
            isActive ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
          }`}>
            {index + 1}
          </div>

          {/* Article label */}
          <span className="font-medium text-sm flex-1 flex items-center gap-1.5">
            {locked && (
              <Lock
                className="h-3.5 w-3.5 text-amber-500"
                aria-label="Élément verrouillé"
              />
            )}
            Élement {index + 1}
            {isActive && !locked && (
              <span className="ml-2 text-xs text-primary font-normal">• actif</span>
            )}
          </span>

          {/* Zone count */}
          <Badge variant="secondary" className="text-xs">
            {article.zones.length} zone{article.zones.length > 1 ? 's' : ''}
          </Badge>

          {/* Action button: unlock for locked elements, delete for the rest */}
          {locked ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Déverrouiller (vide les champs)"
              onClick={(e) => {
                e.stopPropagation()
                onUnlockRequest?.()
              }}
            >
              <Unlock className="h-4 w-4 text-amber-600" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>

        {/* Model picker. Locked elements (persisted with filled fields) get a
            "Changer le modèle…" button that opens the merge dialog. The rest
            get the inline Select for quick swap. */}
        {templates && templates.length > 0 && (
          <div className="mt-2 ml-8" onClick={(e) => e.stopPropagation()}>
            {locked ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={onChangeModelRequest}
                title="Le modèle s'applique avec préservation des champs"
              >
                <FileStack className="h-3.5 w-3.5 mr-1.5" />
                Modèle : {currentTemplateName}
              </Button>
            ) : onTemplateChange ? (
              <Select
                value={article.templateId ?? ''}
                onValueChange={(id) => {
                  const template = templates.find((t) => t.id === id)
                  if (template) onTemplateChange(template)
                }}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Modèle" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        )}

        {/* Zones list with drag & drop reordering */}
        {article.zones.length > 0 && (
          <div className="mt-2 ml-8">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
                <div className="flex flex-wrap gap-1">
                  {children}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
