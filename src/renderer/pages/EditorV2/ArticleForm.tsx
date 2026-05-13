// v2 ArticleForm. Operates on plain `fields: Record<string, string>` instead
// of legacy Article — usable for both legacy and v2 articles.
import { useEffect, useRef, useState } from 'react'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'
import type { Template, TemplateField } from '@shared/types'
import {
  Button,
  Input,
  Label,
  ScrollArea,
  Separator,
  Textarea,
} from '@/components/ui'
import { Copy, Download, Sparkles } from 'lucide-react'

interface ArticleFormProps {
  fields: Record<string, string> | undefined
  template: Template | null
  transcribing: boolean
  copyingOcr?: boolean
  onUpdate: (fieldName: string, value: string) => void
  onTranscribe: () => void
  onCopyOcr?: () => void
  onExport: () => void
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
      <Label>{field.name}</Label>
      <ReactQuill
        theme="snow"
        value={localValue}
        onChange={handleChange}
        placeholder={field.name}
        modules={quillModules}
      />
    </div>
  )
}

function DynamicField({ field, value, onChange }: DynamicFieldProps) {
  switch (field.type) {
    case 'text':
      return (
        <div className="space-y-2">
          <Label htmlFor={field.name}>{field.name}</Label>
          <Input
            id={field.name}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.name}
          />
        </div>
      )
    case 'textarea':
      return (
        <div className="space-y-2">
          <Label htmlFor={field.name}>{field.name}</Label>
          <Textarea
            id={field.name}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.name}
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
  template,
  transcribing,
  copyingOcr,
  onUpdate,
  onTranscribe,
  onCopyOcr,
  onExport,
}: ArticleFormProps) {
  const sortedFields = template?.fields
    ? [...template.fields].sort((a, b) => a.order - b.order)
    : []

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
            {transcribing ? 'Transcription...' : 'Transcrire avec IA'}
          </Button>
          {onCopyOcr && (
            <Button
              onClick={onCopyOcr}
              disabled={copyingOcr}
              variant="outline"
              title="Copier le texte OCR du PDF dans le presse-papier"
            >
              <Copy className={`h-4 w-4 mr-2 ${copyingOcr ? 'animate-pulse' : ''}`} />
              Copier OCR
            </Button>
          )}
          <Button onClick={onExport} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Exporter
          </Button>
        </div>

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
