import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '@/stores'
import { Button, Input, Label } from '@/components/ui'
import {
  KeyRound,
  ExternalLink,
  Lock,
  ChevronLeft,
  Check,
  Zap,
  Brain,
} from 'lucide-react'

type Provider = 'anthropic' | 'openai'

export function OnboardingPage() {
  const navigate = useNavigate()
  const { settings, loadSettings, saveSettings } = useSettingsStore()

  const [step, setStep] = useState<1 | 2>(1)
  const [provider, setProvider] = useState<Provider | null>(null)
  const [keyValue, setKeyValue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!settings) loadSettings()
  }, [settings, loadSettings])

  // Pre-fill key from existing settings when user reaches step 2
  useEffect(() => {
    if (step !== 2 || !provider || !settings) return
    const existing =
      provider === 'anthropic'
        ? settings.ai.anthropicApiKey
        : settings.ai.openaiApiKey
    setKeyValue(existing ?? '')
  }, [step, provider, settings])

  const persist = async (saveKey: boolean) => {
    if (!settings) return
    setSaving(true)
    const nextAi = { ...settings.ai }
    if (saveKey && provider) {
      const trimmed = keyValue.trim() || undefined
      if (provider === 'anthropic') nextAi.anthropicApiKey = trimmed
      else nextAi.openaiApiKey = trimmed
    }
    const next = {
      ...settings,
      ai: nextAi,
      app: { ...settings.app, onboardingSeen: true },
    }
    await saveSettings(next)
    setSaving(false)
    navigate('/')
  }

  const handleNext = () => {
    if (step === 1 && provider) setStep(2)
  }
  const handleBack = () => setStep(1)
  const handleSkip = () => persist(false)
  const handleFinish = () => persist(true)

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-background p-8">
      <div className="w-full max-w-2xl">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <StepDot index={1} current={step} label="Fournisseur" />
          <div className="h-px w-12 bg-border" />
          <StepDot index={2} current={step} label="Clé API" />
        </div>

        {/* Step content */}
        {step === 1 && (
          <StepChooseProvider selected={provider} onSelect={setProvider} />
        )}
        {step === 2 && provider && (
          <StepConfigureKey
            provider={provider}
            keyValue={keyValue}
            onChange={setKeyValue}
          />
        )}

        {/* Footer */}
        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={handleSkip} disabled={saving}>
            Plus tard
          </Button>
          <div className="flex items-center gap-2">
            {step === 2 && (
              <Button variant="outline" size="sm" onClick={handleBack} disabled={saving}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Retour
              </Button>
            )}
            {step === 1 ? (
              <Button size="sm" onClick={handleNext} disabled={!provider}>
                Suivant
              </Button>
            ) : (
              <Button size="sm" onClick={handleFinish} disabled={saving}>
                {saving ? 'Sauvegarde...' : 'Terminer'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StepDot({ index, current, label }: { index: 1 | 2; current: 1 | 2; label: string }) {
  const done = current > index
  const active = current === index
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium border ${
          done
            ? 'bg-primary text-primary-foreground border-primary'
            : active
              ? 'border-primary text-primary'
              : 'border-border text-muted-foreground'
        }`}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : index}
      </div>
      <span className={`text-sm ${active || done ? 'text-foreground' : 'text-muted-foreground'}`}>
        {label}
      </span>
    </div>
  )
}

function StepChooseProvider({
  selected,
  onSelect,
}: {
  selected: Provider | null
  onSelect: (p: Provider) => void
}) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Bienvenue sur ExtrAct</h1>
        <p className="text-muted-foreground">
          Choisissez le fournisseur d'IA que vous préférez utiliser pour la transcription.
          Vous pourrez toujours changer plus tard dans les Paramètres.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ProviderCard
          provider="anthropic"
          selected={selected === 'anthropic'}
          onClick={() => onSelect('anthropic')}
          icon={Brain}
          title="Anthropic (Claude)"
          tagline="Précision maximale"
          description="Recommandé pour les documents anciens, l'écriture manuscrite et les mises en page complexes. Légèrement plus cher mais plus fidèle au texte d'origine."
        />
        <ProviderCard
          provider="openai"
          selected={selected === 'openai'}
          onClick={() => onSelect('openai')}
          icon={Zap}
          title="OpenAI (GPT)"
          tagline="Rapide et économique"
          description="Idéal pour les documents imprimés modernes et propres. Plus rapide et un peu moins cher à qualité équivalente."
        />
      </div>
    </div>
  )
}

function ProviderCard({
  selected,
  onClick,
  icon: Icon,
  title,
  tagline,
  description,
}: {
  provider: Provider
  selected: boolean
  onClick: () => void
  icon: typeof Brain
  title: string
  tagline: string
  description: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start text-left p-5 rounded-lg border-2 transition-all ${
        selected
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30'
      }`}
    >
      <div className="w-full flex items-start justify-between mb-3">
        <Icon className={`h-6 w-6 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
        {selected && (
          <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
            <Check className="h-3 w-3" />
          </div>
        )}
      </div>
      <h3 className="font-semibold mb-0.5">{title}</h3>
      <p className={`text-xs mb-2 ${selected ? 'text-primary' : 'text-muted-foreground'}`}>
        {tagline}
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </button>
  )
}

function StepConfigureKey({
  provider,
  keyValue,
  onChange,
}: {
  provider: Provider
  keyValue: string
  onChange: (v: string) => void
}) {
  const config =
    provider === 'anthropic'
      ? {
          providerName: 'Anthropic',
          consoleUrl: 'https://console.anthropic.com/settings/keys',
          consoleLabel: 'Ouvrir la console Anthropic',
          prefix: 'sk-ant-',
          steps: [
            'Créez un compte Anthropic (ou connectez-vous si vous en avez déjà un).',
            'Dans Plans & Billing, ajoutez du crédit. 5 à 10 $ suffisent pour démarrer — vous ne payez que ce que vous consommez.',
            'Dans API Keys, cliquez sur Create Key, copiez la clé et collez-la ci-dessous.',
          ] as const,
        }
      : {
          providerName: 'OpenAI',
          consoleUrl: 'https://platform.openai.com/api-keys',
          consoleLabel: 'Ouvrir la plateforme OpenAI',
          prefix: 'sk-',
          steps: [
            'Créez un compte OpenAI (ou connectez-vous si vous en avez déjà un).',
            'Dans Billing, ajoutez du crédit. 5 à 10 $ suffisent pour démarrer — vous ne payez que ce que vous consommez.',
            'Dans API keys, cliquez sur Create new secret key, copiez la clé et collez-la ci-dessous.',
          ] as const,
        }

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Configurer votre clé {config.providerName}</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Quand vous lancez une transcription, ExtrAct envoie chaque zone que vous avez
          découpée à l'IA de <strong>{config.providerName}</strong>, qui lit l'image et
          renvoie le texte. La clé ci-dessous identifie votre compte chez eux. Vous payez {config.providerName} directement,
          à la consommation, à hauteur de quelques centimes par document.
        </p>
      </div>

      <ol className="space-y-2.5">
        {config.steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="shrink-0 w-6 h-6 rounded-full bg-muted text-xs flex items-center justify-center font-medium">
              {i + 1}
            </span>
            <span className="pt-0.5 text-muted-foreground">{s}</span>
          </li>
        ))}
      </ol>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => window.api.openExternal(config.consoleUrl)}
      >
        <ExternalLink className="h-4 w-4 mr-2" />
        {config.consoleLabel}
      </Button>

      <div className="space-y-2">
        <Label htmlFor="api-key" className="flex items-center gap-2 text-sm">
          <KeyRound className="h-3.5 w-3.5" />
          Collez votre clé ci-dessous
        </Label>
        <Input
          id="api-key"
          type="password"
          value={keyValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`${config.prefix}...`}
        />
      </div>

      <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border text-xs">
        <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          Votre clé est stockée <strong>uniquement sur votre ordinateur</strong>.
          ExtrAct ne l'envoie qu'à {config.providerName} au moment de transcrire,
          et ne perçoit aucune commission sur votre consommation.
        </p>
      </div>
    </div>
  )
}
