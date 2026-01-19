import { useState, useEffect, useRef } from 'react'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'
import type { Article, Template, TemplateField } from '@shared/types'
import {
  Button,
  Input,
  Label,
  ScrollArea,
  Separator,
  Textarea,
} from '@/components/ui'
import { Sparkles, Download } from 'lucide-react'

interface ArticleFormProps {
  article: Article | undefined
  template: Template | null
  transcribing: boolean
  onUpdate: (fieldName: string, value: string) => void
  onTranscribe: () => void
  onExport: () => void
}

const quillModules = {
  toolbar: [
    ['bold', 'italic', 'underline'],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    ['clean']
  ]
}

interface DynamicFieldProps {
  field: TemplateField
  value: string
  onChange: (value: string) => void
}

// Composant séparé pour ReactQuill avec état local pour éviter les boucles infinies
function RichTextField({ field, value, onChange }: DynamicFieldProps) {
  const [localValue, setLocalValue] = useState(value)
  const prevValueRef = useRef(value)
  const isUpdatingRef = useRef(false)

  // Synchroniser avec les valeurs externes (ex: transcription IA)
  useEffect(() => {
    // Ne mettre à jour que si la valeur externe a vraiment changé
    // et qu'on n'est pas en train de traiter un changement local
    if (value !== prevValueRef.current && !isUpdatingRef.current) {
      prevValueRef.current = value
      setLocalValue(value)
    }
  }, [value])

  const handleChange = (newValue: string) => {
    // Marquer qu'on est en train de traiter un changement
    isUpdatingRef.current = true
    setLocalValue(newValue)
    prevValueRef.current = newValue

    // Propager le changement au parent
    onChange(newValue)

    // Reset le flag après un micro-délai pour permettre au cycle React de se terminer
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
      return (
        <RichTextField
          field={field}
          value={value}
          onChange={onChange}
        />
      )

    default:
      return null
  }
}

export function ArticleForm({
  article,
  template,
  transcribing,
  onUpdate,
  onTranscribe,
  onExport
}: ArticleFormProps) {
  const sortedFields = template?.fields
    ? [...template.fields].sort((a, b) => a.order - b.order)
    : []

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-4">
        {/* Action buttons */}
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
          <Button
            onClick={onExport}
            variant="outline"
          >
            <Download className="h-4 w-4 mr-2" />
            Exporter
          </Button>
        </div>

        <Separator />

        {/* Dynamic Fields */}
        <div className="space-y-4">
          {sortedFields.map((field) => (
            <DynamicField
              key={field.name}
              field={field}
              value={article?.fields?.[field.name] || ''}
              onChange={(value) => onUpdate(field.name, value)}
            />
          ))}
        </div>
      </div>
    </ScrollArea>
  )
}
