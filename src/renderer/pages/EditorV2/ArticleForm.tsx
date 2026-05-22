// v2 ArticleForm. Renders fields from the article's snapshotted schema.
import { useTranslation } from 'react-i18next'
import type { Template, TemplateField } from '@shared/types'
import { resolveFieldLabel } from '@shared/fieldLabel'
import {
  Button,
  Input,
  Label,
  Separator,
  Textarea,
} from '@/components/ui'
import { Copy, Download, FileStack, RotateCcw, Sparkles } from 'lucide-react'
import { RichEditor } from '@/components/RichEditor'

interface ArticleFormProps {
  fields: Record<string, string> | undefined
  // Mandatory raw transcription content (markdown). Lives separate from
  // `fields` so its presence does not depend on the template schema.
  content: string
  schema: TemplateField[]
  templates: Template[]
  templateId?: string
  currentTemplateName?: string
  transcribing: boolean
  copyingOcr?: boolean
  reextractingField?: string | null
  onUpdate: (fieldName: string, value: string) => void
  onContentChange: (value: string) => void
  onTranscribe: () => void
  onReextractField?: (fieldName: string) => void
  onCopyOcr?: () => void
  onExport: () => void
  onApplyTemplate?: () => void
}

interface DynamicFieldProps {
  field: TemplateField
  label: string
  value: string
  onChange: (value: string) => void
  // Optional re-extract handler. When set, markdown fields show a "Réextraire"
  // button that asks the AI to repopulate the field from content.md.
  onReextract?: () => void
  reextracting?: boolean
}

function DynamicField({ field, label, value, onChange, onReextract, reextracting }: DynamicFieldProps) {
  switch (field.type) {
    case 'text':
      return (
        <div className="space-y-2">
          <Label htmlFor={field.name}>{label}</Label>
          <Input
            id={field.name}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={label}
          />
        </div>
      )
    case 'textarea':
      return (
        <div className="space-y-2">
          <Label htmlFor={field.name}>{label}</Label>
          <Textarea
            id={field.name}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={label}
            rows={4}
          />
        </div>
      )
    case 'markdown':
      return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{label}</Label>
            {onReextract && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs px-2"
                onClick={onReextract}
                disabled={reextracting}
              >
                <RotateCcw className={`h-3 w-3 mr-1 ${reextracting ? 'animate-spin' : ''}`} />
                Réextraire
              </Button>
            )}
          </div>
          <RichEditor value={value} onChange={onChange} />
        </div>
      )
    default:
      return null
  }
}

export function ArticleForm({
  fields,
  content,
  schema,
  templates,
  templateId,
  currentTemplateName,
  transcribing,
  copyingOcr,
  reextractingField,
  onUpdate,
  onContentChange,
  onTranscribe,
  onReextractField,
  onCopyOcr,
  onExport,
  onApplyTemplate,
}: ArticleFormProps) {
  const { t } = useTranslation('editor')
  const sortedFields = [...schema].sort((a, b) => a.order - b.order)

  return (
    <div className="p-4 space-y-4">
        <div className="flex gap-2">
          <Button
            onClick={onTranscribe}
            disabled={transcribing}
            className="flex-1"
            variant="secondary"
          >
            <Sparkles className={`h-4 w-4 mr-2 ${transcribing ? 'animate-pulse' : ''}`} />
            {transcribing ? t('form.transcribing') : t('form.transcribe')}
          </Button>
          {onCopyOcr && (
            <Button
              onClick={onCopyOcr}
              disabled={copyingOcr}
              variant="outline"
              title={t('form.copyOcrTitle')}
            >
              <Copy className={`h-4 w-4 mr-2 ${copyingOcr ? 'animate-pulse' : ''}`} />
              {t('form.copyOcr')}
            </Button>
          )}
          <Button onClick={onExport} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            {t('form.export')}
          </Button>
        </div>

        {onApplyTemplate && (
          <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <FileStack className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {t('form.templateLabel')} <span className="font-medium text-foreground">{currentTemplateName ?? t('form.templateCustom')}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2 ml-auto"
              onClick={onApplyTemplate}
            >
              {t('form.templateChange')}
            </Button>
          </div>
        )}

        <Separator />

        <div className="space-y-4">
          {sortedFields.map((field) => {
            const { name: label } = resolveFieldLabel(field, templates, templateId)
            return (
              <DynamicField
                key={field.name}
                field={field}
                label={label}
                value={fields?.[field.name] ?? ''}
                onChange={(value) => onUpdate(field.name, value)}
                onReextract={
                  field.type === 'markdown' && onReextractField
                    ? () => onReextractField(field.name)
                    : undefined
                }
                reextracting={reextractingField === field.name}
              />
            )
          })}

          {/* Mandatory transcription body. Lives in content.md on disk and is
              the LLM-cleaned markdown produced at transcription time. */}
          <div className="space-y-2">
            <Label>{t('form.contentLabel')}</Label>
            <RichEditor value={content} onChange={onContentChange} />
          </div>
        </div>
      </div>
  )
}
