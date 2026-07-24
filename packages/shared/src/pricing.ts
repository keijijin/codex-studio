/** Rough USD per 1M tokens — used for estimates only (not billing). */
export interface ModelPrice {
  inputPerMTok: number
  outputPerMTok: number
  /** Cached input discount (Anthropic/OpenAI style), 0–1 of input price */
  cachedInputPerMTok?: number
}

const PRICES: Array<{ match: RegExp; price: ModelPrice }> = [
  { match: /gpt-5\.5-pro/i, price: { inputPerMTok: 30, outputPerMTok: 180 } },
  { match: /gpt-5\.5/i, price: { inputPerMTok: 5, outputPerMTok: 30 } },
  { match: /gpt-5\.4-nano/i, price: { inputPerMTok: 0.2, outputPerMTok: 1.25 } },
  { match: /gpt-5\.4-mini/i, price: { inputPerMTok: 0.75, outputPerMTok: 4.5 } },
  { match: /gpt-5\.4/i, price: { inputPerMTok: 2.5, outputPerMTok: 15 } },
  { match: /gpt-4o-mini/i, price: { inputPerMTok: 0.15, outputPerMTok: 0.6 } },
  { match: /gpt-4o/i, price: { inputPerMTok: 2.5, outputPerMTok: 10 } },
  { match: /claude-opus/i, price: { inputPerMTok: 5, outputPerMTok: 25, cachedInputPerMTok: 0.5 } },
  { match: /claude-sonnet/i, price: { inputPerMTok: 3, outputPerMTok: 15, cachedInputPerMTok: 0.3 } },
  { match: /claude-haiku/i, price: { inputPerMTok: 1, outputPerMTok: 5, cachedInputPerMTok: 0.1 } },
  { match: /grok-4\.5/i, price: { inputPerMTok: 2, outputPerMTok: 6 } },
  { match: /grok-4\.3/i, price: { inputPerMTok: 1.25, outputPerMTok: 2.5 } },
  { match: /grok-4-1-fast|grok-3-mini|grok-3-fast/i, price: { inputPerMTok: 0.2, outputPerMTok: 0.5 } },
  { match: /grok/i, price: { inputPerMTok: 1, outputPerMTok: 2 } },
]

export function priceForModel(modelId: string): ModelPrice {
  for (const row of PRICES) {
    if (row.match.test(modelId)) return row.price
  }
  return { inputPerMTok: 1, outputPerMTok: 3 }
}

export interface UsageTotals {
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
}

export function estimateCostUsd(modelId: string, usage: UsageTotals): number {
  const p = priceForModel(modelId)
  const cachedRate = p.cachedInputPerMTok ?? p.inputPerMTok * 0.1
  const billableInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens)
  return (
    (billableInput / 1_000_000) * p.inputPerMTok +
    (usage.cachedInputTokens / 1_000_000) * cachedRate +
    (usage.outputTokens / 1_000_000) * p.outputPerMTok
  )
}
