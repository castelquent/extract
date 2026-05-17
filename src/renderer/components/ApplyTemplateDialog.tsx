// Two-step model picker: select a model → preview the merge (with lost fields
// if any) → confirm. Used both by the Editor (full-form context) and the
// Extraction page (changing model on a persisted element).
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { computeMerge, stripHtml } from '@/lib/templateMerge'
import { templateDisplayName } from '@/lib/templateLabels'

interface ApplyTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: Template[]
  currentTemplateId?: string
  currentSchema: TemplateField[]
  currentFields: Record<string, string>
  onConfirm: (template: Template, mergedFields: Record<string, string>) => void | Promise<void>
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
  const { t } = useTranslation(['extractor', 'common'])
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

  const snippet = (raw: string): string => {
    const t = stripHtml(raw)
    return t.length > 60 ? `${t.slice(0, 60)}…` : t
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('extractor:applyTemplate.title')}</DialogTitle>
          <DialogDescription>
            {t('extractor:applyTemplate.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger>
              <SelectValue placeholder={t('extractor:applyTemplate.templatePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {templates.map((tpl) => (
                <SelectItem key={tpl.id} value={tpl.id}>
                  {templateDisplayName(tpl)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {preview && preview.lostFields.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1">
              <p className="font-medium text-amber-700 dark:text-amber-500">
                {t('extractor:applyTemplate.lostFieldsWarning', { count: preview.lostFields.length })}
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
            {t('common:cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedTemplate || submitting}>
            {submitting ? t('extractor:applyTemplate.submitting') : t('extractor:applyTemplate.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
