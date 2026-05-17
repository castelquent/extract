import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
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
  Shield,
  X,
} from 'lucide-react'

type Provider = 'anthropic' | 'openai'
type Step = 1 | 2 | 3

export function OnboardingPage() {
  const { t } = useTranslation('onboarding')
  const navigate = useNavigate()
  const { settings, loadSettings, saveSettings } = useSettingsStore()

  const [step, setStep] = useState<Step>(1)
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

  // Final persistence. Called only from step 3 (Sentry), which is the one
  // mandatory question. `telemetry` is the explicit choice the user made.
  // `saveKey` reflects whether they actually entered (or kept) an API key.
  const finishOnboarding = async (telemetry: boolean) => {
    if (!settings) return
    setSaving(true)
    const nextAi = { ...settings.ai }
    if (provider) {
      const trimmed = keyValue.trim() || undefined
      if (provider === 'anthropic') nextAi.anthropicApiKey = trimmed
      else nextAi.openaiApiKey = trimmed
    }
    const next = {
      ...settings,
      ai: nextAi,
      app: {
        ...settings.app,
        onboardingSeen: true,
        telemetryEnabled: telemetry,
      },
    }
    await saveSettings(next)
    setSaving(false)
    navigate('/')
  }

  const handleNext = () => {
    if (step === 1 && provider) setStep(2)
    else if (step === 2) setStep(3)
  }
  const handleBack = () => {
    if (step === 2) setStep(1)
    else if (step === 3) setStep(2)
  }
  // "Plus tard" on steps 1 and 2 jumps straight to the Sentry step. The user
  // cannot exit the onboarding without answering the privacy question.
  const handleSkipToConsent = () => setStep(3)

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-background p-8 overflow-y-auto">
      <div className="w-full max-w-2xl py-8">
        <div className="flex items-center justify-center gap-2 mb-8">
          <StepDot index={1} current={step} label={t('steps.provider')} />
          <div className="h-px w-12 bg-border" />
          <StepDot index={2} current={step} label={t('steps.apiKey')} />
          <div className="h-px w-12 bg-border" />
          <StepDot index={3} current={step} label={t('steps.privacy')} />
        </div>

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
        {step === 3 && (
          <StepTelemetryConsent
            saving={saving}
            onAccept={() => finishOnboarding(true)}
            onDecline={() => finishOnboarding(false)}
          />
        )}

        {step !== 3 && (
          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={handleSkipToConsent} disabled={saving}>
              {t('nav.skip')}
            </Button>
            <div className="flex items-center gap-2">
              {step === 2 && (
                <Button variant="outline" size="sm" onClick={handleBack} disabled={saving}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  {t('nav.back')}
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleNext}
                disabled={(step === 1 && !provider) || saving}
              >
                {t('nav.next')}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="mt-6 flex justify-start">
            <Button variant="outline" size="sm" onClick={handleBack} disabled={saving}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t('nav.back')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function StepDot({ index, current, label }: { index: Step; current: Step; label: string }) {
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
  const { t } = useTranslation('onboarding')
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{t('provider.title')}</h1>
        <p className="text-muted-foreground">{t('provider.subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ProviderCard
          provider="anthropic"
          selected={selected === 'anthropic'}
          onClick={() => onSelect('anthropic')}
          icon={Brain}
          title={t('provider.anthropic.title')}
          tagline={t('provider.anthropic.tagline')}
          description={t('provider.anthropic.description')}
        />
        <ProviderCard
          provider="openai"
          selected={selected === 'openai'}
          onClick={() => onSelect('openai')}
          icon={Zap}
          title={t('provider.openai.title')}
          tagline={t('provider.openai.tagline')}
          description={t('provider.openai.description')}
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
  const { t } = useTranslation('onboarding')
  const isAnthropic = provider === 'anthropic'
  const providerName = isAnthropic ? 'Anthropic' : 'OpenAI'
  const consoleUrl = isAnthropic
    ? 'https://console.anthropic.com/settings/keys'
    : 'https://platform.openai.com/api-keys'
  const consoleLabel = isAnthropic
    ? t('apiKey.openAnthropicConsole')
    : t('apiKey.openOpenaiConsole')
  const prefix = isAnthropic ? 'sk-ant-' : 'sk-'
  const stepsKey = isAnthropic ? 'apiKey.anthropicSteps' : 'apiKey.openaiSteps'
  const steps = t(stepsKey, { returnObjects: true }) as string[]

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          {t('apiKey.title', { provider: providerName })}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          <Trans
            i18nKey="onboarding:apiKey.subtitle"
            values={{ provider: providerName }}
            components={{ bold: <strong /> }}
          />
        </p>
      </div>

      <ol className="space-y-2.5">
        {steps.map((s, i) => (
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
        onClick={() => window.api.openExternal(consoleUrl)}
      >
        <ExternalLink className="h-4 w-4 mr-2" />
        {consoleLabel}
      </Button>

      <div className="space-y-2">
        <Label htmlFor="api-key" className="flex items-center gap-2 text-sm">
          <KeyRound className="h-3.5 w-3.5" />
          {t('apiKey.pasteLabel')}
        </Label>
        <Input
          id="api-key"
          type="password"
          value={keyValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`${prefix}...`}
        />
      </div>

      <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border text-xs">
        <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          <Trans
            i18nKey="onboarding:apiKey.privacyNote"
            values={{ provider: providerName }}
            components={{ bold: <strong /> }}
          />
        </p>
      </div>
    </div>
  )
}

function StepTelemetryConsent({
  saving,
  onAccept,
  onDecline,
}: {
  saving: boolean
  onAccept: () => void
  onDecline: () => void
}) {
  const { t } = useTranslation('onboarding')
  const included = t('privacy.included', { returnObjects: true }) as string[]
  const excluded = t('privacy.excluded', { returnObjects: true }) as string[]
  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <div className="flex justify-center mb-2">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="h-6 w-6 text-primary" />
          </div>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{t('privacy.title')}</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t('privacy.subtitle')}
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Check className="h-4 w-4 text-green-600" />
            {t('privacy.includedTitle')}
          </h3>
          <ul className="space-y-1.5 text-xs text-muted-foreground pl-6 list-disc">
            {included.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <X className="h-4 w-4 text-red-600" />
            {t('privacy.excludedTitle')}
          </h3>
          <ul className="space-y-1.5 text-xs text-muted-foreground pl-6 list-disc">
            {excluded.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground italic pt-1 border-t">
          {t('privacy.note')}
        </p>

        <p className="text-xs text-muted-foreground pt-1 border-t">
          <Trans i18nKey="onboarding:privacy.recipient" components={{ bold: <strong /> }} />
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1">
        <Button
          variant="outline"
          size="lg"
          onClick={onDecline}
          disabled={saving}
          className="h-auto py-3 flex-col gap-0.5"
        >
          <span className="font-semibold">{t('privacy.decline')}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {t('privacy.declineHint')}
          </span>
        </Button>
        <Button
          size="lg"
          onClick={onAccept}
          disabled={saving}
          className="h-auto py-3 flex-col gap-0.5"
        >
          <span className="font-semibold">{t('privacy.accept')}</span>
          <span className="text-xs font-normal opacity-90">
            {t('privacy.acceptHint')}
          </span>
        </Button>
      </div>
    </div>
  )
}
