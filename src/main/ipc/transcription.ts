import { ipcMain, app } from 'electron'
import axios from 'axios'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { TranscriptionResult, AISettings, Template } from '@shared/types'

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

      // Generate dynamic prompt from template
      const prompt = buildPromptFromTemplate(template)

      if (settings.provider === 'openai') {
        return await transcribeWithOpenAI(base64Image, mimeType, settings, prompt, template)
      } else {
        return await transcribeWithAnthropic(base64Image, mimeType, settings, prompt, template)
      }
    } catch (error) {
      console.error('Transcription error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })
}

async function transcribeWithOpenAI(
  base64Image: string,
  mimeType: string,
  settings: AISettings,
  prompt: string,
  template: Template
): Promise<TranscriptionResult> {
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
  return parseTranscriptionResponse(content, template)
}

async function transcribeWithAnthropic(
  base64Image: string,
  mimeType: string,
  settings: AISettings,
  prompt: string,
  template: Template
): Promise<TranscriptionResult> {
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
  return parseTranscriptionResponse(content, template)
}

function parseTranscriptionResponse(content: string, template: Template): TranscriptionResult {
  try {
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
    // If JSON parsing fails, return error
    console.error('Failed to parse JSON response:', error)

    return {
      success: false,
      error: 'Failed to parse AI response',
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
