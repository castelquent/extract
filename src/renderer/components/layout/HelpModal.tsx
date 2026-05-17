import { useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { useUIStore } from '@/stores'
import {
  Button,
  Dialog,
  DialogContent,
} from '@/components/ui'
import {
  KeyRound,
  ExternalLink,
  Lock,
  Workflow,
  Bot,
  FileStack,
} from 'lucide-react'

type HelpTopic = 'api-keys' | 'workflow' | 'models' | 'templates'

interface TopicMeta {
  id: HelpTopic
  labelKey: string
  icon: typeof KeyRound
}

const TOPICS: TopicMeta[] = [
  { id: 'api-keys', labelKey: 'topics.apiKeys', icon: KeyRound },
  { id: 'workflow', labelKey: 'topics.workflow', icon: Workflow },
  { id: 'models', labelKey: 'topics.models', icon: Bot },
  { id: 'templates', labelKey: 'topics.templates', icon: FileStack },
]

// Inline markup map reused by every <Trans>. Keep this in sync with the
// `<bold>` / `<em>` / `<code>` placeholders used in help.json.
const inlineComponents = {
  bold: <strong />,
  em: <em />,
  code: <code className="text-xs bg-muted px-1 rounded" />,
}

export function HelpModal() {
  const { t } = useTranslation('help')
  const { helpOpen, closeHelp } = useUIStore()
  const [activeTopic, setActiveTopic] = useState<HelpTopic>('api-keys')

  return (
    <Dialog open={helpOpen} onOpenChange={(open) => !open && closeHelp()}>
      <DialogContent className="max-w-3xl max-h-[80vh] p-0 overflow-hidden">
        <div className="flex h-[560px]">
          {/* Sidebar */}
          <div className="w-52 border-r bg-muted/30 p-4 flex flex-col">
            <h2 className="font-semibold text-lg mb-4 px-2">{t('title')}</h2>
            <nav className="space-y-1">
              {TOPICS.map((topic) => (
                <button
                  key={topic.id}
                  onClick={() => setActiveTopic(topic.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors text-left ${
                    activeTopic === topic.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  <topic.icon className="h-4 w-4 shrink-0" />
                  <span>{t(topic.labelKey)}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTopic === 'api-keys' && <ApiKeysSection />}
            {activeTopic === 'workflow' && <WorkflowSection />}
            {activeTopic === 'models' && <ModelsSection />}
            {activeTopic === 'templates' && <TemplatesSection />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ApiKeysSection() {
  const { t } = useTranslation('help')
  const anthropicSteps = t('apiKeys.anthropic.steps', { returnObjects: true }) as string[]
  const openaiSteps = t('apiKeys.openai.steps', { returnObjects: true }) as string[]
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium mb-2">{t('apiKeys.heading')}</h3>
        <p className="text-sm text-muted-foreground">
          <Trans i18nKey="apiKeys.intro" ns="help" components={inlineComponents} />
        </p>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border text-sm">
        <Lock className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          <Trans i18nKey="apiKeys.privacyNote" ns="help" components={inlineComponents} />
        </p>
      </div>

      {/* Anthropic */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            {t('apiKeys.anthropic.title')}
          </h4>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.api.openExternal('https://console.anthropic.com/settings/keys')}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            {t('apiKeys.anthropic.openConsole')}
          </Button>
        </div>
        <ol className="text-sm space-y-1.5 list-decimal list-inside text-muted-foreground">
          {anthropicSteps.map((_, i) => (
            <li key={i}>
              <Trans i18nKey={`apiKeys.anthropic.steps.${i}`} ns="help" components={inlineComponents} />
            </li>
          ))}
        </ol>
      </div>

      {/* OpenAI */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            {t('apiKeys.openai.title')}
          </h4>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.api.openExternal('https://platform.openai.com/api-keys')}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            {t('apiKeys.openai.openPlatform')}
          </Button>
        </div>
        <ol className="text-sm space-y-1.5 list-decimal list-inside text-muted-foreground">
          {openaiSteps.map((_, i) => (
            <li key={i}>
              <Trans i18nKey={`apiKeys.openai.steps.${i}`} ns="help" components={inlineComponents} />
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground mt-3 italic">
          {t('apiKeys.openai.footnote')}
        </p>
      </div>
    </div>
  )
}

function WorkflowSection() {
  const { t } = useTranslation('help')
  const steps = t('workflow.steps', { returnObjects: true }) as Array<{ title: string; body: string }>
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium mb-2">{t('workflow.heading')}</h3>
        <p className="text-sm text-muted-foreground">{t('workflow.intro')}</p>
      </div>

      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="border rounded-lg p-4">
            <div className="font-medium mb-1">{step.title}</div>
            <p className="text-sm text-muted-foreground">
              <Trans i18nKey={`workflow.steps.${i}.body`} ns="help" components={inlineComponents} />
            </p>
          </li>
        ))}
      </ol>
    </div>
  )
}

function ModelsSection() {
  const { t } = useTranslation('help')
  const anthropicItems = t('models.anthropic.items', { returnObjects: true }) as string[]
  const openaiItems = t('models.openai.items', { returnObjects: true }) as string[]
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium mb-2">{t('models.heading')}</h3>
        <p className="text-sm text-muted-foreground">
          <Trans i18nKey="models.intro" ns="help" components={inlineComponents} />
        </p>
      </div>

      <div className="border rounded-lg p-4">
        <h4 className="font-medium mb-2">{t('models.anthropic.title')}</h4>
        <p className="text-sm text-muted-foreground mb-2">{t('models.anthropic.intro')}</p>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
          {anthropicItems.map((_, i) => (
            <li key={i}>
              <Trans i18nKey={`models.anthropic.items.${i}`} ns="help" components={inlineComponents} />
            </li>
          ))}
        </ul>
      </div>

      <div className="border rounded-lg p-4">
        <h4 className="font-medium mb-2">{t('models.openai.title')}</h4>
        <p className="text-sm text-muted-foreground mb-2">{t('models.openai.intro')}</p>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
          {openaiItems.map((_, i) => (
            <li key={i}>
              <Trans i18nKey={`models.openai.items.${i}`} ns="help" components={inlineComponents} />
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="font-medium mb-2">{t('models.costs.title')}</h4>
        <p className="text-sm text-muted-foreground">
          <Trans i18nKey="models.costs.body" ns="help" components={inlineComponents} />
        </p>
      </div>
    </div>
  )
}

function TemplatesSection() {
  const { t } = useTranslation('help')
  const defaultItems = t('templatesSection.defaults.items', { returnObjects: true }) as string[]
  const customSteps = t('templatesSection.custom.steps', { returnObjects: true }) as string[]
  const fieldTypes = t('templatesSection.custom.fieldTypes', { returnObjects: true }) as string[]
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium mb-2">{t('templatesSection.heading')}</h3>
        <p className="text-sm text-muted-foreground">
          <Trans i18nKey="templatesSection.intro" ns="help" components={inlineComponents} />
        </p>
      </div>

      <div className="border rounded-lg p-4">
        <h4 className="font-medium mb-2">{t('templatesSection.defaults.title')}</h4>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
          {defaultItems.map((_, i) => (
            <li key={i}>
              <Trans i18nKey={`templatesSection.defaults.items.${i}`} ns="help" components={inlineComponents} />
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground mt-2 italic">
          <Trans i18nKey="templatesSection.defaults.footnote" ns="help" components={inlineComponents} />
        </p>
      </div>

      <div className="border rounded-lg p-4">
        <h4 className="font-medium mb-2">{t('templatesSection.custom.title')}</h4>
        <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
          {customSteps.map((_, i) => (
            <li key={i}>
              <Trans i18nKey={`templatesSection.custom.steps.${i}`} ns="help" components={inlineComponents} />
              {i === 2 && (
                <ul className="ml-5 mt-1 space-y-0.5 list-disc list-inside">
                  {fieldTypes.map((_, j) => (
                    <li key={j}>
                      <Trans
                        i18nKey={`templatesSection.custom.fieldTypes.${j}`}
                        ns="help"
                        components={inlineComponents}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground mt-3 italic">
          <Trans i18nKey="templatesSection.custom.footnote" ns="help" components={inlineComponents} />
        </p>
      </div>
    </div>
  )
}
