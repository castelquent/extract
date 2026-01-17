import { ipcMain, app } from 'electron'
import axios from 'axios'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { TranscriptionResult, AISettings } from '@shared/types'

export function setupTranscriptionHandlers(): void {
  // Transcribe article image
  ipcMain.handle('transcription:transcribe', async (
    _,
    projectId: string,
    imagePath: string,
    settings: AISettings
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

      if (settings.provider === 'openai') {
        return await transcribeWithOpenAI(base64Image, mimeType, settings)
      } else {
        return await transcribeWithAnthropic(base64Image, mimeType, settings)
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
  settings: AISettings
): Promise<TranscriptionResult> {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: settings.model,
      messages: [
        {
          role: 'system',
          content: settings.prompt
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
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      }
    }
  )

  const content = response.data.choices[0]?.message?.content || ''
  return parseTranscriptionResponse(content)
}

async function transcribeWithAnthropic(
  base64Image: string,
  mimeType: string,
  settings: AISettings
): Promise<TranscriptionResult> {
  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: settings.model,
      max_tokens: 55000,
      system: settings.prompt,
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
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    }
  )

  const content = response.data.content[0]?.text || ''
  return parseTranscriptionResponse(content)
}

function parseTranscriptionResponse(content: string): TranscriptionResult {
  try {
    let jsonStr = content;

    // 1. Extraction du Markdown (ton code actuel)
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // 2. NETTOYAGE : Échapper les guillemets internes
    // Cette regex cherche les guillemets au milieu du texte (pas ceux de la structure JSON)
    // Elle regarde si le guillemet est entouré de lettres/chiffres (ex: "mot")
    const fixedJsonStr = jsonStr.replace(/([a-zA-ZÀ-ÿ0-9])"([a-zA-ZÀ-ÿ0-9])/g, '$1\\"$2');

    // 3. On parse la string NETTOYÉE
    const parsed = JSON.parse(fixedJsonStr);
    const rawContent = parsed.content || parsed.contenu || ''

    // Convert plain text to HTML paragraphs for Quill
    const htmlContent = textToHtml(rawContent)

    return {
      success: true,
      data: {
        title: parsed.title || parsed.titre || '',
        author: parsed.author || parsed.auteur || '',
        content: htmlContent
      }
    }
  } catch (error) {
    // If JSON parsing fails, try to extract data manually
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
