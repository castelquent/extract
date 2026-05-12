import { useState, useEffect, useMemo } from 'react'
import { useSettingsStore, useUIStore } from '@/stores'
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Badge,
  Dialog,
  DialogContent,
  ScrollArea,
} from '@/components/ui'
import { Save, RefreshCw, Bot, Download, Receipt } from 'lucide-react'
import type { TranscriptionLog } from '@shared/types'

type SettingsTab = 'ai' | 'logs' | 'updates'

const AI_MODELS = [
  { value: 'claude-opus-4-5-20251101', label: 'Anthropic: Claude Opus 4.5', provider: 'anthropic' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Anthropic: Claude Sonnet 4.5', provider: 'anthropic' },
  { value: 'claude-haiku-4-5-20251001', label: 'Anthropic: Claude Haiku 4.5', provider: 'anthropic' },
  { value: 'gpt-5.2', label: 'OpenAI: GPT-5.2', provider: 'openai' },
  { value: 'gpt-5.2-pro', label: 'OpenAI: GPT-5.2 Pro', provider: 'openai' },
  { value: 'gpt-5-mini', label: 'OpenAI: GPT-5 Mini', provider: 'openai' },
]

// Prix par million de tokens (en USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-opus-4-5-20251101': { input: 5, output: 25 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  // OpenAI
  'gpt-5.2': { input: 1.75, output: 14 },
  'gpt-5.2-pro': { input: 21, output: 168 },
  'gpt-5-mini': { input: 0.25, output: 2 },
}

function calculateCost(log: TranscriptionLog): number {
  const pricing = MODEL_PRICING[log.model]
  if (!pricing) return 0

  const inputCost = (log.inputTokens / 1_000_000) * pricing.input
  const outputCost = (log.outputTokens / 1_000_000) * pricing.output
  return inputCost + outputCost
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `${(cost * 100).toFixed(4)}c`
  return `$${cost.toFixed(4)}`
}

export function SettingsModal() {
  const {
    settingsOpen,
    closeSettings,
    updateStatus: globalUpdateStatus,
    updateVersion,
    updateProgress,
    updateError,
    setUpdateStatus: setGlobalUpdateStatus,
  } = useUIStore()
  const { settings, loading, saving, loadSettings, saveSettings, updateAI } = useSettingsStore()

  const [activeTab, setActiveTab] = useState<SettingsTab>('ai')
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
    { id: 'ai' as const, label: 'IA', icon: Bot },
    { id: 'logs' as const, label: 'Logs', icon: Receipt },
    { id: 'updates' as const, label: 'Mise à jour', icon: Download },
  ]

  return (
    <>
      {/* Overlay de blocage pendant la mise à jour */}
      {isUpdating && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-card p-8 rounded-lg shadow-lg text-center space-y-4 max-w-md">
            <RefreshCw className="h-12 w-12 mx-auto animate-spin text-primary" />
            <h2 className="text-xl font-semibold">Mise à jour en cours</h2>
            <p className="text-muted-foreground">
              Veuillez patienter pendant le téléchargement...
            </p>
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
          <div className="py-8 text-center text-muted-foreground">
            Chargement...
          </div>
        ) : (
          <div className="flex h-[500px]">
            {/* Sidebar */}
            <div className="w-48 border-r bg-muted/30 p-4 flex flex-col">
              <h2 className="font-semibold text-lg mb-4 px-2">Paramètres</h2>
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

            {/* Content */}
            <div className="flex-1 flex flex-col">
              <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'ai' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium mb-4">Intelligence Artificielle</h3>

                      {/* Model Selection */}
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Modèle par défaut</Label>
                          <Select
                            value={settings.ai.model}
                            onValueChange={handleModelChange}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Sélectionner un modèle" />
                            </SelectTrigger>
                            <SelectContent>
                              {AI_MODELS.map(model => (
                                <SelectItem key={model.value} value={model.value}>
                                  {model.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <Separator />

                        {/* Anthropic API Key */}
                        <div className="space-y-2">
                          <Label>Clé API Anthropic</Label>
                          <Input
                            type="password"
                            value={settings.ai.anthropicApiKey || ''}
                            onChange={(e) => updateAI('anthropicApiKey', e.target.value)}
                            placeholder="sk-ant-..."
                          />
                          <p className="text-xs text-muted-foreground">
                            Requis pour utiliser les modèles Claude
                          </p>
                        </div>

                        {/* OpenAI API Key */}
                        <div className="space-y-2">
                          <Label>Clé API OpenAI</Label>
                          <Input
                            type="password"
                            value={settings.ai.openaiApiKey || ''}
                            onChange={(e) => updateAI('openaiApiKey', e.target.value)}
                            placeholder="sk-..."
                          />
                          <p className="text-xs text-muted-foreground">
                            Requis pour utiliser les modèles GPT
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'logs' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium mb-4">Logs de transcription</h3>

                      {/* Summary */}
                      <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="p-4 bg-muted/50 rounded-lg text-center">
                          <p className="text-2xl font-bold">{logs.length}</p>
                          <p className="text-xs text-muted-foreground">Transcriptions</p>
                        </div>
                        <div className="p-4 bg-muted/50 rounded-lg text-center">
                          <p className="text-2xl font-bold">{successCount}</p>
                          <p className="text-xs text-muted-foreground">Réussies</p>
                        </div>
                        <div className="p-4 bg-green-500/10 rounded-lg text-center">
                          <p className="text-2xl font-bold text-green-600">{formatCost(totalCost)}</p>
                          <p className="text-xs text-muted-foreground">Coût total</p>
                        </div>
                      </div>

                      {/* Logs list */}
                      {logs.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">
                          Aucune transcription enregistrée
                        </p>
                      ) : (
                        <ScrollArea className="h-[280px] border rounded-lg">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50 sticky top-0">
                              <tr>
                                <th className="text-left p-2 font-medium">Date</th>
                                <th className="text-left p-2 font-medium">Modèle</th>
                                <th className="text-right p-2 font-medium">Tokens</th>
                                <th className="text-right p-2 font-medium">Coût</th>
                                <th className="text-center p-2 font-medium">Statut</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...logs].reverse().map((log, idx) => {
                                const cost = calculateCost(log)
                                const modelLabel = AI_MODELS.find(m => m.value === log.model)?.label || log.model
                                return (
                                  <tr key={idx} className="border-t hover:bg-muted/30">
                                    <td className="p-2 text-muted-foreground">
                                      {new Date(log.date).toLocaleDateString('fr-FR', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
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
                                        <Badge variant="default" className="bg-green-500/20 text-green-600 text-xs">OK</Badge>
                                      ) : (
                                        <Badge variant="destructive" className="text-xs">Erreur</Badge>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </ScrollArea>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'updates' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium mb-4">Mise à jour</h3>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                          <div>
                            <p className="font-medium">Version actuelle</p>
                            <Badge variant="secondary" className="mt-1">v{version}</Badge>
                          </div>
                          <Button variant="outline" onClick={checkForUpdates} disabled={checking || isUpdating}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
                            Vérifier les mises à jour
                          </Button>
                        </div>

                        {/* Status messages */}
                        {globalUpdateStatus === 'available' && updateVersion && (
                          <div className="p-4 bg-primary/10 rounded-lg space-y-3">
                            <p className="text-sm font-medium text-primary">
                              Mise à jour disponible : v{updateVersion}
                            </p>
                            <Button onClick={handleStartUpdate} className="w-full">
                              <Download className="h-4 w-4 mr-2" />
                              Télécharger et installer
                            </Button>
                          </div>
                        )}

                        {globalUpdateStatus === 'downloading' && (
                          <div className="p-4 bg-muted rounded-lg space-y-3">
                            <p className="text-sm font-medium">Téléchargement en cours...</p>
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
                              Mise à jour prête à être installée
                            </p>
                            <Button onClick={handleInstallUpdate} className="w-full" variant="default">
                              Redémarrer et installer
                            </Button>
                          </div>
                        )}

                        {globalUpdateStatus === 'error' && updateError && (
                          <div className="p-4 bg-destructive/10 rounded-lg">
                            <p className="text-sm text-destructive">
                              Erreur : {updateError}
                            </p>
                          </div>
                        )}

                        {globalUpdateStatus === 'idle' && !checking && (
                          <p className="text-sm text-muted-foreground">
                            Vous êtes à jour !
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t p-4 flex justify-end gap-2">
                <Button variant="outline" onClick={closeSettings}>
                  Annuler
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Sauvegarde...' : 'Sauvegarder'}
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
