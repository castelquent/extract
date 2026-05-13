// Two-step dialog: pick a new model, then if any filled fields would be
// dropped, confirm the loss. Merge keeps values for fields whose name
// matches between old and new schema (with graceful type coercion).
import { useMemo, useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'
import type { Template, TemplateField } from '@shared/types'

interface ApplyTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: Template[]
  currentTemplateId?: string
  currentSchema: TemplateField[]
  currentFields: Record<string, string>
  onConfirm: (template: Template, mergedFields: Record<string, string>) => void | Promise<void>
}

// Strip HTML for graceful richtext → text conversion.
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

// Wrap plain text in <p> for graceful text → richtext conversion.
const wrapAsHtml = (text: string): string => {
  if (!text) return ''
  return `<p>${text}</p>`
}

// Returns the new (merged) fields and the list of field names whose value
// would be dropped (only those that had a non-empty value).
const computeMerge = (
  oldSchema: TemplateField[],
  newSchema: TemplateField[],
  oldFields: Record<string, string>
): { mergedFields: Record<string, string>; lostFields: { name: string; value: string }[] } => {
  const newNames = new Set(newSchema.map((f) => f.name))
  const oldByName = new Map(oldSchema.map((f) => [f.name, f]))
  const mergedFields: Record<string, string> = {}

  for (const field of newSchema) {
    const existingValue = oldFields[field.name] ?? ''
    if (!existingValue) {
      mergedFields[field.name] = ''
      continue
    }
    const oldField = oldByName.get(field.name)
    if (!oldField || oldField.type === field.type) {
      mergedFields[field.name] = existingValue
      continue
    }
    // Type changed: coerce.
    if (oldField.type === 'richtext' && (field.type === 'text' || field.type === 'textarea')) {
      mergedFields[field.name] = stripHtml(existingValue)
    } else if (
      (oldField.type === 'text' || oldField.type === 'textarea') &&
      field.type === 'richtext'
    ) {
      mergedFields[field.name] = wrapAsHtml(existingValue)
    } else {
      mergedFields[field.name] = existingValue
    }
  }

  const lostFields: { name: string; value: string }[] = []
  for (const [name, value] of Object.entries(oldFields)) {
    if (!value) continue
    if (!newNames.has(name)) lostFields.push({ name, value })
  }

  return { mergedFields, lostFields }
}

export function ApplyTemplateDialog({
  open,
  onOpenChange,
  templates,
  currentTemplateId,
  currentSchema,
  currentFields,
  onConfirm,
}: ApplyTemplateDialogProps) {
  const [selectedId, setSelectedId] = useState<string>(currentTemplateId ?? templates[0]?.id ?? '')
  const [submitting, setSubmitting] = useState(false)

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId]
  )

  const preview = useMemo(() => {
    if (!selectedTemplate) return null
    return computeMerge(currentSchema, selectedTemplate.fields, currentFields)
  }, [selectedTemplate, currentSchema, currentFields])

  const handleConfirm = async () => {
    if (!selectedTemplate || !preview) return
    setSubmitting(true)
    await onConfirm(selectedTemplate, preview.mergedFields)
    setSubmitting(false)
    onOpenChange(false)
  }

  // Empty short-snippet for a dropped value (avoid dumping a whole article)
  const snippet = (raw: string): string => {
    const t = stripHtml(raw)
    return t.length > 60 ? `${t.slice(0, 60)}…` : t
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Appliquer un modèle</DialogTitle>
          <DialogDescription>
            Les valeurs des champs portant le même nom seront conservées. Les champs absents du
            nouveau modèle seront supprimés.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir un modèle" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {preview && preview.lostFields.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1">
              <p className="font-medium text-amber-700 dark:text-amber-500">
                {preview.lostFields.length} champ{preview.lostFields.length > 1 ? 's' : ''} sera supprimé :
              </p>
              <ul className="space-y-0.5 list-disc list-inside text-muted-foreground">
                {preview.lostFields.map((f) => (
                  <li key={f.name}>
                    <span className="font-medium text-foreground">{f.name}</span>
                    {snippet(f.value) && ` — ${snippet(f.value)}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedTemplate || submitting}>
            {submitting ? 'Application...' : 'Appliquer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
