import { useState, useEffect, useMemo } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { useSettingsStore, useUIStore } from '@/stores'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/lib/i18n'
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Separator,
  Badge,
  Dialog,
  DialogContent,
  ScrollArea,
} from '@/components/ui'
import { Save, RefreshCw, Bot, Download, Receipt, Globe, Shield } from 'lucide-react'
import type { TranscriptionLog } from '@shared/types'
import { AI_MODELS, calculateCost, formatCost, getAvailableProviders } from '@/lib/aiModels'

type SettingsTab = 'general' | 'ai' | 'privacy' | 'logs' | 'updates'

export function SettingsModal() {
  const { t } = useTranslation(['settings', 'common'])
  const {
    settingsOpen,
    closeSettings,
    updateStatus: globalUpdateStatus,
    updateVersion,
    updateProgress,
    updateError,
    setUpdateStatus: setGlobalUpdateStatus,
  } = useUIStore()
  const { settings, loading, saving, loadSettings, saveSettings, updateAI, updateApp } = useSettingsStore()

  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [version, setVersion] = useState('')
  const [checking, setChecking] = useState(false)
  const [logs, setLogs] = useState<TranscriptionLog[]>([])

  useEffect(() => {
    if (settingsOpen) {
      loadSettings()
      loadVersion()
      loadLogs()
    }
  }, [settingsOpen, loadSettings])

  const loadLogs = async () => {
    const data = await window.api.getLogs()
    setLogs(data)
  }

  const { totalCost, successCount } = useMemo(() => {
    let cost = 0
    let success = 0
    for (const log of logs) {
      cost += calculateCost(log)
      if (log.success) success++
    }
    return { totalCost: cost, successCount: success }
  }, [logs])

  const loadVersion = async () => {
    const v = await window.api.getVersion()
    setVersion(v)
  }

  const handleSave = async () => {
    if (!settings) return
    await saveSettings(settings)
    closeSettings()
  }

  const checkForUpdates = async () => {
    setChecking(true)
    setGlobalUpdateStatus('checking')
    const result = await window.api.checkUpdates()

    if (result.available) {
      setGlobalUpdateStatus('available')
    } else {
      setGlobalUpdateStatus('idle')
    }
    setChecking(false)
  }

  const handleStartUpdate = async () => {
    setGlobalUpdateStatus('downloading')
    await window.api.startUpdateDownload()
  }

  const handleInstallUpdate = () => {
    window.api.installUpdate()
  }

  const isUpdating = globalUpdateStatus === 'downloading'

  const handleModelChange = (modelValue: string) => {
    const model = AI_MODELS.find(m => m.value === modelValue)
    if (model) {
      updateAI('model', modelValue)
      updateAI('provider', model.provider as 'openai' | 'anthropic')
    }
  }

  const navItems = [
    { id: 'general' as const, label: t('settings:nav.general'), icon: Globe },
    { id: 'ai' as const, label: t('settings:nav.ai'), icon: Bot },
    { id: 'privacy' as const, label: t('settings:nav.privacy'), icon: Shield },
    { id: 'logs' as const, label: t('settings:nav.logs'), icon: Receipt },
    { id: 'updates' as const, label: t('settings:nav.updates'), icon: Download },
  ]

  return (
    <>
      {isUpdating && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-card p-8 rounded-lg shadow-lg text-center space-y-4 max-w-md">
            <RefreshCw className="h-12 w-12 mx-auto animate-spin text-primary" />
            <h2 className="text-xl font-semibold">{t('settings:updateOverlay.title')}</h2>
            <p className="text-muted-foreground">{t('settings:updateOverlay.description')}</p>
            <div className="w-full bg-muted rounded-full h-3">
              <div
                className="bg-primary h-3 rounded-full transition-all duration-300"
                style={{ width: `${updateProgress}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">{Math.round(updateProgress)}%</p>
          </div>
        </div>
      )}

      <Dialog open={settingsOpen} onOpenChange={(open) => !open && !isUpdating && closeSettings()}>
        <DialogContent className="max-w-3xl max-h-[80vh] p-0 overflow-hidden">
        {loading || !settings ? (
          <div className="py-8 text-center text-muted-foreground">{t('common:loading')}</div>
        ) : (
          <div className="flex h-[500px]">
            <div className="w-48 border-r bg-muted/30 p-4 flex flex-col">
              <h2 className="font-semibold text-lg mb-4 px-2">{t('settings:title')}</h2>
              <nav className="space-y-1">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                      activeTab === item.id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="flex-1 flex flex-col">
              <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'general' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium mb-4">{t('settings:nav.general')}</h3>
                      <div className="space-y-2 max-w-sm">
                        <Label>{t('settings:general.language')}</Label>
                        <Select
                          value={settings.app.language ?? 'fr'}
                          onValueChange={(v) => updateApp('language', v as SupportedLanguage)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SUPPORTED_LANGUAGES.map((lng) => (
                              <SelectItem key={lng} value={lng}>
                                {t(`common:language.${lng}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'ai' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium mb-4">{t('settings:ai.title')}</h3>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>{t('settings:ai.defaultModel')}</Label>
                          <Select
                            value={settings.ai.model}
                            onValueChange={handleModelChange}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t('settings:ai.selectModel')} />
                            </SelectTrigger>
                            <SelectContent>
                              {(['anthropic', 'openai'] as const).map(provider => {
                                const available = getAvailableProviders(settings.ai).has(provider)
                                const models = AI_MODELS.filter(m => m.provider === provider)
                                const label = provider === 'anthropic' ? 'Anthropic' : 'OpenAI'
                                return (
                                  <SelectGroup key={provider}>
                                    <SelectLabel>
                                      {label}{!available && ` — ${t('settings:ai.missingApiKey')}`}
                                    </SelectLabel>
                                    {models.map(model => (
                                      <SelectItem key={model.value} value={model.value} disabled={!available}>
                                        {model.label.replace(/^(Anthropic|OpenAI):\s*/, '')}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                )
                              })}
                            </SelectContent>
                          </Select>
                        </div>

                        <Separator />

                        <div className="space-y-2">
                          <Label>{t('settings:ai.anthropicKey')}</Label>
                          <Input
                            type="password"
                            value={settings.ai.anthropicApiKey || ''}
                            onChange={(e) => updateAI('anthropicApiKey', e.target.value)}
                            placeholder="sk-ant-..."
                          />
                          <p className="text-xs text-muted-foreground">
                            {t('settings:ai.anthropicKeyHint')}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label>{t('settings:ai.openaiKey')}</Label>
                          <Input
                            type="password"
                            value={settings.ai.openaiApiKey || ''}
                            onChange={(e) => updateAI('openaiApiKey', e.target.value)}
                            placeholder="sk-..."
                          />
                          <p className="text-xs text-muted-foreground">
                            {t('settings:ai.openaiKeyHint')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'privacy' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium mb-1">{t('settings:privacy.title')}</h3>
                      <p className="text-sm text-muted-foreground mb-6">
                        {t('settings:privacy.intro')}
                      </p>

                      <div className="rounded-lg border bg-card p-4 space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{t('settings:privacy.telemetryTitle')}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {t('settings:privacy.telemetryHint')}
                            </p>
                          </div>
                          <Button
                            variant={settings.app.telemetryEnabled ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => updateApp('telemetryEnabled', !settings.app.telemetryEnabled)}
                          >
                            {settings.app.telemetryEnabled
                              ? t('settings:privacy.enabled')
                              : t('settings:privacy.disabled')}
                          </Button>
                        </div>

                        <Separator />

                        <div>
                          <p className="text-xs font-medium mb-1.5">{t('settings:privacy.includedTitle')}</p>
                          <ul className="space-y-1 text-xs text-muted-foreground pl-4 list-disc">
                            {(t('settings:privacy.included', { returnObjects: true }) as string[]).map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <p className="text-xs font-medium mb-1.5">{t('settings:privacy.excludedTitle')}</p>
                          <ul className="space-y-1 text-xs text-muted-foreground pl-4 list-disc">
                            {(t('settings:privacy.excluded', { returnObjects: true }) as string[]).map((line, i) => (
                              <li key={i}>{line}</li>
                            ))}
                          </ul>
                        </div>

                        <p className="text-xs text-muted-foreground italic">
                          {t('settings:privacy.note')}
                        </p>

                        <p className="text-xs text-muted-foreground">
                          <Trans
                            i18nKey="settings:privacy.recipient"
                            components={{ bold: <strong /> }}
                          />
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'logs' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium mb-4">{t('settings:logs.title')}</h3>

                      <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="p-4 bg-muted/50 rounded-lg text-center">
                          <p className="text-2xl font-bold">{logs.length}</p>
                          <p className="text-xs text-muted-foreground">{t('settings:logs.transcriptions')}</p>
                        </div>
                        <div className="p-4 bg-muted/50 rounded-lg text-center">
                          <p className="text-2xl font-bold">{successCount}</p>
                          <p className="text-xs text-muted-foreground">{t('settings:logs.successful')}</p>
                        </div>
                        <div className="p-4 bg-green-500/10 rounded-lg text-center">
                          <p className="text-2xl font-bold text-green-600">{formatCost(totalCost)}</p>
                          <p className="text-xs text-muted-foreground">{t('settings:logs.totalCost')}</p>
                        </div>
                      </div>

                      {logs.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">{t('settings:logs.empty')}</p>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground mb-2 italic">
                            {t('settings:logs.costDisclaimer')}
                          </p>
                          <ScrollArea className="h-[280px] border rounded-lg">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50 sticky top-0">
                              <tr>
                                <th className="text-left p-2 font-medium">{t('settings:logs.table.date')}</th>
                                <th className="text-left p-2 font-medium">{t('settings:logs.table.model')}</th>
                                <th className="text-right p-2 font-medium">{t('settings:logs.table.tokens')}</th>
                                <th className="text-right p-2 font-medium">{t('settings:logs.table.cost')}</th>
                                <th className="text-center p-2 font-medium">{t('settings:logs.table.status')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...logs].reverse().map((log, idx) => {
                                const cost = calculateCost(log)
                                const modelLabel = AI_MODELS.find(m => m.value === log.model)?.label || log.model
                                return (
                                  <tr key={idx} className="border-t hover:bg-muted/30">
                                    <td className="p-2 text-muted-foreground">
                                      {new Date(log.date).toLocaleDateString(
                                        settings.app.language === 'en' ? 'en-US' : 'fr-FR',
                                        { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
                                      )}
                                    </td>
                                    <td className="p-2 truncate max-w-[150px]" title={modelLabel}>
                                      {modelLabel.split(': ')[1] || modelLabel}
                                    </td>
                                    <td className="p-2 text-right font-mono text-xs">
                                      {(log.inputTokens + log.outputTokens).toLocaleString()}
                                    </td>
                                    <td className="p-2 text-right font-mono text-xs">
                                      {formatCost(cost)}
                                    </td>
                                    <td className="p-2 text-center">
                                      {log.success ? (
                                        <Badge variant="default" className="bg-green-500/20 text-green-600 text-xs">
                                          {t('settings:logs.statusOk')}
                                        </Badge>
                                      ) : (
                                        <Badge variant="destructive" className="text-xs">
                                          {t('settings:logs.statusError')}
                                        </Badge>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </ScrollArea>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'updates' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium mb-4">{t('settings:updates.title')}</h3>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                          <div>
                            <p className="font-medium">{t('settings:updates.currentVersion')}</p>
                            <Badge variant="secondary" className="mt-1">v{version}</Badge>
                          </div>
                          <Button variant="outline" onClick={checkForUpdates} disabled={checking || isUpdating}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
                            {t('settings:updates.check')}
                          </Button>
                        </div>

                        {globalUpdateStatus === 'available' && updateVersion && (
                          <div className="p-4 bg-primary/10 rounded-lg space-y-3">
                            <p className="text-sm font-medium text-primary">
                              {t('settings:updates.available', { version: updateVersion })}
                            </p>
                            <Button onClick={handleStartUpdate} className="w-full">
                              <Download className="h-4 w-4 mr-2" />
                              {t('settings:updates.downloadInstall')}
                            </Button>
                          </div>
                        )}

                        {globalUpdateStatus === 'downloading' && (
                          <div className="p-4 bg-muted rounded-lg space-y-3">
                            <p className="text-sm font-medium">{t('settings:updates.downloading')}</p>
                            <div className="w-full bg-muted-foreground/20 rounded-full h-2">
                              <div
                                className="bg-primary h-2 rounded-full transition-all duration-300"
                                style={{ width: `${updateProgress}%` }}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground text-center">
                              {Math.round(updateProgress)}%
                            </p>
                          </div>
                        )}

                        {globalUpdateStatus === 'ready' && (
                          <div className="p-4 bg-green-500/10 rounded-lg space-y-3">
                            <p className="text-sm font-medium text-green-600">
                              {t('settings:updates.ready')}
                            </p>
                            <Button onClick={handleInstallUpdate} className="w-full" variant="default">
                              {t('settings:updates.restartInstall')}
                            </Button>
                          </div>
                        )}

                        {globalUpdateStatus === 'error' && updateError && (
                          <div className="p-4 bg-destructive/10 rounded-lg">
                            <p className="text-sm text-destructive">
                              {t('settings:updates.error', { message: updateError })}
                            </p>
                          </div>
                        )}

                        {globalUpdateStatus === 'idle' && !checking && (
                          <p className="text-sm text-muted-foreground">{t('settings:updates.upToDate')}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t p-4 flex justify-end gap-2">
                <Button variant="outline" onClick={closeSettings}>
                  {t('common:cancel')}
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? t('common:saving') : t('common:save')}
                </Button>
              </div>
            </div>
          </div>
        )}
        </DialogContent>
      </Dialog>
    </>
  )
}
