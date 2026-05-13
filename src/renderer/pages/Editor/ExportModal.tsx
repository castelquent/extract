import { useState } from 'react'
import { FileText, FileIcon, FileType } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Label,
  Switch,
} from '@/components/ui'

export type ExportFormat = 'pdf' | 'docx' | 'txt'

// Options chosen by the user inside the modal. Surfaced to the caller via
// the second argument of `onExport`. Defaults are applied at consumer side.
export interface ExportModalChoices {
  includeDossierTitles: boolean
}

interface ExportModalProps {
  open: boolean
  onClose: () => void
  onExport: (format: ExportFormat, choices: ExportModalChoices) => void
  // Drives title pluralisation. Defaults to 1 so a missing count reads as
  // singular ("Exporter l'élément") — same as before this prop existed.
  articleCount?: number
  // When true, the modal shows a switch letting the user insert a full-page
  // dossier title between groups. Off by default; only the project-scope
  // export caller turns it on (per-article and per-selection exports don't
  // know about dossier grouping).
  showDossierTitleOption?: boolean
}

export function ExportModal({
  open,
  onClose,
  onExport,
  articleCount = 1,
  showDossierTitleOption = false,
}: ExportModalProps) {
  const [includeDossierTitles, setIncludeDossierTitles] = useState(false)

  const handleExport = (format: ExportFormat) => {
    onExport(format, { includeDossierTitles })
    onClose()
  }

  const title =
    articleCount > 1
      ? `Exporter ${articleCount} éléments`
      : "Exporter l'élément"

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {showDossierTitleOption && (
          <div className="flex items-center justify-between pt-2">
            <Label htmlFor="export-include-dossier-titles" className="cursor-pointer">
              Inclure le nom des dossiers
            </Label>
            <Switch
              id="export-include-dossier-titles"
              checked={includeDossierTitles}
              onCheckedChange={setIncludeDossierTitles}
            />
          </div>
        )}
        <div className="grid grid-cols-3 gap-3 py-4">
          <Button
            variant="outline"
            className="flex flex-col items-center gap-2 h-24"
            onClick={() => handleExport('pdf')}
          >
            <FileText className="h-8 w-8" />
            <span>PDF</span>
          </Button>
          <Button
            variant="outline"
            className="flex flex-col items-center gap-2 h-24"
            onClick={() => handleExport('docx')}
          >
            <FileIcon className="h-8 w-8" />
            <span>DOCX</span>
          </Button>
          <Button
            variant="outline"
            className="flex flex-col items-center gap-2 h-24"
            onClick={() => handleExport('txt')}
          >
            <FileType className="h-8 w-8" />
            <span>TXT</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
