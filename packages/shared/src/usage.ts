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
/** Sent from Settings when the user explicitly clears a stored API key. */
export const API_KEY_CLEAR = '__codex_clear_api_key__'

export function isRedactedApiKey(value: string | undefined): boolean {
  if (!value) return false
  return value === API_KEY_REDACTED || /^•+$/.test(value)
}

export function isClearApiKey(value: string | undefined): boolean {
  return value === API_KEY_CLEAR || value === ''
}

/**
 * Merge an incoming API-key field.
 * - `undefined` / redacted → keep current
 * - clear sentinel / empty → delete (empty string)
 * - otherwise → replace
 */
export function mergeApiKeyField(
  current: string | undefined,
  incoming: string | undefined,
): string | undefined {
  if (incoming === undefined || isRedactedApiKey(incoming)) return current
  if (isClearApiKey(incoming)) return ''
  return incoming
}
