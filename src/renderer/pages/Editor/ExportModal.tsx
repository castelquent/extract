import { FileText, FileIcon, FileType } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
} from '@/components/ui'

export type ExportFormat = 'pdf' | 'docx' | 'txt'

interface ExportModalProps {
  open: boolean
  onClose: () => void
  onExport: (format: ExportFormat) => void
}

export function ExportModal({ open, onClose, onExport }: ExportModalProps) {
  const handleExport = (format: ExportFormat) => {
    onExport(format)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Exporter l'élément</DialogTitle>
        </DialogHeader>
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
