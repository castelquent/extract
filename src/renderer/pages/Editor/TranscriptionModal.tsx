import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Progress,
} from '@/components/ui'
import { Sparkles, Loader2 } from 'lucide-react'

interface TranscriptionModalProps {
  open: boolean
  progress?: { current: number; total: number } | null
}

export function TranscriptionModal({ open, progress }: TranscriptionModalProps) {
  const isBulk = progress && progress.total > 1

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md"
        hideCloseButton
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-8 w-8 text-primary animate-pulse" />
          </div>
          <DialogTitle className="text-xl">Transcription en cours</DialogTitle>
          <DialogDescription className="text-center">
            {isBulk ? (
              <>Transcription de {progress.total} élements en cours...</>
            ) : (
              <>
                L'IA analyse l'image et extrait le contenu de l'élément.
                <br />
                Veuillez patienter...
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {isBulk ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between text-sm">
              <span>{progress.current} / {progress.total} terminés</span>
              <span className="text-muted-foreground">
                {Math.round((progress.current / progress.total) * 100)}%
              </span>
            </div>
            <Progress value={(progress.current / progress.total) * 100} />
          </div>
        ) : (
          <div className="flex justify-center py-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
