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
  highlightSearchTerm: boolean
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
  // When set, the modal shows a switch to highlight every occurrence of
  // this term in the exported document. DOCX implements highlighting
  // natively; PDF/TXT silently ignore the choice (a note is shown).
  highlightTerm?: string
}

export function ExportModal({
  open,
  onClose,
  onExport,
  articleCount = 1,
  showDossierTitleOption = false,
  highlightTerm,
}: ExportModalProps) {
  const [includeDossierTitles, setIncludeDossierTitles] = useState(false)
  const [highlightSearchTerm, setHighlightSearchTerm] = useState(true)

  const handleExport = (format: ExportFormat) => {
    onExport(format, { includeDossierTitles, highlightSearchTerm })
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
        {highlightTerm && (
          <div className="space-y-1 pt-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="export-highlight-term" className="cursor-pointer">
                Surligner « {highlightTerm} »
              </Label>
              <Switch
                id="export-highlight-term"
                checked={highlightSearchTerm}
                onCheckedChange={setHighlightSearchTerm}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Surlignage disponible uniquement en DOCX.
            </p>
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
