import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'
import { useTemplatesStore } from '@/stores'
import { templateDisplayName } from '@/lib/templateLabels'

interface CreateProjectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string, templateId: string) => void
}

export function CreateProjectModal({ open, onOpenChange, onCreate }: CreateProjectModalProps) {
  const { t } = useTranslation(['projects', 'common'])
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState('press-article')
  const [loading, setLoading] = useState(false)
  const { templates, loadTemplates } = useTemplatesStore()

  useEffect(() => {
    if (open && templates.length === 0) {
      loadTemplates()
    }
  }, [open, templates.length, loadTemplates])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await onCreate(name || t('projects:create.defaultName'), templateId)
    setLoading(false)
    setName('')
    setTemplateId('press-article')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('projects:create.title')}</DialogTitle>
          <DialogDescription>
            {t('projects:create.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">{t('projects:create.nameLabel')}</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('projects:create.namePlaceholder')}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-template">{t('projects:create.templateLabel')}</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder={t('projects:create.templatePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {templateDisplayName(template)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('projects:create.templateHint')}
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {t('common:cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t('projects:create.submitting') : t('projects:create.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
