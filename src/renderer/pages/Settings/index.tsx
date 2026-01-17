import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AIProvider } from '@shared/types'
import { useSettingsStore } from '@/stores'
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
} from '@/components/ui'
import { ArrowLeft, Save, RefreshCw, Bot, Info } from 'lucide-react'

const openaiModels = ['gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-4o-mini']
const anthropicModels = ['claude-sonnet-4-5-20250929', 'claude-opus-4-5-20251101']

export function SettingsPage() {
  const navigate = useNavigate()
  const { settings, loading, saving, loadSettings, saveSettings, updateAI } = useSettingsStore()

  // Local state for version/updates (not part of settings store)
  const [version, setVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<string>('')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    loadSettings()
    loadVersion()
  }, [loadSettings])

  const loadVersion = async () => {
    const v = await window.api.getVersion()
    setVersion(v)
  }

  const handleSave = async () => {
    if (!settings) return
    await saveSettings(settings)
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

  if (loading || !settings) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    )
  }

  const models = settings.ai.provider === 'openai' ? openaiModels : anthropicModels

  return (
    <div className="min-h-screen p-8 max-w-3xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Paramètres</h1>
          <p className="text-muted-foreground mt-1">Configuration de l'application</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour
        </Button>
      </header>

      <div className="space-y-6">
        {/* AI Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
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
                className="min-h-[150px] resize-y"
              />
            </div>
          </CardContent>
        </Card>

        {/* App Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              Application
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Version</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary">v{version}</Badge>
                </div>
              </div>
              <Button variant="outline" onClick={checkForUpdates} disabled={checking}>
                <RefreshCw className={`h-4 w-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
                Vérifier les mises à jour
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
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </Button>
        </div>
      </div>
    </div>
  )
}
