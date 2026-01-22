import { useState, useEffect } from 'react'
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
} from '@/components/ui'
import { Save, RefreshCw, Bot, Download } from 'lucide-react'

type SettingsTab = 'ai' | 'updates'

const AI_MODELS = [
  { value: 'claude-opus-4-5-20251101', label: 'Anthropic: Claude Opus 4.5', provider: 'anthropic' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Anthropic: Claude Sonnet 4.5', provider: 'anthropic' },
  { value: 'claude-haiku-4-5-20251001', label: 'Anthropic: Claude Haiku 4.5', provider: 'anthropic' },
  { value: 'gpt-5.2', label: 'OpenAI: GPT-5.2', provider: 'openai' },
  { value: 'gpt-5.2-pro', label: 'OpenAI: GPT-5.2 Pro', provider: 'openai' },
  { value: 'gpt-5-mini', label: 'OpenAI: GPT-5 Mini', provider: 'openai' },
]

export function SettingsModal() {
  const { settingsOpen, closeSettings } = useUIStore()
  const { settings, loading, saving, loadSettings, saveSettings, updateAI } = useSettingsStore()

  const [activeTab, setActiveTab] = useState<SettingsTab>('ai')
  const [version, setVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<string>('')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (settingsOpen) {
      loadSettings()
      loadVersion()
    }
  }, [settingsOpen, loadSettings])

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
    setUpdateStatus('Vérification...')
    const result = await window.api.checkUpdates()

    if (result.available) {
      setUpdateStatus(`Mise à jour disponible : v${result.version}`)
    } else {
      setUpdateStatus('Vous êtes à jour !')
    }
    setChecking(false)
  }

  const handleModelChange = (modelValue: string) => {
    const model = AI_MODELS.find(m => m.value === modelValue)
    if (model) {
      updateAI('model', modelValue)
      updateAI('provider', model.provider as 'openai' | 'anthropic')
    }
  }

  const navItems = [
    { id: 'ai' as const, label: 'IA', icon: Bot },
    { id: 'updates' as const, label: 'Mise à jour', icon: Download },
  ]

  return (
    <Dialog open={settingsOpen} onOpenChange={(open) => !open && closeSettings()}>
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
                          <Button variant="outline" onClick={checkForUpdates} disabled={checking}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
                            Vérifier les mises à jour
                          </Button>
                        </div>

                        {updateStatus && (
                          <p className="text-sm text-primary p-3 bg-primary/10 rounded-md">
                            {updateStatus}
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
  )
}
