import { ipcMain, app } from 'electron'
import axios from 'axios'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { TranscriptionResult, AISettings, Template, TranscriptionLog } from '@shared/types'

// Get logs file path
function getLogsPath(): string {
  return join(app.getPath('userData'), 'logs.json')
}

// Append a log entry
function appendLog(entry: TranscriptionLog): void {
  try {
    const logsPath = getLogsPath()
    let logs: TranscriptionLog[] = []

    if (existsSync(logsPath)) {
      const content = readFileSync(logsPath, 'utf-8')
      logs = JSON.parse(content)
    }

    logs.push(entry)
    writeFileSync(logsPath, JSON.stringify(logs, null, 2))
  } catch (error) {
    console.error('Failed to write log:', error)
  }
}

// Build dynamic prompt from template
function buildPromptFromTemplate(template: Template): string {
  const fieldsList = template.fields
    .sort((a, b) => a.order - b.order)
    .map(f => {
      let line = `- ${f.name}`
      if (f.aiHint) line += ` (${f.aiHint})`
      return line
    })
    .join('\n')

  const context = template.aiContext || 'Tu es un assistant spécialisé dans l\'extraction de texte à partir de documents PDF.'

  return `${context}

Analyse le document et retourne un JSON avec les champs suivants:
${fieldsList}

RÈGLES STRICTES:
- Ne reformule rien, transcris le texte tel quel.
- ENCODAGE: Assure-toi que les caractères accentués français (é, à, è, ê, ù, etc.) sont correctement transcrits en UTF-8.
- GUILLEMETS: Si le texte contient des guillemets, tu DOIS les échapper (\\") pour ne pas casser le JSON.
- Pour les champs de contenu, utilise du HTML (<p>, <strong>, <em>) pour la mise en forme.
- Réponds uniquement avec le JSON, sans explication ni markdown.`
}

// Parse API errors into user-friendly messages
function parseApiError(error: any, provider: string): string {
  // Axios error with response
  if (error.response) {
    const status = error.response.status
    const data = error.response.data

    // Common HTTP errors
    if (status === 401) {
      return provider === 'openai'
        ? 'Clé API OpenAI invalide. Vérifiez vos paramètres.'
        : 'Clé API Anthropic invalide. Vérifiez vos paramètres.'
    }
    if (status === 403) {
      return 'Accès refusé. Votre clé API n\'a pas les permissions nécessaires.'
    }
    if (status === 429) {
      return 'Limite de requêtes atteinte. Réessayez dans quelques minutes.'
    }
    if (status === 500 || status === 502 || status === 503) {
      return `Service ${provider === 'openai' ? 'OpenAI' : 'Anthropic'} temporairement indisponible. Réessayez plus tard.`
    }
    if (status === 400) {
      // Try to get specific error message from API
      const apiMessage = data?.error?.message || data?.message || ''
      if (apiMessage.includes('model')) {
        return `Modèle non disponible. Vérifiez le modèle sélectionné dans les paramètres.`
      }
      return `Requête invalide: ${apiMessage || 'vérifiez vos paramètres'}`
    }

    // Generic with status
    return `Erreur API (${status}): ${data?.error?.message || data?.message || 'Erreur inconnue'}`
  }

  // Network error (no response)
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return 'Impossible de contacter le serveur. Vérifiez votre connexion internet.'
  }
  if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
    return 'La requête a expiré. L\'image est peut-être trop grande.'
  }

  // File system errors
  if (error.code === 'ENOENT') {
    return 'Fichier image introuvable. Le projet est peut-être corrompu.'
  }

  // Fallback
  return error.message || 'Erreur inconnue lors de la transcription'
}

export function setupTranscriptionHandlers(): void {
  // Transcribe article image
  ipcMain.handle('transcription:transcribe', async (
    _,
    projectId: string,
    imagePath: string,
    settings: AISettings,
    template: Template
  ): Promise<TranscriptionResult> => {
    try {
      // Build absolute path from project folder
      const projectsPath = join(app.getPath('userData'), 'projects', projectId)
      const fullImagePath = join(projectsPath, imagePath)

      const imageBuffer = readFileSync(fullImagePath)
      const base64Image = imageBuffer.toString('base64')
      // Récupère l'extension réelle du fichier (jpg ou png)
      const extension = imagePath.split('.').pop()?.toLowerCase();
      const mimeType = extension === 'jpg' || extension === 'jpeg'
      ? 'image/jpeg'
      : 'image/png';

      // Validate API key before making request
      const apiKey = settings.provider === 'openai'
        ? (settings.openaiApiKey || settings.apiKey)
        : (settings.anthropicApiKey || settings.apiKey)

      if (!apiKey || apiKey.trim() === '') {
        return {
          success: false,
          error: settings.provider === 'openai'
            ? 'Clé API OpenAI non configurée. Allez dans Paramètres > IA.'
            : 'Clé API Anthropic non configurée. Allez dans Paramètres > IA.'
        }
      }

      // Generate dynamic prompt from template
      const prompt = buildPromptFromTemplate(template)

      let result: TranscriptionResult & { usage?: { input: number; output: number } }

      if (settings.provider === 'openai') {
        result = await transcribeWithOpenAI(base64Image, mimeType, settings, prompt, template)
      } else {
        result = await transcribeWithAnthropic(base64Image, mimeType, settings, prompt, template)
      }

      // Log the transcription
      appendLog({
        date: new Date().toISOString(),
        projectId,
        model: settings.model,
        provider: settings.provider,
        inputTokens: result.usage?.input || 0,
        outputTokens: result.usage?.output || 0,
        success: result.success,
        error: result.error
      })

      return result
    } catch (error: any) {
      console.error('Transcription error:', error)

      // Parse API errors for better messages
      const errorMessage = parseApiError(error, settings.provider)

      // Log failed transcription
      appendLog({
        date: new Date().toISOString(),
        projectId,
        model: settings.model,
        provider: settings.provider,
        inputTokens: 0,
        outputTokens: 0,
        success: false,
        error: errorMessage
      })

      return {
        success: false,
        error: errorMessage
      }
    }
  })
}

type TranscriptionResultWithUsage = TranscriptionResult & { usage?: { input: number; output: number } }

async function transcribeWithOpenAI(
  base64Image: string,
  mimeType: string,
  settings: AISettings,
  prompt: string,
  template: Template
): Promise<TranscriptionResultWithUsage> {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: settings.model,
      messages: [
        {
          role: 'system',
          content: prompt
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            },
            {
              type: 'text',
              text: 'Analyse cet article et extrais les informations demandées.'
            }
          ]
        }
      ],
      max_tokens: 4096
    },
    {
      headers: {
        'Authorization': `Bearer ${settings.openaiApiKey || settings.apiKey}`,
        'Content-Type': 'application/json'
      }
    }
  )

  const content = response.data.choices[0]?.message?.content || ''
  const usage = response.data.usage
  const result = parseTranscriptionResponse(content, template)

  return {
    ...result,
    usage: {
      input: usage?.prompt_tokens || 0,
      output: usage?.completion_tokens || 0
    }
  }
}

async function transcribeWithAnthropic(
  base64Image: string,
  _mimeType: string,
  settings: AISettings,
  prompt: string,
  template: Template
): Promise<TranscriptionResultWithUsage> {
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
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64Image
              }
            },
            {
              type: 'text',
              text: 'Analyse cet article et extrais les informations demandées.'
            }
          ]
        }
      ]
    },
    {
      headers: {
        'x-api-key': settings.anthropicApiKey || settings.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    }
  )

  const content = response.data.content[0]?.text || ''
  const usage = response.data.usage
  const result = parseTranscriptionResponse(content, template)

  return {
    ...result,
    usage: {
      input: usage?.input_tokens || 0,
      output: usage?.output_tokens || 0
    }
  }
}

function parseTranscriptionResponse(content: string, template: Template): TranscriptionResult {
  try {
    // Check if AI refused to process (common refusal patterns)
    const refusalPatterns = [
      /^je ne (peux|suis)/i,
      /^i (cannot|can't|am unable)/i,
      /^désolé/i,
      /^sorry/i,
      /^malheureusement/i,
      /^unfortunately/i
    ]

    const isRefusal = refusalPatterns.some(pattern => pattern.test(content.trim()))
    if (isRefusal) {
      // Return first 200 chars of AI response as error message
      const errorMsg = content.trim().substring(0, 200)
      return {
        success: false,
        error: errorMsg,
        rawContent: content
      }
    }

    let jsonStr = content;

    // 1. Extraction du Markdown
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // 2. NETTOYAGE : Échapper les guillemets internes
    const fixedJsonStr = jsonStr.replace(/([a-zA-ZÀ-ÿ0-9])"([a-zA-ZÀ-ÿ0-9])/g, '$1\\"$2');

    // 3. On parse la string NETTOYÉE
    const parsed = JSON.parse(fixedJsonStr);

    // 4. Build fields object from template
    const fields: Record<string, string> = {}
    for (const field of template.fields) {
      const rawValue = parsed[field.name] || ''
      // Convert to HTML for richtext fields
      if (field.type === 'richtext' && rawValue) {
        fields[field.name] = textToHtml(rawValue)
      } else {
        fields[field.name] = rawValue
      }
    }

    return {
      success: true,
      data: { fields }
    }
  } catch (error) {
    // If JSON parsing fails, return error with context
    console.error('Failed to parse JSON response:', error)

    // If content looks like a message rather than JSON, show it
    const trimmed = content.trim()
    const looksLikeMessage = !trimmed.startsWith('{') && !trimmed.startsWith('[')

    return {
      success: false,
      error: looksLikeMessage ? trimmed.substring(0, 200) : 'Échec du parsing de la réponse IA',
      rawContent: content
    }
  }
}

// Convert plain text with newlines to HTML paragraphs
function textToHtml(text: string): string {
  if (!text) return ''

  // Split by double newlines (paragraph breaks)
  const paragraphs = text.split(/\n\n+/)

  return paragraphs
    .map(p => {
      // Trim and replace single newlines with <br>
      const content = p.trim().replace(/\n/g, '<br>')
      return content ? `<p>${content}</p>` : ''
    })
    .filter(Boolean)
    .join('')
}
