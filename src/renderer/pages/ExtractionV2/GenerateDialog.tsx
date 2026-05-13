// Dialog shown when the user clicks "Generate articles" at the end of an
// extraction session. Lets them place the generated articles in a new dossier,
// an existing dossier, or as orphans in the project.
import { useEffect, useState } from 'react'
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
  const [choice, setChoice] = useState<Choice>('new-dossier')
  const [newDossierName, setNewDossierName] = useState('')
  const [existingDossierId, setExistingDossierId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setNewDossierName(defaultDossierName)
      setChoice(dossiers.length > 0 ? 'new-dossier' : 'new-dossier')
      setExistingDossierId(dossiers[0]?.id ?? '')
    }
  }, [open, defaultDossierName, dossiers])

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
          <DialogTitle>Générer {articleCount} article{articleCount === 1 ? '' : 's'}</DialogTitle>
          <DialogDescription>
            Comment organiser les articles générés dans ce projet ?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              checked={choice === 'new-dossier'}
              onChange={() => setChoice('new-dossier')}
              className="mt-1"
            />
            <div className="flex-1 space-y-2">
              <span className="text-sm font-medium">Créer un nouveau dossier</span>
              <Input
                value={newDossierName}
                onChange={(e) => setNewDossierName(e.target.value)}
                disabled={choice !== 'new-dossier'}
                placeholder="Nom du dossier"
              />
            </div>
          </label>

          <label className={`flex items-start gap-2 cursor-pointer ${dossiers.length === 0 ? 'opacity-50' : ''}`}>
            <input
              type="radio"
              checked={choice === 'existing-dossier'}
              onChange={() => setChoice('existing-dossier')}
              disabled={dossiers.length === 0}
              className="mt-1"
            />
            <div className="flex-1 space-y-2">
              <span className="text-sm font-medium">Ajouter à un dossier existant</span>
              <Select
                value={existingDossierId}
                onValueChange={setExistingDossierId}
                disabled={choice !== 'existing-dossier' || dossiers.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un dossier" />
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

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              checked={choice === 'no-dossier'}
              onChange={() => setChoice('no-dossier')}
              className="mt-1"
            />
            <div className="flex-1">
              <span className="text-sm font-medium">Sans dossier</span>
              <p className="text-xs text-muted-foreground">
                Les articles seront ajoutés directement au projet.
              </p>
            </div>
          </label>

          <Label className="block text-xs text-muted-foreground pt-2">
            La génération produit un PDF par article et peut prendre quelques secondes.
          </Label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm || submitting}>
            {submitting ? 'Génération...' : 'Générer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
