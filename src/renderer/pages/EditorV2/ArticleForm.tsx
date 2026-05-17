// v2 ArticleForm. Renders fields from the article's snapshotted schema.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'
import type { TemplateField } from '@shared/types'
import { fieldDisplayName } from '@/lib/templateLabels'
import {
  Button,
  Input,
  Label,
  ScrollArea,
  Separator,
  Textarea,
} from '@/components/ui'
import { Copy, Download, FileStack, Sparkles } from 'lucide-react'

interface ArticleFormProps {
  fields: Record<string, string> | undefined
  schema: TemplateField[]
  currentTemplateName?: string
  transcribing: boolean
  copyingOcr?: boolean
  onUpdate: (fieldName: string, value: string) => void
  onTranscribe: () => void
  onCopyOcr?: () => void
  onExport: () => void
  onApplyTemplate?: () => void
}

const quillModules = {
  toolbar: [
    ['bold', 'italic', 'underline'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['clean'],
  ],
}

interface DynamicFieldProps {
  field: TemplateField
  value: string
  onChange: (value: string) => void
}

function RichTextField({ field, value, onChange }: DynamicFieldProps) {
  const label = fieldDisplayName(field)
  const [localValue, setLocalValue] = useState(value)
  const prevValueRef = useRef(value)
  const isUpdatingRef = useRef(false)
  const isStabilizingRef = useRef(true)

  useEffect(() => {
    if (value !== prevValueRef.current && !isUpdatingRef.current) {
      isStabilizingRef.current = true
      prevValueRef.current = value
      setLocalValue(value)
      setTimeout(() => {
        isStabilizingRef.current = false
      }, 100)
    }
  }, [value])

  useEffect(() => {
    const timer = setTimeout(() => {
      isStabilizingRef.current = false
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  const handleChange = (newValue: string) => {
    if (isStabilizingRef.current) return
    if (newValue === prevValueRef.current) return
    isUpdatingRef.current = true
    setLocalValue(newValue)
    prevValueRef.current = newValue
    onChange(newValue)
    setTimeout(() => {
      isUpdatingRef.current = false
    }, 0)
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <ReactQuill
        theme="snow"
        value={localValue}
        onChange={handleChange}
        placeholder={label}
        modules={quillModules}
      />
    </div>
  )
}

function DynamicField({ field, value, onChange }: DynamicFieldProps) {
  const label = fieldDisplayName(field)
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
    case 'richtext':
      return <RichTextField field={field} value={value} onChange={onChange} />
    default:
      return null
  }
}

export function ArticleForm({
  fields,
  schema,
  currentTemplateName,
  transcribing,
  copyingOcr,
  onUpdate,
  onTranscribe,
  onCopyOcr,
  onExport,
  onApplyTemplate,
}: ArticleFormProps) {
  const { t } = useTranslation('editor')
  const sortedFields = [...schema].sort((a, b) => a.order - b.order)

  return (
    <ScrollArea className="flex-1">
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
          {sortedFields.map((field) => (
            <DynamicField
              key={field.name}
              field={field}
              value={fields?.[field.name] ?? ''}
              onChange={(value) => onUpdate(field.name, value)}
            />
          ))}
        </div>
      </div>
    </ScrollArea>
  )
}
