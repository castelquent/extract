import { useState } from 'react'
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
  label: string
  icon: typeof KeyRound
}

const TOPICS: TopicMeta[] = [
  { id: 'api-keys', label: 'Clés API', icon: KeyRound },
  { id: 'workflow', label: 'Comment ça marche', icon: Workflow },
  { id: 'models', label: 'Modèles IA & coûts', icon: Bot },
  { id: 'templates', label: 'Templates', icon: FileStack },
]

export function HelpModal() {
  const { helpOpen, closeHelp } = useUIStore()
  const [activeTopic, setActiveTopic] = useState<HelpTopic>('api-keys')

  return (
    <Dialog open={helpOpen} onOpenChange={(open) => !open && closeHelp()}>
      <DialogContent className="max-w-3xl max-h-[80vh] p-0 overflow-hidden">
        <div className="flex h-[560px]">
          {/* Sidebar */}
          <div className="w-52 border-r bg-muted/30 p-4 flex flex-col">
            <h2 className="font-semibold text-lg mb-4 px-2">Aide</h2>
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
                  <span>{topic.label}</span>
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
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium mb-2">Obtenir une clé API</h3>
        <p className="text-sm text-muted-foreground">
          ExtrAct utilise l'IA d'OpenAI ou d'Anthropic pour transcrire vos documents.
          Vous devez créer un compte chez l'un de ces fournisseurs et copier votre clé
          personnelle dans les <strong>Paramètres &gt; IA</strong>.
        </p>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border text-sm">
        <Lock className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          Votre clé est stockée <strong>uniquement sur votre ordinateur</strong>.
          ExtrAct ne l'envoie nulle part, sauf au fournisseur que vous avez choisi
          au moment de transcrire.
        </p>
      </div>

      {/* Anthropic */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Anthropic (Claude)
          </h4>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.api.openExternal('https://console.anthropic.com/settings/keys')}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Ouvrir la console
          </Button>
        </div>
        <ol className="text-sm space-y-1.5 list-decimal list-inside text-muted-foreground">
          <li>Cliquez sur <strong>Ouvrir la console</strong> et créez un compte (ou connectez-vous).</li>
          <li>Validez votre adresse email puis votre numéro de téléphone.</li>
          <li>Dans <em>Plans &amp; Billing</em>, ajoutez quelques dollars de crédit.</li>
          <li>Dans <em>API Keys</em>, cliquez sur <em>Create Key</em>.</li>
          <li>Copiez la clé (elle commence par <code className="text-xs bg-muted px-1 rounded">sk-ant-</code>) et collez-la dans <strong>Paramètres &gt; IA</strong>.</li>
        </ol>
      </div>

      {/* OpenAI */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            OpenAI (GPT)
          </h4>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.api.openExternal('https://platform.openai.com/api-keys')}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Ouvrir la plateforme
          </Button>
        </div>
        <ol className="text-sm space-y-1.5 list-decimal list-inside text-muted-foreground">
          <li>Cliquez sur <strong>Ouvrir la plateforme</strong> et créez un compte (ou connectez-vous).</li>
          <li>Validez votre numéro de téléphone.</li>
          <li>Dans <em>Billing</em>, ajoutez quelques dollars de crédit.</li>
          <li>Dans <em>API keys</em>, cliquez sur <em>Create new secret key</em>.</li>
          <li>Copiez la clé (elle commence par <code className="text-xs bg-muted px-1 rounded">sk-</code>) et collez-la dans <strong>Paramètres &gt; IA</strong>.</li>
        </ol>
        <p className="text-xs text-muted-foreground mt-3 italic">
          La clé n'est affichée qu'une seule fois — copiez-la avant de fermer la fenêtre.
        </p>
      </div>
    </div>
  )
}

function WorkflowSection() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium mb-2">Comment ça marche ?</h3>
        <p className="text-sm text-muted-foreground">
          ExtrAct transforme un PDF (journal, magazine, courrier...) en documents
          structurés grâce à l'IA. Voici les quatre grandes étapes.
        </p>
      </div>

      <ol className="space-y-3">
        <li className="border rounded-lg p-4">
          <div className="font-medium mb-1">1. Créer un projet</div>
          <p className="text-sm text-muted-foreground">
            Depuis <em>Accueil</em>, cliquez sur <strong>Nouveau projet</strong>, importez
            votre PDF et choisissez un <strong>template</strong> (Article de presse,
            Correspondance, ou un template personnalisé que vous avez créé).
          </p>
        </li>
        <li className="border rounded-lg p-4">
          <div className="font-medium mb-1">2. Extraire les zones</div>
          <p className="text-sm text-muted-foreground">
            Dans <em>Extraction</em>, dessinez un rectangle autour de chaque élément à
            isoler (un article, une lettre...). Vous pouvez combiner plusieurs zones
            pour un même élément si celui-ci s'étale sur plusieurs colonnes ou pages.
          </p>
        </li>
        <li className="border rounded-lg p-4">
          <div className="font-medium mb-1">3. Transcrire avec l'IA</div>
          <p className="text-sm text-muted-foreground">
            Dans <em>Transcription</em>, lancez la transcription sur un élément ou en
            masse. L'IA remplit automatiquement les champs définis par le template
            (titre, auteur, contenu, etc.). Vous pouvez ensuite corriger à la main.
          </p>
        </li>
        <li className="border rounded-lg p-4">
          <div className="font-medium mb-1">4. Exporter</div>
          <p className="text-sm text-muted-foreground">
            Exportez vos éléments un par un, par lot ou en totalité, au format PDF,
            DOCX ou TXT. Vous pouvez aussi exporter le projet complet en ZIP pour
            sauvegarde.
          </p>
        </li>
      </ol>
    </div>
  )
}

function ModelsSection() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium mb-2">Quel modèle choisir ?</h3>
        <p className="text-sm text-muted-foreground">
          ExtrAct supporte deux familles de modèles IA. Vous pouvez configurer les
          deux et basculer à tout moment depuis les <strong>Paramètres &gt; IA</strong>.
        </p>
      </div>

      <div className="border rounded-lg p-4">
        <h4 className="font-medium mb-2">Anthropic — Claude</h4>
        <p className="text-sm text-muted-foreground mb-2">
          Généralement plus précis sur les documents anciens, l'écriture manuscrite
          et les mises en page complexes.
        </p>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
          <li><strong>Haiku 4.5</strong> — rapide et économique, suffisant pour un texte propre.</li>
          <li><strong>Sonnet 4.6</strong> — bon équilibre qualité / prix, choix par défaut recommandé.</li>
          <li><strong>Opus 4.7</strong> — le plus précis, pour les documents difficiles.</li>
        </ul>
      </div>

      <div className="border rounded-lg p-4">
        <h4 className="font-medium mb-2">OpenAI — GPT</h4>
        <p className="text-sm text-muted-foreground mb-2">
          Souvent plus rapides et un peu moins chers à qualité équivalente.
        </p>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
          <li><strong>GPT-5.2</strong> — l'option la plus économique côté OpenAI.</li>
          <li><strong>GPT-5.4</strong> — bon compromis qualité / prix.</li>
          <li><strong>GPT-5.5</strong> — modèle premium, pour les cas les plus exigeants.</li>
        </ul>
      </div>

      <div>
        <h4 className="font-medium mb-2">Combien ça coûte ?</h4>
        <p className="text-sm text-muted-foreground">
          Le coût dépend du modèle et de la longueur du document. Comptez de quelques
          centimes pour un article court avec un modèle économique, à une dizaine de
          centimes pour un long document avec un modèle premium. Les
          <strong> Paramètres &gt; Logs</strong> affichent le coût réel cumulé de
          chacune de vos transcriptions.
        </p>
      </div>
    </div>
  )
}

function TemplatesSection() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium mb-2">Templates</h3>
        <p className="text-sm text-muted-foreground">
          Un <strong>template</strong> définit la structure des informations à
          extraire : quels champs remplir, leur type, et comment guider l'IA.
        </p>
      </div>

      <div className="border rounded-lg p-4">
        <h4 className="font-medium mb-2">Templates par défaut</h4>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
          <li><strong>Article de presse</strong> — Titre, Auteur, Contenu.</li>
          <li><strong>Correspondance</strong> — Titre, Date, Expéditeur, Destinataire, Contenu.</li>
        </ul>
        <p className="text-xs text-muted-foreground mt-2 italic">
          Ces templates ne sont pas modifiables, mais vous pouvez les dupliquer
          depuis la page <em>Modèles</em>.
        </p>
      </div>

      <div className="border rounded-lg p-4">
        <h4 className="font-medium mb-2">Créer un template personnalisé</h4>
        <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
          <li>Allez dans <strong>Modèles</strong> dans le menu de gauche.</li>
          <li>Cliquez sur <strong>Nouveau modèle</strong>, donnez-lui un nom.</li>
          <li>Ajoutez vos champs. Trois types sont disponibles :
            <ul className="ml-5 mt-1 space-y-0.5 list-disc list-inside">
              <li><strong>Texte court</strong> — une seule ligne (titre, auteur...).</li>
              <li><strong>Texte long</strong> — plusieurs lignes brutes.</li>
              <li><strong>Texte enrichi</strong> — mise en forme (gras, italique, paragraphes...).</li>
            </ul>
          </li>
          <li>Optionnel : ajoutez une <em>indication IA</em> pour orienter la transcription
            (par exemple <em>"Conserver l'orthographe d'origine du document"</em>).</li>
          <li>Sauvegardez. Votre template apparaîtra au moment de créer un projet.</li>
        </ol>
        <p className="text-xs text-muted-foreground mt-3 italic">
          Le champ <strong>Titre</strong> est toujours présent et ne peut pas être supprimé.
        </p>
      </div>
    </div>
  )
}
