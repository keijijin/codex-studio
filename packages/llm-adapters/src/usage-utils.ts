import type { LlmUsage } from './types'

/** Extract usage from OpenAI-compatible stream chunks (include_usage). */
export function usageFromOpenAIChunk(chunk: {
  usage?: {
    prompt_tokens?: number | null
    completion_tokens?: number | null
    prompt_tokens_details?: { cached_tokens?: number | null } | null
  } | null
}): LlmUsage | undefined {
  const u = chunk.usage
  if (!u) return undefined
  return {
    inputTokens: u.prompt_tokens ?? 0,
    outputTokens: u.completion_tokens ?? 0,
    cachedInputTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
  }
}
