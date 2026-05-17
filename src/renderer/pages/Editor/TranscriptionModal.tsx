import { useTranslation, Trans } from 'react-i18next'
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
  const { t } = useTranslation('editor')
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
          <DialogTitle className="text-xl">{t('transcriptionModal.title')}</DialogTitle>
          <DialogDescription className="text-center">
            {isBulk ? (
              t('transcriptionModal.descriptionBulk', { count: progress.total })
            ) : (
              <Trans
                i18nKey="editor:transcriptionModal.descriptionSingle"
                components={{ br: <br /> }}
              />
            )}
          </DialogDescription>
        </DialogHeader>

        {isBulk ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between text-sm">
              <span>{t('transcriptionModal.progress', { current: progress.current, total: progress.total })}</span>
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
