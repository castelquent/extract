// Dialog to move one or more articles either to another dossier inside the
// current project, or to a different project entirely (with optional target dossier).
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui'
import type {
  ArticleMoveTarget,
  DossierView,
  ProjectView,
} from '@shared/types'
import { useProjectsStoreV2 } from '@/stores'

interface MoveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentProjectId: string
  dossiers: DossierView[]
  articleCount: number
  onConfirm: (target: ArticleMoveTarget) => Promise<void>
}

const ORPHAN_VALUE = '__orphan__'

export function MoveDialog({
  open,
  onOpenChange,
  currentProjectId,
  dossiers,
  articleCount,
  onConfirm,
}: MoveDialogProps) {
  const { t } = useTranslation(['articles', 'common'])
  const { projects, loadProjects } = useProjectsStoreV2()
  const [tab, setTab] = useState<'dossier' | 'project'>('dossier')
  const [dossierTarget, setDossierTarget] = useState<string>(ORPHAN_VALUE)
  const [targetProjectId, setTargetProjectId] = useState<string>('')
  const [targetProjectDossier, setTargetProjectDossier] = useState<string>(ORPHAN_VALUE)
  const [targetProjectDossiers, setTargetProjectDossiers] = useState<DossierView[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) loadProjects()
  }, [open, loadProjects])

  useEffect(() => {
    if (!targetProjectId) {
      setTargetProjectDossiers([])
      return
    }
    window.api.v2_dossiersList(targetProjectId).then(setTargetProjectDossiers)
  }, [targetProjectId])

  const otherProjects = projects.filter((p) => p.id !== currentProjectId)

  const handleConfirm = async () => {
    setSubmitting(true)
    if (tab === 'dossier') {
      const target: ArticleMoveTarget = {
        dossierId: dossierTarget === ORPHAN_VALUE ? null : dossierTarget,
      }
      await onConfirm(target)
    } else {
      const target: ArticleMoveTarget = {
        targetProjectId,
        targetDossierId: targetProjectDossier === ORPHAN_VALUE ? null : targetProjectDossier,
      }
      await onConfirm(target)
    }
    setSubmitting(false)
    onOpenChange(false)
  }

  const canConfirm = tab === 'dossier' ? true : !!targetProjectId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('articles:moveDialog.title', { count: articleCount })}</DialogTitle>
          <DialogDescription>
            {t('articles:moveDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'dossier' | 'project')}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="dossier">{t('articles:moveDialog.tabInProject')}</TabsTrigger>
            <TabsTrigger value="project">{t('articles:moveDialog.tabOtherProject')}</TabsTrigger>
          </TabsList>

          <TabsContent value="dossier" className="space-y-3 pt-4">
            <Label>{t('articles:moveDialog.destFolder')}</Label>
            <Select value={dossierTarget} onValueChange={setDossierTarget}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ORPHAN_VALUE}>{t('common:noFolder')}</SelectItem>
                {dossiers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </TabsContent>

          <TabsContent value="project" className="space-y-3 pt-4">
            <div className="space-y-2">
              <Label>{t('articles:moveDialog.destProject')}</Label>
              <Select value={targetProjectId} onValueChange={setTargetProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('articles:moveDialog.destProjectPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {otherProjects.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      {t('articles:moveDialog.noOtherProject')}
                    </SelectItem>
                  ) : (
                    otherProjects.map((p: ProjectView) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            {targetProjectId && (
              <div className="space-y-2">
                <Label>{t('articles:moveDialog.destFolderInTarget')}</Label>
                <Select value={targetProjectDossier} onValueChange={setTargetProjectDossier}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ORPHAN_VALUE}>{t('common:noFolder')}</SelectItem>
                    {targetProjectDossiers.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('common:cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm || submitting}>
            {submitting ? t('articles:moveDialog.submitting') : t('articles:moveDialog.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
