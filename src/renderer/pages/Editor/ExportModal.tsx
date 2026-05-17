import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ExportOptions } from '@shared/types'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Label,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui'

export type ExportFormat = 'pdf' | 'docx' | 'txt' | 'png'

// Options the user chose inside the modal. Forwarded to the export handler.
export interface ExportModalChoices {
  // PDF / DOCX
  mode: 'single' | 'separated'
  // PNG
  pngMode: 'per-zone' | 'per-element'
  // Naming (separated mode + PNG)
  orderPrefix: boolean
  // Inline source line at end of each article (PDF / DOCX / TXT)
  showSource: boolean
  // Embed extract.pdf as image(s) at end of article (PDF / DOCX)
  includeSourceImages: boolean
  // Insert full-page dossier titles between groups (single-file PDF/DOCX/TXT only)
  includeDossierTitles: boolean
  // Yellow-highlight occurrences of the search term (PDF / DOCX)
  highlightSearchTerm: boolean
}

interface ExportModalProps {
  open: boolean
  onClose: () => void
  onExport: (format: ExportFormat, choices: ExportModalChoices) => void
  articleCount?: number
  // The caller passes this when its scope spans multiple dossiers — only
  // then does the "Insert dossier titles" knob make sense in single-file mode.
  showDossierTitleOption?: boolean
  // Optional search-result highlight term; when set, the "Surligner X" toggle
  // is offered for PDF / DOCX.
  highlightTerm?: string
}

const FORMAT_VALUES: ExportFormat[] = ['pdf', 'docx', 'txt', 'png']

export function ExportModal({
  open,
  onClose,
  onExport,
  articleCount = 1,
  showDossierTitleOption = false,
  highlightTerm,
}: ExportModalProps) {
  const { t } = useTranslation(['export', 'common'])
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [mode, setMode] = useState<'single' | 'separated'>('single')
  const [pngMode, setPngMode] = useState<'per-zone' | 'per-element'>('per-element')
  const [orderPrefix, setOrderPrefix] = useState(false)
  const [showSource, setShowSource] = useState(true)
  const [includeSourceImages, setIncludeSourceImages] = useState(false)
  const [includeDossierTitles, setIncludeDossierTitles] = useState(false)
  const [highlightSearchTerm, setHighlightSearchTerm] = useState(true)

  const handleExport = () => {
    onExport(format, {
      mode,
      pngMode,
      orderPrefix,
      showSource,
      includeSourceImages,
      includeDossierTitles,
      highlightSearchTerm,
    })
    onClose()
  }

  const title = t('export:title', { count: articleCount })

  // Visibility flags by format
  const supportsMode = format === 'pdf' || format === 'docx'
  const supportsSourceLine = format === 'pdf' || format === 'docx' || format === 'txt'
  const supportsSourceImages = format === 'pdf' || format === 'docx'
  const supportsHighlight = (format === 'pdf' || format === 'docx') && !!highlightTerm
  // Dossier titles only matter in single-file mode for PDF/DOCX/TXT (and the
  // caller has to be a scope that spans dossiers).
  const supportsDossierTitles =
    showDossierTitleOption &&
    (format === 'pdf' || format === 'docx' || format === 'txt') &&
    (!supportsMode || mode === 'single')
  // Order-prefix toggle: shown only when the output is a multi-file ZIP, so
  // PNG always, separated mode for PDF/DOCX. Single-element edge case (no
  // ZIP wrapper) still benefits from a consistent default — the backend
  // applies the prefix to the lone file too.
  const supportsOrderPrefix =
    format === 'png' || (supportsMode && mode === 'separated')

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Format */}
          <div className="grid grid-cols-[120px_1fr] items-center gap-3">
            <Label htmlFor="export-format">{t('export:format')}</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
              <SelectTrigger id="export-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMAT_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`export:formatOptions.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mode PDF/DOCX */}
          {supportsMode && (
            <div className="grid grid-cols-[120px_1fr] items-center gap-3">
              <Label htmlFor="export-mode">{t('export:output')}</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as 'single' | 'separated')}>
                <SelectTrigger id="export-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">{t('export:outputOptions.single')}</SelectItem>
                  <SelectItem value="separated">{t('export:outputOptions.separated')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Mode PNG */}
          {format === 'png' && (
            <div className="grid grid-cols-[120px_1fr] items-center gap-3">
              <Label htmlFor="export-png-mode">{t('export:granularity')}</Label>
              <Select value={pngMode} onValueChange={(v) => setPngMode(v as 'per-zone' | 'per-element')}>
                <SelectTrigger id="export-png-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="per-element">{t('export:pngOptions.perElement')}</SelectItem>
                  <SelectItem value="per-zone">{t('export:pngOptions.perZone')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Toggles */}
          <div className="space-y-2 pt-1">
            {supportsDossierTitles && (
              <ToggleRow
                id="export-include-dossier-titles"
                label={t('export:toggles.dossierTitles')}
                checked={includeDossierTitles}
                onChange={setIncludeDossierTitles}
              />
            )}
            {supportsHighlight && (
              <ToggleRow
                id="export-highlight-term"
                label={t('export:toggles.highlight', { term: highlightTerm })}
                checked={highlightSearchTerm}
                onChange={setHighlightSearchTerm}
              />
            )}
            {supportsSourceLine && (
              <ToggleRow
                id="export-show-source"
                label={t('export:toggles.showSource')}
                checked={showSource}
                onChange={setShowSource}
              />
            )}
            {supportsSourceImages && (
              <ToggleRow
                id="export-source-images"
                label={t('export:toggles.sourceImages')}
                checked={includeSourceImages}
                onChange={setIncludeSourceImages}
              />
            )}
            {supportsOrderPrefix && (
              <ToggleRow
                id="export-order-prefix"
                label={t('export:toggles.orderPrefix')}
                checked={orderPrefix}
                onChange={setOrderPrefix}
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common:cancel')}
          </Button>
          <Button onClick={handleExport}>{t('export:submit')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Translate the user's modal selections into the ExportOptions shape the
// backend IPC handlers expect. Used by every export caller (Editor, Project,
// ArticlesView, Search) so the wiring stays consistent.
export function buildExportOptions(
  format: ExportFormat,
  choices: ExportModalChoices,
  extras: {
    // Built by the caller when grouping by dossier — only used in single-file
    // mode for PDF/DOCX/TXT, ignored in separated/PNG.
    dossierTitles?: { beforeArticleId: string; title: string }[]
    highlight?: string
  } = {}
): ExportOptions {
  const opts: ExportOptions = {}
  if (format === 'pdf' || format === 'docx') {
    opts.mode = choices.mode
  }
  if (format === 'png') {
    opts.pngMode = choices.pngMode
  }
  if (choices.orderPrefix) opts.orderPrefix = true
  if (format === 'pdf' || format === 'docx' || format === 'txt') {
    opts.showSource = choices.showSource
  }
  if (format === 'pdf' || format === 'docx') {
    opts.includeSourceImages = choices.includeSourceImages
  }
  // Dossier titles only land in single-file mode for PDF/DOCX/TXT.
  if (
    choices.includeDossierTitles &&
    (format === 'pdf' || format === 'docx' || format === 'txt') &&
    (format === 'txt' || choices.mode === 'single') &&
    extras.dossierTitles &&
    extras.dossierTitles.length > 0
  ) {
    opts.dossierTitles = extras.dossierTitles
  }
  if (choices.highlightSearchTerm && extras.highlight) {
    opts.highlight = extras.highlight
  }
  return opts
}

function ToggleRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <Label htmlFor={id} className="cursor-pointer">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
