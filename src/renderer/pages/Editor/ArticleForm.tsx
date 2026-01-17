import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'
import type { Article } from '@shared/types'
import {
  Button,
  Input,
  Label,
  ScrollArea,
  Separator,
} from '@/components/ui'
import { Sparkles } from 'lucide-react'

interface ArticleFormProps {
  article: Article | undefined
  transcribing: boolean
  onUpdate: (field: keyof Article, value: string) => void
  onTranscribe: () => void
}

const quillModules = {
  toolbar: [
    ['bold', 'italic', 'underline'],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    ['clean']
  ]
}

export function ArticleForm({
  article,
  transcribing,
  onUpdate,
  onTranscribe
}: ArticleFormProps) {
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

        {/* Fields */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Titre</Label>
            <Input
              id="title"
              value={article?.title || ''}
              onChange={(e) => onUpdate('title', e.target.value)}
              placeholder="Titre de l'article"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="author">Auteur</Label>
            <Input
              id="author"
              value={article?.author || ''}
              onChange={(e) => onUpdate('author', e.target.value)}
              placeholder="Nom de l'auteur"
            />
          </div>

          <div className="space-y-2">
            <Label>Contenu</Label>
            <ReactQuill
              theme="snow"
              value={article?.content || ''}
              onChange={(value) => onUpdate('content', value)}
              placeholder="Contenu de l'article..."
              modules={quillModules}
            />
          </div>
        </div>
      </div>
    </ScrollArea>
  )
}
