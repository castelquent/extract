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
  ensureDir,
  getArticleAssetPath,
  getArticleAssetsDir,
  getArticleExtractPdfPath,
  getArticleOcrOriginalMdPath,
  getArticleOcrTablesJsonPath,
  readArticleMetadata,
  writeArticleMetadata,
  writeJson,
  writeMdFile,
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

// Special field name we ALWAYS ask the LLM to produce: the cleaned-up
// markdown body of the document. Persisted to content.md (separate from
// the template's user-defined fields). The label is sent to the LLM as-is,
// so it shows up as a JSON key in the response.
const CONTENT_FIELD_KEY = 'Contenu'

// Few-shot example showing the LLM exactly how to handle the recurring
// pattern in archive scans: page numbers interpolated, body markers
// cumulative (¹²³…⁷), note bodies restarting at 1 per page and sometimes
// switching from superscript to plain digits, occasional missing notes.
// Teaching by example is more reliable than teaching by rule for this
// specific pattern (`+89%` precision on docs of this type in literature).
const FEWSHOT_EXAMPLE = {
  fr: `Suis la structure de l'exemple ci-dessous UNIQUEMENT si le document source contient des notes de bas de page. Sinon, transcris le source tel quel sans créer de section ## Notes.

EXEMPLE de transformation attendue:

SOURCE (markdown OCR brut, avec ses défauts):
"""
14

# Article exemple

Premier paragraphe avec note¹ et autre² référence.

¹ Première note bas de page
² Deuxième note bas de page

15

Suite du texte avec³ une troisième⁴ référence.

¹ Troisième note (le compteur a redémarré dans l'OCR)
² Quatrième note

16

Para final avec⁵ encore⁷ une référence.

5 Cinquième note (plain digit, plus de superscript)
"""

SORTIE ATTENDUE pour le champ Contenu:
"""
# Article exemple

Premier paragraphe avec note¹ et autre² référence.

Suite du texte avec³ une troisième⁴ référence.

Para final avec⁵ encore⁷ une référence.

---

## Notes

1. Première note bas de page
2. Deuxième note bas de page
3. Troisième note (le compteur a redémarré dans l'OCR)
4. Quatrième note
5. Cinquième note (plain digit, plus de superscript)
"""

OBSERVE: les numéros de page (14, 15, 16) sont supprimés. Les notes sont renumérotées 1-5 cumulativement, peu importe leurs marqueurs source (¹² OU digit brut). La note ⁷ n'a pas de texte correspondant dans le source: elle est OMISE sans aucune mention. Aucune fabrication.`,

  en: `Follow the structure in the example below ONLY if the source document contains footnotes. Otherwise, transcribe the source as-is without creating a ## Notes section.

EXAMPLE of the expected transformation:

SOURCE (raw OCR markdown, with its defects):
"""
14

# Sample Article

First paragraph with¹ a footnote and another² reference.

¹ First footnote body
² Second footnote body

15

Continuation with³ a third⁴ reference.

¹ Third note (counter restarted in OCR)
² Fourth note

16

Final para with⁵ a fifth⁷ reference.

5 Fifth note (plain digit, no superscript)
"""

EXPECTED OUTPUT for the Contenu field:
"""
# Sample Article

First paragraph with¹ a footnote and another² reference.

Continuation with³ a third⁴ reference.

Final para with⁵ a fifth⁷ reference.

---

## Notes

1. First footnote body
2. Second footnote body
3. Third note (counter restarted in OCR)
4. Fourth note
5. Fifth note (plain digit, no superscript)
"""

OBSERVE: page numbers (14, 15, 16) are stripped. Notes are renumbered 1-5 cumulatively, regardless of source markers (¹² OR plain digit). The ⁷ marker has no matching text in source: it is OMITTED with no mention. No fabrication.`,
}

const PROMPT_WRAPPERS: Record<'fr' | 'en', PromptWrapper> = {
  fr: {
    defaultContext: "Tu es un assistant spécialisé dans l'extraction de texte à partir de documents PDF.",
    analyseLine: 'Analyse le document et retourne un JSON avec les champs suivants:',
    rulesHeader: 'RÈGLES STRICTES:',
    rules: [
      "Tu es un transcripteur fidèle, pas un assistant. Ton rôle: reproduire le document, jamais le compléter, l'enrichir, ni le commenter.",
      "Ton document source = le markdown qui suit. Rien d'autre n'existe. Si tu ne vois pas un mot, une note ou un passage dans ce markdown, alors il n'existe pas pour toi. Ne le complète JAMAIS avec tes connaissances générales.",
      "N'invente AUCUN contenu absent du source: ni note, ni paragraphe, ni mot, ni phrase, ni conclusion. Si une référence ou un marqueur existe sans son texte correspondant, ignore-le sans rien combler.",
      "Préserve EXACTEMENT les références markdown d'images (`![alt](url)`) et de liens. Ne les supprime jamais, ne les réécris pas, ne les remplaces pas par une description textuelle. Si une image apparaît dans le source markdown, elle doit apparaître à la même position dans ta sortie.",
      "Tu peux SEULEMENT: supprimer (numéros de page isolés, en-têtes/pieds répétés) et repositionner (notes à la fin). Pas de réécriture, pas de correction, pas de paraphrase, pas de synthèse.",
      "COLONNES INTERLEAVÉES (exception fidélité structurelle): si tu constates que l'OCR a produit un texte clairement incohérent en séquence — par exemple, des paragraphes consécutifs sans aucun lien sémantique qui semblent venir de colonnes différentes — tu PEUX réordonner les paragraphes/blocs pour reconstituer un ordre de lecture cohérent (par colonne: colonne 1 haut-en-bas, puis colonne 2 haut-en-bas, etc.). Tu ne modifies AUCUN mot, tu réordonnes seulement les blocs. Si la séquence est cohérente, ne touche à rien.",
      `Place le contenu des notes (uniquement celles présentes dans le source) à la fin du champ \"${CONTENT_FIELD_KEY}\" sous \"## Notes\" précédé d'une ligne horizontale (---). Marqueurs (¹²³ etc.) préservés inline dans le corps.`,
      "Encode les accents en UTF-8 et échappe les guillemets internes (\\\") pour que le JSON reste valide.",
      'Réponds uniquement avec le JSON.',
    ],
  },
  en: {
    defaultContext: 'You are an assistant specialised in extracting text from PDF documents.',
    analyseLine: 'Analyse the document and return a JSON with the following fields:',
    rulesHeader: 'STRICT RULES:',
    rules: [
      "You are a faithful transcriber, not an assistant. Your role: reproduce the document, never complete, enrich, or comment on it.",
      "Your source document = the markdown that follows. Nothing else exists. If you don't see a word, note, or passage in this markdown, then it does NOT exist for you. NEVER fill in from your general knowledge.",
      "Do NOT invent any content absent from the source: no note, no paragraph, no word, no sentence, no conclusion. If a reference or marker exists without its matching text, ignore it without filling anything in.",
      "Preserve EXACTLY markdown image references (`![alt](url)`) and links. Never strip them, rewrite them, or replace them with a textual description. If an image appears in the source markdown, it must appear at the same position in your output.",
      "You may ONLY: remove (isolated page numbers, repeated headers/footers) and reposition (notes to the end). No rewriting, no correcting, no paraphrasing, no summarising.",
      "INTERLEAVED COLUMNS (structural fidelity exception): if you notice the OCR produced a clearly incoherent sequence — e.g., consecutive paragraphs with no semantic link that seem to come from different columns — you MAY reorder paragraphs/blocks to reconstruct a coherent reading order (column by column: column 1 top-to-bottom, then column 2 top-to-bottom, etc.). You modify NO words; you only reorder blocks. If the sequence is coherent, leave it alone.",
      `Place note bodies (only those present in the source) at the end of the \"${CONTENT_FIELD_KEY}\" field under \"## Notes\" preceded by a horizontal rule (---). Markers (¹²³ etc.) preserved inline in the body.`,
      "Encode accents in UTF-8 and escape internal quotation marks (\\\") so the JSON stays valid.",
      'Reply with the JSON only.',
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
  const schemaLines = [...schema]
    .sort((a, b) => a.order - b.order)
    .map((f) => {
      const { name, aiHint } = resolveFieldLabel(f, templates, templateId)
      return aiHint ? `- ${name} (${aiHint})` : `- ${name}`
    })
  // The implicit Contenu field is appended last in the list so the LLM
  // surfaces it as a normal JSON key alongside the template metadata.
  const contentHint =
    lang === 'fr'
      ? 'Le texte intégral du document, en markdown propre. Notes de bas de page regroupées à la fin.'
      : 'The full document body, in clean markdown. Footnotes grouped at the end.'
  schemaLines.push(`- ${CONTENT_FIELD_KEY} (${contentHint})`)
  const fieldsList = schemaLines.join('\n')
  const context = resolvedContext || wrap.defaultContext
  const fewshot = FEWSHOT_EXAMPLE[lang]
  return `${context}

${wrap.analyseLine}
${fieldsList}

${wrap.rulesHeader}
${wrap.rules.map((r) => `- ${r}`).join('\n')}

${fewshot}`
}

function providerLabel(provider: string): string {
  if (provider === 'openai') return 'OpenAI'
  if (provider === 'mistral') return 'Mistral'
  return 'Anthropic'
}

function parseApiError(error: any, provider: string): string {
  if (error.response) {
    const status = error.response.status
    const data = error.response.data
    if (status === 401) {
      return `Clé API ${providerLabel(provider)} invalide. Vérifiez vos paramètres.`
    }
    if (status === 403) return "Accès refusé. Votre clé API n'a pas les permissions nécessaires."
    if (status === 429) return 'Limite de requêtes atteinte. Réessayez dans quelques minutes.'
    if (status === 500 || status === 502 || status === 503) {
      return `Service ${providerLabel(provider)} temporairement indisponible. Réessayez plus tard.`
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
      // For markdown fields, store the raw value as-is (the LLM is now
      // instructed to produce markdown directly). text/textarea stay strings.
      fields[field.name] = rawValue
    }
    // The implicit Contenu field (cleaned markdown body) gets persisted to
    // content.md by the IPC handler, not into the fields map. Tolerate the
    // EN label too in case an EN-prompted call slips through.
    const contentValue =
      typeof parsed[CONTENT_FIELD_KEY] === 'string'
        ? parsed[CONTENT_FIELD_KEY]
        : typeof parsed['Content'] === 'string'
          ? parsed['Content']
          : undefined
    return { success: true, data: { fields, content: contentValue } }
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

type ResultWithUsage = TranscriptionResult & {
  usage?: { input: number; output: number }
  pages?: number
  // Debug sidecar: raw OCR markdown before LLM cleanup. Set by the Mistral
  // 2-step path so the IPC handler can drop it as ocr_original.md next to
  // content.md for diff'ing what the chat extraction changed.
  rawOcr?: string
}

// Build a JSON Schema from the article's snapshotted TemplateField[] for
// Mistral OCR's `document_annotation_format`. Every field becomes a required
// string property keyed by the *asked* name (live label for default-template
// fields, snapshot name for customs) so the response shape matches what the
// existing parser expects.
function buildAnnotationJsonSchema(
  schema: TemplateField[],
  templateId: string | undefined
): { name: string; schema: Record<string, unknown> } {
  const templates = loadTemplates()
  const properties: Record<string, { type: string; description?: string }> = {}
  const required: string[] = []
  for (const field of [...schema].sort((a, b) => a.order - b.order)) {
    const { name: askedName, aiHint } = resolveFieldLabel(field, templates, templateId)
    properties[askedName] = aiHint ? { type: 'string', description: aiHint } : { type: 'string' }
    required.push(askedName)
  }
  // Always include the implicit Contenu field so single-step Mistral
  // produces the cleaned-up body alongside the metadata.
  properties[CONTENT_FIELD_KEY] = {
    type: 'string',
    description: 'Texte intégral du document remis en forme en markdown. Notes de bas de page regroupées à la fin.',
  }
  required.push(CONTENT_FIELD_KEY)
  return {
    name: 'ExtractedFields',
    schema: {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    },
  }
}

// Strip Mistral OCR placeholder syntax that may leak into annotated field
// values (e.g. `![img-0.jpeg](img-0.jpeg)` for images, `[tbl-3.html](tbl-3.html)`
// for tables). Phase 2 will treat these as first-class inline assets; for
// now they're noise inside text fields.
// Markdown tables require both a header row AND a separator line below it.
// Mistral OCR sometimes emits "table continuations" that are body rows only
// (pipes with no header above) when a table spans multiple visual sections.
// This walks the markdown line by line and prefixes any such orphan body
// run with an empty header + separator so it renders as a valid table in
// Milkdown. Pure structural plumbing, no data is added or modified.
function completeMarkdownTables(md: string): string {
  if (!md) return md
  const lines = md.split('\n')
  const isPipeRow = (l: string): boolean => /^\s*\|.*\|\s*$/.test(l)
  // Separator row: a pipe row whose cells contain only dashes (with optional
  // colons for alignment) and whitespace.
  const isSeparator = (l: string): boolean =>
    /^\s*\|(\s*:?-+:?\s*\|)+\s*$/.test(l)
  // Cell count for a pipe row: number of `|` minus 1.
  const cellCount = (l: string): number => Math.max(1, (l.match(/\|/g) ?? []).length - 1)

  const out: string[] = []
  let inFence = false
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // Skip everything inside fenced code blocks so we don't touch code.
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      out.push(line)
      i++
      continue
    }
    if (inFence || !isPipeRow(line)) {
      out.push(line)
      i++
      continue
    }
    // Collect the consecutive run of pipe rows.
    const runStart = i
    while (i < lines.length && isPipeRow(lines[i])) i++
    const run = lines.slice(runStart, i)
    // Valid markdown table: 2nd line of the run is a separator (1st line is
    // the header). Leave it alone.
    if (run.length >= 2 && isSeparator(run[1])) {
      out.push(...run)
      continue
    }
    // Orphan body-only run: inject empty header + separator before it.
    const cols = cellCount(run[0])
    const emptyHeader = '|' + ' |'.repeat(cols)
    const separator = '|' + '---|'.repeat(cols)
    out.push(emptyHeader, separator, ...run)
  }
  return out.join('\n')
}

function stripMistralPlaceholders(value: string): string {
  if (!value) return value
  return value
    .replace(/!\[img-[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[tbl-[^\]]*\]\([^)]*\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function parseMistralAnnotation(
  annotation: unknown,
  schema: TemplateField[],
  templateId: string | undefined
): TranscriptionResult {
  try {
    const parsed: Record<string, unknown> =
      typeof annotation === 'string' ? JSON.parse(annotation) : (annotation as Record<string, unknown>)
    if (!parsed || typeof parsed !== 'object') {
      return { success: false, error: 'Réponse Mistral OCR vide ou malformée' }
    }
    const templates = loadTemplates()
    const fields: Record<string, string> = {}
    for (const field of schema) {
      const { name: askedName } = resolveFieldLabel(field, templates, templateId)
      const raw = parsed[askedName] ?? parsed[field.name] ?? ''
      const cleaned = stripMistralPlaceholders(String(raw))
      // All values stored as-is. Markdown fields hold markdown source, text
      // fields hold plain strings, no HTML wrapping anywhere.
      fields[field.name] = cleaned
    }
    const rawContent =
      typeof parsed[CONTENT_FIELD_KEY] === 'string'
        ? parsed[CONTENT_FIELD_KEY]
        : typeof parsed['Content'] === 'string'
          ? parsed['Content']
          : undefined
    const content = rawContent !== undefined ? stripMistralPlaceholders(rawContent) : undefined
    return { success: true, data: { fields, content } }
  } catch (err) {
    console.error('Failed to parse Mistral annotation:', err)
    const rawContent = typeof annotation === 'string' ? annotation : JSON.stringify(annotation)
    return { success: false, error: 'Échec du parsing de la réponse Mistral OCR', rawContent }
  }
}

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

// Mistral models we expose follow a "+variant" convention to flag two-step
// pipelines: "mistral-ocr-latest" runs the single-step OCR with built-in
// annotation, "mistral-ocr-latest+small" / "+large" run OCR brut then a chat
// completion to extract structured fields (bypasses the NULL-byte bug and
// the historical 8-page annotation cap).
const MISTRAL_CHAT_VARIANT_MAP: Record<string, string> = {
  small: 'mistral-small-latest',
  large: 'mistral-large-latest',
}

async function transcribeWithMistral(
  base64Pdf: string,
  settings: AISettings,
  prompt: string,
  schema: TemplateField[],
  templateId: string | undefined,
  // Article location needed to write inline images into the article's
  // assets/ folder and rewrite markdown URLs to extract-asset://...
  projectId: string,
  dossierId: string | null,
  articleId: string
): Promise<ResultWithUsage> {
  const [ocrModel, variant] = settings.model.split('+')
  if (variant && MISTRAL_CHAT_VARIANT_MAP[variant]) {
    return transcribeWithMistralTwoStep(
      base64Pdf,
      settings,
      prompt,
      schema,
      templateId,
      ocrModel,
      MISTRAL_CHAT_VARIANT_MAP[variant],
      projectId,
      dossierId,
      articleId
    )
  }
  return transcribeWithMistralSingleStep(base64Pdf, settings, prompt, schema, templateId)
}

async function transcribeWithMistralSingleStep(
  base64Pdf: string,
  settings: AISettings,
  prompt: string,
  schema: TemplateField[],
  templateId: string | undefined
): Promise<ResultWithUsage> {
  const annotationFormat = buildAnnotationJsonSchema(schema, templateId)
  // Cache-bust nonce: Mistral OCR appears to cache responses by request
  // hash. We observed a bad result returning in ~500ms on subsequent calls,
  // way too fast for real OCR+annotation. Appending a per-call nonce to the
  // prompt forces a fresh inference every time.
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const noncedPrompt = `${prompt}\n\n[request-id: ${nonce}]`
  const response = await axios.post(
    'https://api.mistral.ai/v1/ocr',
    {
      model: settings.model,
      document: {
        type: 'document_url',
        document_url: `data:application/pdf;base64,${base64Pdf}`,
      },
      document_annotation_format: {
        type: 'json_schema',
        // NOTE: strict mode disabled. Mistral's constrained decoder has a
        // bug on dense French text from scan-only PDFs where multibyte UTF-8
        // (é, à, etc.) gets corrupted into NULL bytes (U+0000). The schema
        // still guides the output via prompting, just without per-token
        // validation. Our parser is already tolerant of minor drift.
        json_schema: annotationFormat,
      },
      document_annotation_prompt: noncedPrompt,
    },
    {
      headers: {
        Authorization: `Bearer ${settings.mistralApiKey || settings.apiKey}`,
        'Content-Type': 'application/json',
      },
      // Mistral OCR can take a while on multi-page docs.
      timeout: 600_000,
    }
  )
  const annotation = response.data?.document_annotation
  const pagesProcessed = response.data?.usage_info?.pages_processed ?? response.data?.pages?.length ?? 0

  // Diagnostic: dump the raw OCR markdown before the annotation step ran so
  // we can tell whether accent loss / character drops happen at the vision
  // OCR layer or at the annotation LLM layer. Logged verbatim, no truncation.
  const rawPages: Array<{ index?: number; markdown?: string }> = response.data?.pages ?? []
  console.log('\n[v2:transcribe:mistral] === Raw OCR markdown ===')
  for (const p of rawPages) {
    console.log(`--- page ${p.index ?? '?'} ---`)
    console.log(p.markdown ?? '(empty)')
  }
  console.log('[v2:transcribe:mistral] === Document annotation (JSON string) ===')
  console.log(typeof annotation === 'string' ? annotation : JSON.stringify(annotation))
  console.log('[v2:transcribe:mistral] ===============================\n')

  if (annotation === undefined || annotation === null) {
    return {
      success: false,
      error: "Mistral OCR n'a pas renvoyé de champs structurés. Réessayez ou vérifiez le modèle.",
      rawContent: JSON.stringify(response.data).slice(0, 4000),
      pages: pagesProcessed,
    }
  }
  const result = parseMistralAnnotation(annotation, schema, templateId)
  return { ...result, usage: { input: 0, output: 0 }, pages: pagesProcessed }
}

async function transcribeWithMistralTwoStep(
  base64Pdf: string,
  settings: AISettings,
  prompt: string,
  schema: TemplateField[],
  templateId: string | undefined,
  ocrModel: string,
  chatModel: string,
  projectId: string,
  dossierId: string | null,
  articleId: string
): Promise<ResultWithUsage> {
  // Step 1: raw OCR, no annotation. This is the path Mistral does best at
  // (vision-to-markdown), and bypasses the buggy document_annotation_format
  // pipeline that produced NULL bytes on some dense scans.
  const ocrResponse = await axios.post(
    'https://api.mistral.ai/v1/ocr',
    {
      model: ocrModel,
      document: {
        type: 'document_url',
        document_url: `data:application/pdf;base64,${base64Pdf}`,
      },
      // Ask Mistral to return inline images as base64. We decode them into
      // assets/img-N.<ext> and rewrite the markdown placeholders to point to
      // our custom extract-asset:// protocol so Milkdown renders them.
      include_image_base64: true,
      // Ask Mistral to extract tables separately as markdown. They come back
      // in pages[].tables[] with proper header/separator/body structure and
      // the placeholder in pages[].markdown gets substituted inline below.
      // Workaround for the OCR's tendency to drop the header separator on
      // tables that continue across page breaks.
      table_format: 'markdown',
    },
    {
      headers: {
        Authorization: `Bearer ${settings.mistralApiKey || settings.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 600_000,
    }
  )
  const pages: Array<{
    index?: number
    markdown?: string
    images?: Array<{ id?: string; image_base64?: string }>
    tables?: Array<{ id?: string; content?: string; format?: string }>
  }> = ocrResponse.data?.pages ?? []
  const pagesProcessed = ocrResponse.data?.usage_info?.pages_processed ?? pages.length

  // Persist any inline images to the article's assets/ folder and build a
  // rewrite map so we can replace the markdown placeholders later. Image
  // ids from Mistral look like "img-0.jpeg" — we keep the same filename on
  // disk so the rewrite is a 1:1 substitution.
  const assetsDir = getArticleAssetsDir(projectId, dossierId, articleId)
  const urlRewrites: Array<{ id: string; url: string }> = []
  let imageCount = 0
  for (const page of pages) {
    for (const img of page.images ?? []) {
      if (!img.id || !img.image_base64) continue
      ensureDir(assetsDir)
      // image_base64 is a data URL like "data:image/jpeg;base64,...." — strip
      // the prefix to get just the encoded bytes.
      const commaIdx = img.image_base64.indexOf(',')
      const payload = commaIdx >= 0 ? img.image_base64.slice(commaIdx + 1) : img.image_base64
      const buffer = Buffer.from(payload, 'base64')
      const target = getArticleAssetPath(projectId, dossierId, articleId, img.id)
      writeFileSync(target, buffer)
      urlRewrites.push({
        id: img.id,
        // URL shape: extract-asset://a/{articleId}/{filename}. The "a"
        // hostname is a bidon — RFC 3986 lowercases hostnames so case-
        // sensitive ULIDs must live in the path.
        url: `extract-asset://a/${articleId}/${encodeURIComponent(img.id)}`,
      })
      imageCount++
    }
  }
  if (imageCount > 0) {
    console.log(`[v2:transcribe:mistral:2step] Saved ${imageCount} inline image(s) to assets/`)
  }

  // Rewrite markdown image placeholders: ![alt](id) → ![alt](extract-asset://...)
  // when the (id) matches one of the extracted image ids. Other markdown
  // links are untouched.
  const rewriteImageUrls = (md: string): string => {
    if (urlRewrites.length === 0) return md
    let out = md
    for (const { id, url } of urlRewrites) {
      // Match ![alt](id) or ![alt](id "title"), id can appear bare in OCR.
      const escId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`(!\\[[^\\]]*\\]\\()${escId}(\\s+\"[^\"]*\")?(\\))`, 'g')
      out = out.replace(re, `$1${url}$2$3`)
    }
    return out
  }

  // Collect table content (markdown) by id. Mistral emits placeholders in
  // pages[].markdown that look like [tbl-3.md](tbl-3.md) — we replace the
  // entire link with the table's actual markdown so it renders inline.
  const tableRewrites: Array<{ id: string; content: string }> = []
  for (const page of pages) {
    for (const tbl of page.tables ?? []) {
      if (!tbl.id) continue
      const content = tbl.content ?? ''
      if (!content.trim()) continue
      tableRewrites.push({ id: tbl.id, content: content.trim() })
    }
  }
  if (tableRewrites.length > 0) {
    console.log(`[v2:transcribe:mistral:2step] Substituted ${tableRewrites.length} table(s) inline`)
  }
  // Debug sidecar: dump the raw tables array so we can inspect what Mistral
  // actually returned when a placeholder doesn't get substituted.
  writeJson(
    getArticleOcrTablesJsonPath(projectId, dossierId, articleId),
    pages.map((p, i) => ({ page: p.index ?? i, tables: p.tables ?? [] }))
  )

  const rewriteTablePlaceholders = (md: string): string => {
    if (tableRewrites.length === 0) return md
    let out = md
    for (const { id, content } of tableRewrites) {
      const escId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // Match [text](id) link. The "text" portion is usually the id too but
      // Mistral may vary; we match any.
      const re = new RegExp(`\\[[^\\]]*\\]\\(${escId}\\)`, 'g')
      out = out.replace(re, `\n\n${content}\n\n`)
    }
    return out
  }

  const fullMarkdown = rewriteTablePlaceholders(
    rewriteImageUrls(
      pages
        .map((p) => p.markdown ?? '')
        .filter((m) => m.trim().length > 0)
        .join('\n\n---\n\n')
        .trim()
    )
  )

  console.log('\n[v2:transcribe:mistral:2step] === Raw OCR markdown ===')
  console.log(fullMarkdown || '(empty)')
  console.log('[v2:transcribe:mistral:2step] === End OCR ===\n')

  if (!fullMarkdown) {
    return {
      success: false,
      error: "Mistral OCR n'a renvoyé aucun texte exploitable.",
      pages: pagesProcessed,
    }
  }

  // 1s pacing between OCR and chat to stay under Mistral's RPS cap. The
  // small chat endpoint can be as low as 1.67 RPS on paid tier; without
  // this delay a single batch transcription can already hit 429.
  await new Promise((r) => setTimeout(r, 1000))

  // Step 2: chat completion that turns the markdown into structured fields.
  // Reuses the existing prompt (which already lists fields + rules) plus an
  // instruction to read from the markdown rather than re-analysing an image.
  const userMessage = `Voici le contenu OCR du document au format markdown. Extrais les champs demandés en respectant strictement les règles ci-dessus.\n\n---\n\n${fullMarkdown}`
  const chatResponse = await axios.post(
    'https://api.mistral.ai/v1/chat/completions',
    {
      model: chatModel,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 16000,
      temperature: 0,
    },
    {
      headers: {
        Authorization: `Bearer ${settings.mistralApiKey || settings.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 600_000,
    }
  )
  const content = chatResponse.data?.choices?.[0]?.message?.content || ''
  const usage = chatResponse.data?.usage

  console.log('[v2:transcribe:mistral:2step] === Chat extraction ===')
  console.log(content)
  console.log('[v2:transcribe:mistral:2step] === End chat ===\n')

  const result = parseTranscriptionResponse(content, schema, templateId)
  // The chat extraction is asked to produce a cleaned Contenu alongside the
  // metadata. Fall back to the raw OCR markdown only if the LLM dropped the
  // Contenu field for some reason — empty content would be worse than ugly.
  if (result.success && result.data) {
    if (!result.data.content || result.data.content.trim() === '') {
      result.data.content = fullMarkdown
    }
    // Structural fix-up: turn orphan body-row tables (continuations Mistral
    // OCR emitted without a header) into valid markdown tables with an
    // empty header. No data added; just markdown plumbing.
    result.data.content = completeMarkdownTables(result.data.content ?? '')
  }
  return {
    ...result,
    usage: { input: usage?.prompt_tokens || 0, output: usage?.completion_tokens || 0 },
    pages: pagesProcessed,
    rawOcr: fullMarkdown,
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

        const apiKey =
          settings.provider === 'openai'
            ? settings.openaiApiKey || settings.apiKey
            : settings.provider === 'mistral'
              ? settings.mistralApiKey || settings.apiKey
              : settings.anthropicApiKey || settings.apiKey
        if (!apiKey || apiKey.trim() === '') {
          return {
            success: false,
            error: `Clé API ${providerLabel(settings.provider)} non configurée. Allez dans Paramètres > IA.`,
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

        const result =
          settings.provider === 'openai'
            ? await transcribeWithOpenAI(base64, settings, prompt, schema, templateId)
            : settings.provider === 'mistral'
              ? await transcribeWithMistral(base64, settings, prompt, schema, templateId, projectId, dossierId, articleId)
              : await transcribeWithAnthropic(base64, settings, prompt, schema, templateId)

        appendLog({
          date: new Date().toISOString(),
          projectId,
          model: settings.model,
          provider: settings.provider,
          inputTokens: result.usage?.input || 0,
          outputTokens: result.usage?.output || 0,
          pages: result.pages,
          success: result.success,
          error: result.error,
        })

        // Persist filled fields + content.md on success. Status is unchanged
        // — "filled or not" is computed from fields + schema, not stored.
        if (result.success && result.data) {
          const updated: ArticleMetadata = {
            ...article,
            fields: { ...article.fields, ...(result.data.fields ?? {}) },
            // Only overwrite content.md when the provider returned new content.
            // Preserves a manually-edited content.md if a future re-extract
            // ever lacks the field.
            content: result.data.content ?? article.content ?? '',
            modifiedAt: new Date().toISOString(),
          }
          writeArticleMetadata(projectId, dossierId, articleId, updated)
          patchArticle(projectId, articleId, updated)
          touchProject(projectId)
        }
        // Debug sidecar: drop the raw OCR markdown next to content.md so we
        // can diff what the LLM cleanup changed. Only set by Mistral 2-step.
        if (result.success && result.rawOcr) {
          writeMdFile(
            getArticleOcrOriginalMdPath(projectId, dossierId, articleId),
            result.rawOcr
          )
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

  // Re-extract a single markdown sub-field from the current content.md.
  // Bypasses the OCR step entirely: we already have the source text, we just
  // ask an LLM to produce one focused value for the named field.
  ipcMain.handle(
    'v2:transcription:reextractField',
    async (
      _,
      projectId: string,
      articleId: string,
      fieldName: string,
      settings: AISettings
    ): Promise<{ success: boolean; value?: string; error?: string }> => {
      try {
        const dossierId = locateArticle(projectId, articleId)
        if (dossierId === undefined) return { success: false, error: 'Article introuvable' }
        const article = readArticleMetadata(projectId, dossierId, articleId)
        if (!article) return { success: false, error: 'Article introuvable' }
        if (!article.content?.trim()) {
          return { success: false, error: 'Aucun contenu à analyser. Lance d\'abord une transcription.' }
        }
        const field = (article.schema ?? []).find((f) => f.name === fieldName)
        if (!field || field.type !== 'markdown') {
          return { success: false, error: 'Champ introuvable ou non-markdown.' }
        }

        const templates = loadTemplates()
        const { name: askedName, aiHint } = resolveFieldLabel(field, templates, article.templateId)
        const lang = readAppLanguage()
        const systemPrompt =
          lang === 'fr'
            ? `Tu reçois le contenu markdown intégral d'un document. Extrais la valeur du champ "${askedName}"${aiHint ? ` (${aiHint})` : ''} sous forme de markdown. Réponds UNIQUEMENT avec la valeur, sans préambule, sans JSON, sans bloc de code.`
            : `You will receive the full markdown content of a document. Extract the value for the "${askedName}" field${aiHint ? ` (${aiHint})` : ''} as markdown. Reply ONLY with the value, no preamble, no JSON, no code block.`

        // Provider routing for the lightweight chat call. Mistral hybrid
        // models (mistral-ocr-latest+small/large) split into OCR + chat —
        // here we skip OCR and go straight to chat.
        let value = ''
        let inputTokens = 0
        let outputTokens = 0
        if (settings.provider === 'mistral') {
          const [, variant] = settings.model.split('+')
          const chatModel = MISTRAL_CHAT_VARIANT_MAP[variant] ?? 'mistral-large-latest'
          const r = await axios.post(
            'https://api.mistral.ai/v1/chat/completions',
            {
              model: chatModel,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: article.content },
              ],
              max_tokens: 8000,
              temperature: 0,
            },
            {
              headers: {
                Authorization: `Bearer ${settings.mistralApiKey || settings.apiKey}`,
                'Content-Type': 'application/json',
              },
              timeout: 600_000,
            }
          )
          value = r.data?.choices?.[0]?.message?.content || ''
          inputTokens = r.data?.usage?.prompt_tokens || 0
          outputTokens = r.data?.usage?.completion_tokens || 0
        } else if (settings.provider === 'openai') {
          const r = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
              model: settings.model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: article.content },
              ],
              max_completion_tokens: 8000,
            },
            {
              headers: {
                Authorization: `Bearer ${settings.openaiApiKey || settings.apiKey}`,
                'Content-Type': 'application/json',
              },
              timeout: 600_000,
            }
          )
          value = r.data?.choices?.[0]?.message?.content || ''
          inputTokens = r.data?.usage?.prompt_tokens || 0
          outputTokens = r.data?.usage?.completion_tokens || 0
        } else {
          const r = await axios.post(
            'https://api.anthropic.com/v1/messages',
            {
              model: settings.model,
              max_tokens: 8000,
              system: systemPrompt,
              messages: [{ role: 'user', content: article.content }],
            },
            {
              headers: {
                'x-api-key': settings.anthropicApiKey || settings.apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
              },
              timeout: 600_000,
            }
          )
          value = r.data?.content?.[0]?.text || ''
          inputTokens = r.data?.usage?.input_tokens || 0
          outputTokens = r.data?.usage?.output_tokens || 0
        }

        // Persist the new sub-field value alongside the rest of the article.
        const updated: ArticleMetadata = {
          ...article,
          fields: { ...article.fields, [fieldName]: value.trim() },
          modifiedAt: new Date().toISOString(),
        }
        writeArticleMetadata(projectId, dossierId, articleId, updated)
        patchArticle(projectId, articleId, updated)
        touchProject(projectId)

        appendLog({
          date: new Date().toISOString(),
          projectId,
          model: settings.model,
          provider: settings.provider,
          inputTokens,
          outputTokens,
          success: true,
        })

        return { success: true, value: value.trim() }
      } catch (error: any) {
        const errorMessage = parseApiError(error, settings.provider)
        return { success: false, error: errorMessage }
      }
    }
  )
}
