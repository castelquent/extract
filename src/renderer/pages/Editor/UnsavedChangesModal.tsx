import { useState } from 'react'
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
          <DialogTitle className="text-center">Modifications non sauvegardées</DialogTitle>
          <DialogDescription className="text-center">
            Vous avez des modifications non sauvegardées.
            <br />
            Que souhaitez-vous faire ?
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleSave} disabled={saving} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Sauvegarde...' : 'Sauvegarder et quitter'}
          </Button>
          <Button variant="outline" onClick={onDiscard} disabled={saving} className="w-full">
            <X className="h-4 w-4 mr-2" />
            Quitter sans sauvegarder
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={saving} className="w-full">
            Annuler
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
