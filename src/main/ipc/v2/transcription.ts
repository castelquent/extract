// v2 transcription handler. Operates on articleId instead of imagePath, reads
// the article's extract.pdf, calls the AI API, and updates the article's
// metadata directly (no renderer-side save needed).
import { ipcMain, app } from 'electron'
import axios from 'axios'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type {
  AISettings,
  ArticleMetadata,
  TemplateField,
  TranscriptionLog,
  TranscriptionResult,
} from '@shared/types'
import {
  getArticleExtractPdfPath,
  getArticleMetadataPath,
  readArticleMetadata,
  writeJson,
} from '../_fs'
import { touchProject } from './projects'
import { idx, patchArticle } from './_index'
import { loadTemplates } from '../templates'
import { resolveFieldLabel } from '@shared/fieldLabel'

const locateArticle = (projectId: string, articleId: string): string | null | undefined =>
  idx.locateArticle(projectId, articleId)

function getLogsPath(): string {
  return join(app.getPath('userData'), 'logs.json')
}

function appendLog(entry: TranscriptionLog): void {
  try {
    const logsPath = getLogsPath()
    let logs: TranscriptionLog[] = []
    if (existsSync(logsPath)) {
      logs = JSON.parse(readFileSync(logsPath, 'utf-8'))
    }
    logs.push(entry)
    writeFileSync(logsPath, JSON.stringify(logs, null, 2))
  } catch (err) {
    console.error('Failed to write log:', err)
  }
}

// Read the user's preferred UI language from settings.json synchronously.
// Used to pick the prompt wrapper locale so a coherent monolingual prompt
// is sent to the AI (mixed-language prompts perform marginally worse).
function readAppLanguage(): 'fr' | 'en' {
  try {
    const path = join(app.getPath('userData'), 'settings.json')
    if (!existsSync(path)) return 'fr'
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    const lng = parsed?.app?.language
    return lng === 'en' ? 'en' : 'fr'
  } catch {
    return 'fr'
  }
}

interface PromptWrapper {
  defaultContext: string
  analyseLine: string
  rulesHeader: string
  rules: string[]
}

const PROMPT_WRAPPERS: Record<'fr' | 'en', PromptWrapper> = {
  fr: {
    defaultContext: "Tu es un assistant spécialisé dans l'extraction de texte à partir de documents PDF.",
    analyseLine: 'Analyse le document et retourne un JSON avec les champs suivants:',
    rulesHeader: 'RÈGLES STRICTES:',
    rules: [
      'Ne reformule rien, transcris le texte tel quel.',
      "ENCODAGE: Assure-toi que les caractères accentués (é, à, è, ê, ù, etc.) sont correctement transcrits en UTF-8.",
      'GUILLEMETS: Si le texte contient des guillemets, tu DOIS les échapper (\\") pour ne pas casser le JSON.',
      'Pour les champs de contenu, utilise du HTML (<p>, <strong>, <em>) pour la mise en forme.',
      'Réponds uniquement avec le JSON, sans explication ni markdown.',
    ],
  },
  en: {
    defaultContext: 'You are an assistant specialised in extracting text from PDF documents.',
    analyseLine: 'Analyse the document and return a JSON with the following fields:',
    rulesHeader: 'STRICT RULES:',
    rules: [
      "Don't reformulate anything; transcribe the text as-is.",
      'ENCODING: make sure accented characters (é, à, è, ê, ù, etc.) are correctly transcribed in UTF-8.',
      'QUOTES: if the text contains quotation marks, you MUST escape them (\\") so the JSON stays valid.',
      'For content fields, use HTML (<p>, <strong>, <em>) for formatting.',
      'Reply with the JSON only — no explanation, no markdown.',
    ],
  },
}

// Build the AI prompt from the article's snapshotted schema + aiContext.
// For default-template fields (schema entry has a stable `id`), the live
// template is consulted so the prompt uses the current UI language's labels
// even when the snapshot is stale. Custom-template fields fall through to
// the snapshotted name and hint.
function buildPromptFromSchema(
  schema: TemplateField[],
  templateId: string | undefined,
  aiContext?: string
): string {
  const lang = readAppLanguage()
  const wrap = PROMPT_WRAPPERS[lang]
  const templates = loadTemplates()
  const liveTpl = templateId ? templates.find((t) => t.id === templateId) : undefined
  // Default templates also get their aiContext refreshed from the live
  // template so an EN user transcribing an article snapshotted in FR sends
  // an EN context line.
  const resolvedContext = liveTpl?.isDefault && liveTpl.aiContext ? liveTpl.aiContext : aiContext
  const fieldsList = [...schema]
    .sort((a, b) => a.order - b.order)
    .map((f) => {
      const { name, aiHint } = resolveFieldLabel(f, templates, templateId)
      return aiHint ? `- ${name} (${aiHint})` : `- ${name}`
    })
    .join('\n')
  const context = resolvedContext || wrap.defaultContext
  return `${context}

${wrap.analyseLine}
${fieldsList}

${wrap.rulesHeader}
${wrap.rules.map((r) => `- ${r}`).join('\n')}`
}

function parseApiError(error: any, provider: string): string {
  if (error.response) {
    const status = error.response.status
    const data = error.response.data
    if (status === 401) {
      return provider === 'openai'
        ? 'Clé API OpenAI invalide. Vérifiez vos paramètres.'
        : 'Clé API Anthropic invalide. Vérifiez vos paramètres.'
    }
    if (status === 403) return "Accès refusé. Votre clé API n'a pas les permissions nécessaires."
    if (status === 429) return 'Limite de requêtes atteinte. Réessayez dans quelques minutes.'
    if (status === 500 || status === 502 || status === 503) {
      return `Service ${provider === 'openai' ? 'OpenAI' : 'Anthropic'} temporairement indisponible. Réessayez plus tard.`
    }
    if (status === 400) {
      const apiMessage = data?.error?.message || data?.message || ''
      if (apiMessage.includes('model')) return 'Modèle non disponible. Vérifiez le modèle sélectionné dans les paramètres.'
      return `Requête invalide: ${apiMessage || 'vérifiez vos paramètres'}`
    }
    return `Erreur API (${status}): ${data?.error?.message || data?.message || 'Erreur inconnue'}`
  }
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return 'Impossible de contacter le serveur. Vérifiez votre connexion internet.'
  }
  if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
    return "La requête a expiré. L'image est peut-être trop grande."
  }
  if (error.code === 'ENOENT') return 'Fichier extrait introuvable. L\'article est peut-être corrompu.'
  return error.message || 'Erreur inconnue lors de la transcription'
}

function textToHtml(text: string): string {
  if (!text) return ''
  return text
    .split(/\n\n+/)
    .map((p) => {
      const content = p.trim().replace(/\n/g, '<br>')
      return content ? `<p>${content}</p>` : ''
    })
    .filter(Boolean)
    .join('')
}

function parseTranscriptionResponse(
  content: string,
  schema: TemplateField[],
  templateId: string | undefined
): TranscriptionResult {
  try {
    const refusalPatterns = [
      /^je ne (peux|suis)/i,
      /^i (cannot|can't|am unable)/i,
      /^désolé/i,
      /^sorry/i,
      /^malheureusement/i,
      /^unfortunately/i,
    ]
    if (refusalPatterns.some((re) => re.test(content.trim()))) {
      return { success: false, error: content.trim().substring(0, 200), rawContent: content }
    }
    let jsonStr = content
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) jsonStr = jsonMatch[1].trim()
    const fixed = jsonStr.replace(/([a-zA-ZÀ-ÿ0-9])"([a-zA-ZÀ-ÿ0-9])/g, '$1\\"$2')
    const parsed = JSON.parse(fixed)

    // The AI replies under the names we asked for (live names for default
    // fields, snapshot names for customs). Storage stays keyed by the
    // snapshot name so on-disk fields keep a stable shape.
    const templates = loadTemplates()
    const fields: Record<string, string> = {}
    for (const field of schema) {
      const { name: askedName } = resolveFieldLabel(field, templates, templateId)
      const rawValue = parsed[askedName] ?? parsed[field.name] ?? ''
      fields[field.name] = field.type === 'richtext' && rawValue ? textToHtml(rawValue) : rawValue
    }
    return { success: true, data: { fields } }
  } catch (err) {
    console.error('Failed to parse JSON response:', err)
    const trimmed = content.trim()
    const looksLikeMessage = !trimmed.startsWith('{') && !trimmed.startsWith('[')
    return {
      success: false,
      error: looksLikeMessage ? trimmed.substring(0, 200) : 'Échec du parsing de la réponse IA',
      rawContent: content,
    }
  }
}

type ResultWithUsage = TranscriptionResult & { usage?: { input: number; output: number } }

async function transcribeWithOpenAI(
  base64Pdf: string,
  settings: AISettings,
  prompt: string,
  schema: TemplateField[],
  templateId: string | undefined
): Promise<ResultWithUsage> {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: settings.model,
      messages: [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                filename: 'document.pdf',
                file_data: `data:application/pdf;base64,${base64Pdf}`,
              },
            },
            { type: 'text', text: 'Analyse cet article et extrais les informations demandées.' },
          ],
        },
      ],
      max_completion_tokens: 128000,
    },
    {
      headers: {
        Authorization: `Bearer ${settings.openaiApiKey || settings.apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  )
  const content = response.data.choices[0]?.message?.content || ''
  const usage = response.data.usage
  const result = parseTranscriptionResponse(content, schema, templateId)
  return {
    ...result,
    usage: { input: usage?.prompt_tokens || 0, output: usage?.completion_tokens || 0 },
  }
}

async function transcribeWithAnthropic(
  base64Pdf: string,
  settings: AISettings,
  prompt: string,
  schema: TemplateField[],
  templateId: string | undefined
): Promise<ResultWithUsage> {
  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: settings.model,
      max_tokens: 55000,
      system: prompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf },
            },
            { type: 'text', text: 'Analyse cet article et extrais les informations demandées.' },
          ],
        },
      ],
    },
    {
      headers: {
        'x-api-key': settings.anthropicApiKey || settings.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    }
  )
  const content = response.data.content[0]?.text || ''
  const usage = response.data.usage
  const result = parseTranscriptionResponse(content, schema, templateId)
  return {
    ...result,
    usage: { input: usage?.input_tokens || 0, output: usage?.output_tokens || 0 },
  }
}

export function setupV2TranscriptionHandlers(): void {
  ipcMain.handle(
    'v2:transcription:transcribe',
    async (
      _,
      projectId: string,
      articleId: string,
      settings: AISettings
    ): Promise<TranscriptionResult> => {
      try {
        const dossierId = locateArticle(projectId, articleId)
        if (dossierId === undefined) {
          return { success: false, error: 'Article introuvable' }
        }
        const article = readArticleMetadata(projectId, dossierId, articleId)
        if (!article) return { success: false, error: 'Article introuvable' }

        const pdfPath = getArticleExtractPdfPath(projectId, dossierId, articleId)
        if (!existsSync(pdfPath)) {
          return { success: false, error: 'Fichier extrait introuvable. Régénérer le PDF.' }
        }

        const apiKey = settings.provider === 'openai'
          ? (settings.openaiApiKey || settings.apiKey)
          : (settings.anthropicApiKey || settings.apiKey)
        if (!apiKey || apiKey.trim() === '') {
          return {
            success: false,
            error: settings.provider === 'openai'
              ? 'Clé API OpenAI non configurée. Allez dans Paramètres > IA.'
              : 'Clé API Anthropic non configurée. Allez dans Paramètres > IA.',
          }
        }

        const base64 = readFileSync(pdfPath).toString('base64')
        const schema = article.schema ?? []
        const templateId = article.templateId
        const prompt = buildPromptFromSchema(schema, templateId, article.aiContext)

        // Surface the full prompt in the dev terminal so the user can audit
        // exactly what's being sent. Logged verbatim, no truncation.
        console.log('\n[v2:transcribe] === Prompt ===')
        console.log(`project=${projectId} article=${articleId} provider=${settings.provider} model=${settings.model}`)
        console.log(prompt)
        console.log('[v2:transcribe] ==============\n')

        const result = settings.provider === 'openai'
          ? await transcribeWithOpenAI(base64, settings, prompt, schema, templateId)
          : await transcribeWithAnthropic(base64, settings, prompt, schema, templateId)

        appendLog({
          date: new Date().toISOString(),
          projectId,
          model: settings.model,
          provider: settings.provider,
          inputTokens: result.usage?.input || 0,
          outputTokens: result.usage?.output || 0,
          success: result.success,
          error: result.error,
        })

        // Persist filled fields on success. Status is unchanged — "filled
        // or not" is computed from fields + schema, not stored as state.
        if (result.success && result.data?.fields) {
          const updated: ArticleMetadata = {
            ...article,
            fields: { ...article.fields, ...result.data.fields },
            modifiedAt: new Date().toISOString(),
          }
          writeJson(getArticleMetadataPath(projectId, dossierId, articleId), updated)
          patchArticle(projectId, articleId, updated)
          touchProject(projectId)
        }

        return result
      } catch (error: any) {
        const errorMessage = parseApiError(error, settings.provider)
        appendLog({
          date: new Date().toISOString(),
          projectId,
          model: settings.model,
          provider: settings.provider,
          inputTokens: 0,
          outputTokens: 0,
          success: false,
          error: errorMessage,
        })
        return { success: false, error: errorMessage }
      }
    }
  )
}
