import { useState, useEffect } from 'react'
import type { AIProvider } from '@shared/types'
import { useSettingsStore, useUIStore } from '@/stores'
import {
  Button,
  Input,
  Textarea,
  Label,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui'
import { Save, RefreshCw, Bot, Info, X } from 'lucide-react'

const openaiModels = ['gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-4o-mini']
const anthropicModels = ['claude-sonnet-4-5-20250929', 'claude-opus-4-5-20251101']

export function SettingsModal() {
  const { settingsOpen, closeSettings } = useUIStore()
  const { settings, loading, saving, loadSettings, saveSettings, updateAI } = useSettingsStore()

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

  const models = settings?.ai.provider === 'openai' ? openaiModels : anthropicModels

  return (
    <Dialog open={settingsOpen} onOpenChange={(open) => !open && closeSettings()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Paramètres</DialogTitle>
        </DialogHeader>

        {loading || !settings ? (
          <div className="py-8 text-center text-muted-foreground">
            Chargement...
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* AI Settings */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-4 w-4" />
                  Intelligence Artificielle
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Fournisseur</Label>
                  <Select
                    value={settings.ai.provider}
                    onValueChange={(value) => updateAI('provider', value as AIProvider)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Clé API</Label>
                  <Input
                    type="password"
                    value={settings.ai.apiKey}
                    onChange={(e) => updateAI('apiKey', e.target.value)}
                    placeholder={settings.ai.provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Modèle</Label>
                  <Select
                    value={settings.ai.model}
                    onValueChange={(value) => updateAI('model', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map(model => (
                        <SelectItem key={model} value={model}>{model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Prompt système</Label>
                  <Textarea
                    value={settings.ai.prompt}
                    onChange={(e) => updateAI('prompt', e.target.value)}
                    className="min-h-[120px] resize-y"
                  />
                </div>
              </CardContent>
            </Card>

            {/* App Settings */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Info className="h-4 w-4" />
                  Application
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Version</p>
                    <Badge variant="secondary" className="mt-1">v{version}</Badge>
                  </div>
                  <Button variant="outline" size="sm" onClick={checkForUpdates} disabled={checking}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
                    Vérifier
                  </Button>
                </div>

                {updateStatus && (
                  <>
                    <Separator />
                    <p className="text-sm text-primary">{updateStatus}</p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Save button */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={closeSettings}>
                Annuler
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Sauvegarde...' : 'Sauvegarder'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
