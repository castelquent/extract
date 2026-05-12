import type { TranscriptionLog, AISettings, AIProvider } from '@shared/types'

export interface AIModelOption {
  value: string
  label: string
  provider: 'anthropic' | 'openai'
}

// Sources: platform.claude.com/docs/en/about-claude/models/overview & openai.com/api/pricing (mai 2026)
export const AI_MODELS: AIModelOption[] = [
  // Anthropic
  { value: 'claude-opus-4-7', label: 'Anthropic: Claude Opus 4.7', provider: 'anthropic' },
  { value: 'claude-sonnet-4-6', label: 'Anthropic: Claude Sonnet 4.6', provider: 'anthropic' },
  { value: 'claude-haiku-4-5-20251001', label: 'Anthropic: Claude Haiku 4.5', provider: 'anthropic' },
  // OpenAI
  { value: 'gpt-5.5', label: 'OpenAI: GPT-5.5', provider: 'openai' },
  { value: 'gpt-5.4', label: 'OpenAI: GPT-5.4', provider: 'openai' },
  { value: 'gpt-5.2', label: 'OpenAI: GPT-5.2', provider: 'openai' },
]

// Prix par million de tokens (en USD)
// Inclut les modèles courants ET les modèles legacy, pour que les anciens logs
// dans l'historique gardent un coût calculé correctement.
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // --- Anthropic — courants ---
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  // --- Anthropic — legacy (référencés par d'anciens logs) ---
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-opus-4-5-20251101': { input: 5, output: 25 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-opus-4-1-20250805': { input: 15, output: 75 },
  // --- OpenAI — courants ---
  'gpt-5.5': { input: 5, output: 30 },
  'gpt-5.4': { input: 2.5, output: 15 },
  'gpt-5.2': { input: 1.75, output: 14 },
  // --- OpenAI — legacy ---
  'gpt-5.2-pro': { input: 21, output: 168 },
  'gpt-5-mini': { input: 0.25, output: 2 },
  'gpt-4o': { input: 2.5, output: 10 },
}

export function calculateCost(log: TranscriptionLog): number {
  const pricing = MODEL_PRICING[log.model]
  if (!pricing) return 0
  const inputCost = (log.inputTokens / 1_000_000) * pricing.input
  const outputCost = (log.outputTokens / 1_000_000) * pricing.output
  return inputCost + outputCost
}

export function formatCost(cost: number): string {
  if (cost < 0.01) return `${(cost * 100).toFixed(4)}c`
  return `$${cost.toFixed(4)}`
}

/**
 * Trouve l'option correspondant à un model ID. Renvoie null si inconnu (peut
 * arriver si l'utilisateur a un ancien modèle stocké dans ses settings).
 */
export function findModel(modelId: string): AIModelOption | null {
  return AI_MODELS.find((m) => m.value === modelId) ?? null
}

/**
 * Renvoie l'ensemble des providers pour lesquels l'utilisateur a renseigné
 * une clé API (non vide). Utilisé pour griser les modèles inutilisables dans
 * les UIs de sélection.
 */
export function getAvailableProviders(ai: Pick<AISettings, 'anthropicApiKey' | 'openaiApiKey' | 'apiKey' | 'provider'>): Set<AIProvider> {
  const available = new Set<AIProvider>()
  if (ai.anthropicApiKey?.trim()) available.add('anthropic')
  if (ai.openaiApiKey?.trim()) available.add('openai')
  // Backward compat: la clé legacy `apiKey` s'applique au provider courant
  if (ai.apiKey?.trim()) available.add(ai.provider)
  return available
}
