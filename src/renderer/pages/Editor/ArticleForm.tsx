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
import { Sparkles } from 'lucide-react'

interface ArticleFormProps {
  article: Article | undefined
  template: Template | null
  transcribing: boolean
  onUpdate: (fieldName: string, value: string) => void
  onTranscribe: () => void
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
        <div className="space-y-2">
          <Label>{field.name}</Label>
          <ReactQuill
            theme="snow"
            value={value}
            onChange={onChange}
            placeholder={field.name}
            modules={quillModules}
          />
        </div>
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
  onTranscribe
}: ArticleFormProps) {
  const sortedFields = template?.fields
    ? [...template.fields].sort((a, b) => a.order - b.order)
    : []

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-4">
        {/* Transcription button */}
        <Button
          onClick={onTranscribe}
          disabled={transcribing}
          className="w-full"
          variant="secondary"
        >
          <Sparkles className={`h-4 w-4 mr-2 ${transcribing ? 'animate-pulse' : ''}`} />
          {transcribing ? 'Transcription en cours...' : 'Transcrire avec IA'}
        </Button>

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
