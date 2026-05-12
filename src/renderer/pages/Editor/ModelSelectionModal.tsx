import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'
import { Sparkles, AlertCircle } from 'lucide-react'
import { AI_MODELS, findModel } from '@/lib/aiModels'
import type { AIProvider } from '@shared/types'

interface ModelSelectionModalProps {
  open: boolean
  /** 1 pour une transcription unique, N pour un batch. */
  articleCount: number
  /** Modèle par défaut, lu depuis les settings utilisateur. */
  defaultModel: string
  /** Providers pour lesquels une clé API est renseignée. */
  availableProviders: Set<AIProvider>
  onCancel: () => void
  onConfirm: (modelValue: string) => void
}

export function ModelSelectionModal({
  open,
  articleCount,
  defaultModel,
  availableProviders,
  onCancel,
  onConfirm,
}: ModelSelectionModalProps) {
  const [selectedModel, setSelectedModel] = useState(defaultModel)

  // Resynchroniser quand la modal s'ouvre (la valeur par défaut peut avoir
  // changé entre deux ouvertures si l'utilisateur a modifié ses settings).
  useEffect(() => {
    if (open) setSelectedModel(defaultModel)
  }, [open, defaultModel])

  const selectedOption = findModel(selectedModel)
  const isBatch = articleCount > 1
  const openaiModels = AI_MODELS.filter((m) => m.provider === 'openai')
  const anthropicModels = AI_MODELS.filter((m) => m.provider === 'anthropic')

  // Le modèle sélectionné est-il utilisable (clé API présente) ?
  const selectedHasKey = selectedOption !== null && availableProviders.has(selectedOption.provider)
  const hasAnyKey = availableProviders.size > 0

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">
            {isBatch ? `Transcrire ${articleCount} éléments` : 'Transcrire l\'élément'}
          </DialogTitle>
          <DialogDescription className="text-center">
            Choisissez le modèle d'IA à utiliser pour cette transcription.
            <br />
            <span className="text-xs">Modèle par défaut : {findModel(defaultModel)?.label ?? defaultModel}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label>Modèle</Label>
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner un modèle" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>
                  Anthropic{!availableProviders.has('anthropic') && ' — clé API manquante'}
                </SelectLabel>
                {anthropicModels.map((model) => (
                  <SelectItem
                    key={model.value}
                    value={model.value}
                    disabled={!availableProviders.has('anthropic')}
                  >
                    {model.label.replace(/^Anthropic:\s*/, '')}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>
                  OpenAI{!availableProviders.has('openai') && ' — clé API manquante'}
                </SelectLabel>
                {openaiModels.map((model) => (
                  <SelectItem
                    key={model.value}
                    value={model.value}
                    disabled={!availableProviders.has('openai')}
                  >
                    {model.label.replace(/^OpenAI:\s*/, '')}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {!hasAnyKey && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-destructive">
                Aucune clé API configurée. Allez dans <strong>Paramètres &gt; IA</strong> pour en ajouter une.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onCancel}>
            Annuler
          </Button>
          <Button onClick={() => onConfirm(selectedModel)} disabled={!selectedOption || !selectedHasKey}>
            <Sparkles className="h-4 w-4 mr-2" />
            Transcrire
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
