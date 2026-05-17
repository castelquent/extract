import { useEffect, useState } from 'react'
import type { ExportProgress } from '@shared/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Progress,
} from '@/components/ui'
import { toast } from 'sonner'

// Global progress modal: subscribes to v2:export:progress events from the
// main process and shows a non-dismissable dialog while an export is running.
// Auto-closes on 'done' / 'cancelled' / 'error' (the last two also flash a
// toast).
export function ExportProgressModal() {
  const [progress, setProgress] = useState<ExportProgress | null>(null)

  useEffect(() => {
    const unsub = window.api.v2_onExportProgress((p) => {
      if (p.phase === 'cancelled') {
        setProgress(null)
        return
      }
      if (p.phase === 'error') {
        setProgress(null)
        toast.error(p.label ?? 'Erreur lors de l\'export')
        return
      }
      if (p.phase === 'done') {
        setProgress(null)
        toast.success('Export terminé')
        return
      }
      setProgress(p)
    })
    return unsub
  }, [])

  if (!progress) return null

  const label = phaseLabel(progress)
  const pct = progressPct(progress)

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-[400px]"
        // Block the user from closing while work is in flight.
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        // Hide the corner X — there's no API to cancel an in-flight export
        // for now, so a close button would lie about what it does.
        hideCloseButton
      >
        <DialogHeader>
          <DialogTitle>Export en cours</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">{label}</p>
          <Progress value={pct} />
          {progress.current !== undefined && progress.total !== undefined && progress.total > 0 && (
            <p className="text-xs text-muted-foreground text-right tabular-nums">
              {progress.current} / {progress.total}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function phaseLabel(p: ExportProgress): string {
  switch (p.phase) {
    case 'starting':
      return 'Préparation…'
    case 'rendering-images':
      return 'Génération des images source…'
    case 'building':
      return p.total && p.total > 1 ? 'Génération des documents…' : 'Génération du document…'
    case 'writing':
      return 'Écriture du fichier…'
    default:
      return ''
  }
}

function progressPct(p: ExportProgress): number {
  if (p.current === undefined || p.total === undefined || p.total === 0) {
    // No incremental info — show indeterminate-ish 30% so the bar looks alive.
    return p.phase === 'writing' ? 95 : p.phase === 'building' ? 60 : 30
  }
  return Math.round((p.current / p.total) * 100)
}
