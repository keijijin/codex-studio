export interface LlmTokenUsage {
  inputTokens: number
  outputTokens: number
  /** Prompt-cache hits (Anthropic cache_read / OpenAI cached_tokens) */
  cachedInputTokens: number
}

export interface LlmUsageRecord extends LlmTokenUsage {
  ts: string
  sessionId?: string
  provider: string
  model: string
  mode: 'ask' | 'agent'
  latencyMs: number
  estimatedCostUsd: number
}

export const API_KEY_REDACTED = '••••••••'

export function isRedactedApiKey(value: string | undefined): boolean {
  if (!value) return false
  return value === API_KEY_REDACTED || /^•+$/.test(value)
}
