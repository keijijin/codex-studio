/**
 * OpenAI Chat Completions token limit param.
 * GPT-5 / o-series reject legacy `max_tokens` and require `max_completion_tokens`.
 * The new param is accepted by current chat models generally.
 */
export function openAiMaxOutputParams(
  maxTokens: number | undefined,
): { max_completion_tokens: number } | Record<string, never> {
  if (!maxTokens || maxTokens <= 0) return {}
  return { max_completion_tokens: maxTokens }
}
