import { useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from '@/components/ui'
import { AlertTriangle, Save, X } from 'lucide-react'

interface UnsavedChangesModalProps {
  open: boolean
  onSave: () => Promise<void>
  onDiscard: () => void
  onCancel: () => void
}

export function UnsavedChangesModal({
  open,
  onSave,
  onDiscard,
  onCancel
}: UnsavedChangesModalProps) {
  const { t } = useTranslation(['extractor', 'common'])
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave()
    setSaving(false)
  }

  return (
    <Dialog open={open}>
      <DialogContent
        hideCloseButton
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/10">
            <AlertTriangle className="h-6 w-6 text-yellow-500" />
          </div>
          <DialogTitle className="text-center">{t('extractor:unsavedChanges.title')}</DialogTitle>
          <DialogDescription className="text-center">
            <Trans
              i18nKey="extractor:unsavedChanges.description"
              components={{ br: <br /> }}
            />
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleSave} disabled={saving} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            {saving ? t('extractor:unsavedChanges.saveAndQuitInProgress') : t('extractor:unsavedChanges.saveAndQuit')}
          </Button>
          <Button variant="outline" onClick={onDiscard} disabled={saving} className="w-full">
            <X className="h-4 w-4 mr-2" />
            {t('extractor:unsavedChanges.discard')}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={saving} className="w-full">
            {t('common:cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
