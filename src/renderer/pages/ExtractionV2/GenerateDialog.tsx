// Dialog shown when the user clicks "Generate articles" at the end of an
// extraction session. Lets them place the generated articles in a new dossier,
// an existing dossier, or as orphans in the project.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'
import type { DossierView } from '@shared/types'

type Choice = 'new-dossier' | 'existing-dossier' | 'no-dossier'

interface GenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  articleCount: number
  // Default name suggestion for the new dossier (typically the source filename)
  defaultDossierName: string
  dossiers: DossierView[]
  onConfirm: (target: {
    choice: Choice
    newDossierName?: string
    existingDossierId?: string
  }) => Promise<void>
}

export function GenerateDialog({
  open,
  onOpenChange,
  articleCount,
  defaultDossierName,
  dossiers,
  onConfirm,
}: GenerateDialogProps) {
  const { t } = useTranslation(['extractor', 'common'])
  const hasDossiers = dossiers.length > 0
  // Default to "existing-dossier" when the project already has dossiers
  // (most common case after the first extraction). Fall back to "new-dossier"
  // for the very first generation in a project.
  const [choice, setChoice] = useState<Choice>(hasDossiers ? 'existing-dossier' : 'new-dossier')
  const [newDossierName, setNewDossierName] = useState('')
  const [existingDossierId, setExistingDossierId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setNewDossierName(defaultDossierName)
      setChoice(hasDossiers ? 'existing-dossier' : 'new-dossier')
      // Smart pre-select: if a dossier's name matches the source name
      // (case + whitespace insensitive), it's almost certainly where the
      // user wants the new articles to land.
      const norm = (s: string) => s.trim().toLowerCase()
      const target = norm(defaultDossierName)
      const matched = dossiers.find((d) => norm(d.name) === target)
      setExistingDossierId(matched?.id ?? dossiers[0]?.id ?? '')
    }
  }, [open, defaultDossierName, dossiers, hasDossiers])

  const canConfirm =
    choice === 'no-dossier' ||
    (choice === 'new-dossier' && newDossierName.trim().length > 0) ||
    (choice === 'existing-dossier' && !!existingDossierId)

  const handleConfirm = async () => {
    setSubmitting(true)
    await onConfirm({
      choice,
      newDossierName: choice === 'new-dossier' ? newDossierName.trim() : undefined,
      existingDossierId: choice === 'existing-dossier' ? existingDossierId : undefined,
    })
    setSubmitting(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('extractor:generateDialog.title', { count: articleCount })}</DialogTitle>
          <DialogDescription>
            {t('extractor:generateDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {hasDossiers && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                checked={choice === 'existing-dossier'}
                onChange={() => setChoice('existing-dossier')}
                className="mt-1"
              />
              <div className="flex-1 space-y-2">
                <span className="text-sm font-medium">{t('extractor:generateDialog.existingDossier')}</span>
                <Select
                  value={existingDossierId}
                  onValueChange={setExistingDossierId}
                  disabled={choice !== 'existing-dossier'}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('extractor:generateDialog.existingDossierPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {dossiers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </label>
          )}

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              checked={choice === 'new-dossier'}
              onChange={() => setChoice('new-dossier')}
              className="mt-1"
            />
            <div className="flex-1 space-y-2">
              <span className="text-sm font-medium">{t('extractor:generateDialog.newDossier')}</span>
              <Input
                value={newDossierName}
                onChange={(e) => setNewDossierName(e.target.value)}
                disabled={choice !== 'new-dossier'}
                placeholder={t('extractor:generateDialog.newDossierPlaceholder')}
              />
            </div>
          </label>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              checked={choice === 'no-dossier'}
              onChange={() => setChoice('no-dossier')}
              className="mt-1"
            />
            <div className="flex-1">
              <span className="text-sm font-medium">{t('extractor:generateDialog.noDossier')}</span>
              <p className="text-xs text-muted-foreground">
                {t('extractor:generateDialog.noDossierHint')}
              </p>
            </div>
          </label>

          <Label className="block text-xs text-muted-foreground pt-2">
            {t('extractor:generateDialog.footnote')}
          </Label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('common:cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm || submitting}>
            {submitting ? t('extractor:generateDialog.submitting') : t('extractor:generateDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
