/**
 * Cost-optimized model catalog (OpenAI / Anthropic / xAI).
 * Preferred IDs are refreshed against live /v1/models lists; aliases cover churn.
 */

import type { LLMProviderId } from '../types'
import type { ModelCandidate } from './types'

export type CostTier = 'lite' | 'standard' | 'premium'

export interface ProviderTier {
  lite: string
  standard: string
  premium: string
}

/** Preferred IDs first; later entries are fallbacks when the API list lacks the newest id. */
export const PREFERRED_MODEL_ALIASES: Record<
  'openai' | 'anthropic' | 'xai',
  Record<CostTier, string[]>
> = {
  openai: {
    lite: ['gpt-5.4-nano', 'gpt-5-nano', 'gpt-4.1-nano', 'gpt-4o-mini'],
    standard: ['gpt-5.4-mini', 'gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o'],
    premium: ['gpt-5.5', 'gpt-5.4', 'gpt-5', 'gpt-4o'],
  },
  anthropic: {
    lite: ['claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-3-5-haiku-latest'],
    standard: ['claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-sonnet-4-20250514'],
    premium: ['claude-opus-4-8', 'claude-opus-4-1', 'claude-opus-4-20250514'],
  },
  xai: {
    lite: [
      'grok-4-1-fast-non-reasoning',
      'grok-4-1-fast-reasoning',
      'grok-3-mini',
      'grok-3-fast',
    ],
    standard: ['grok-4.3', 'grok-4', 'grok-3'],
    premium: ['grok-4.5', 'grok-4', 'grok-3'],
  },
}

/** Static defaults used before the first catalog refresh. */
export const DEFAULT_PROVIDER_TIERS: Record<'openai' | 'anthropic' | 'xai', ProviderTier> = {
  openai: {
    lite: 'gpt-5.4-nano',
    standard: 'gpt-5.4-mini',
    premium: 'gpt-5.5',
  },
  anthropic: {
    lite: 'claude-haiku-4-5',
    standard: 'claude-sonnet-4-6',
    premium: 'claude-opus-4-8',
  },
  xai: {
    lite: 'grok-4-1-fast-non-reasoning',
    standard: 'grok-4.3',
    premium: 'grok-4.5',
  },
}

export const OLLAMA_BY_TIER: Record<CostTier, string> = {
  // Prefer installed lightweight coder; heavier tags are often absent locally
  lite: 'qwen2.5-coder:7b',
  standard: 'qwen2.5-coder:7b',
  premium: 'qwen2.5-coder:7b',
}

export interface ModelCatalogSnapshot {
  updatedAt: string
  /** ISO time after which a refresh should run */
  expiresAt: string
  tiers: {
    openai: ProviderTier
    anthropic: ProviderTier
    xai: ProviderTier
  }
  /** Raw ids seen from provider APIs (for debugging / resolution) */
  available?: Partial<Record<LLMProviderId, string[]>>
}

export const CATALOG_TTL_MS = 24 * 60 * 60 * 1000

export function createDefaultCatalog(now = Date.now()): ModelCatalogSnapshot {
  return {
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CATALOG_TTL_MS).toISOString(),
    tiers: {
      openai: { ...DEFAULT_PROVIDER_TIERS.openai },
      anthropic: { ...DEFAULT_PROVIDER_TIERS.anthropic },
      xai: { ...DEFAULT_PROVIDER_TIERS.xai },
    },
  }
}

export function isCatalogExpired(catalog: ModelCatalogSnapshot, now = Date.now()): boolean {
  const exp = Date.parse(catalog.expiresAt)
  return !Number.isFinite(exp) || exp <= now
}

/** Pick the best available model id for a preferred alias list. */
export function resolveModelId(preferred: string[], available: string[] | undefined): string {
  if (!available || available.length === 0) {
    return preferred[0]!
  }
  const set = new Set(available)
  for (const id of preferred) {
    if (set.has(id)) return id
  }
  for (const id of preferred) {
    const hit = available.find(
      (a) => a === id || a.startsWith(`${id}-`) || a.startsWith(`${id}/`),
    )
    if (hit) return hit
  }
  // Fuzzy: prefer ids that contain the family token (e.g. "nano", "haiku", "grok-4")
  for (const id of preferred) {
    const token = id.split('-').slice(0, 3).join('-')
    const hit = available.find((a) => a.includes(token) || token.includes(a))
    if (hit) return hit
  }
  return preferred[0]!
}

export function resolveProviderTiers(
  provider: 'openai' | 'anthropic' | 'xai',
  available: string[] | undefined,
): ProviderTier {
  const aliases = PREFERRED_MODEL_ALIASES[provider]
  return {
    lite: resolveModelId(aliases.lite, available),
    standard: resolveModelId(aliases.standard, available),
    premium: resolveModelId(aliases.premium, available),
  }
}

export function buildCatalogFromAvailability(
  available: Partial<Record<LLMProviderId, string[]>>,
  now = Date.now(),
): ModelCatalogSnapshot {
  return {
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CATALOG_TTL_MS).toISOString(),
    tiers: {
      openai: resolveProviderTiers('openai', available.openai),
      anthropic: resolveProviderTiers('anthropic', available.anthropic),
      xai: resolveProviderTiers('xai', available.xai),
    },
    available,
  }
}

/**
 * Cascade order for a starting tier: try at-tier first, escalate, then cheaper last.
 * lite → standard → premium
 * standard → premium → lite
 * premium → standard → lite
 */
export function cascadeTiers(start: CostTier): CostTier[] {
  if (start === 'lite') return ['lite', 'standard', 'premium']
  if (start === 'standard') return ['standard', 'premium', 'lite']
  return ['premium', 'standard', 'lite']
}

/** Provider preference within a tier (cost / coding strength). */
function providersForTier(
  tier: CostTier,
  taskHint: 'chat' | 'code' | 'team',
): Array<'xai' | 'openai' | 'anthropic'> {
  if (taskHint === 'code' || taskHint === 'team') {
    if (tier === 'lite') {
      // Coding-capable cheap models first (avoid non-reasoning Grok as primary for code)
      return ['openai', 'anthropic', 'xai']
    }
    // Claude strong on coding; then OpenAI; Grok as alternate
    return ['anthropic', 'openai', 'xai']
  }
  if (tier === 'lite') {
    // Cheapest / fastest chat first
    return ['xai', 'openai', 'anthropic']
  }
  return ['xai', 'anthropic', 'openai']
}

export function buildCostOptimizedProfile(
  startTier: CostTier,
  catalog: ModelCatalogSnapshot,
  options: { taskHint?: 'chat' | 'code' | 'team'; includeOllama?: boolean } = {},
): ModelCandidate[] {
  const taskHint = options.taskHint ?? 'chat'
  const includeOllama = options.includeOllama !== false
  const out: ModelCandidate[] = []
  const seen = new Set<string>()

  for (const tier of cascadeTiers(startTier)) {
    for (const provider of providersForTier(tier, taskHint)) {
      const model = catalog.tiers[provider][tier]
      const key = `${provider}:${model}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ provider, model })
    }
    if (includeOllama) {
      const model = OLLAMA_BY_TIER[tier]
      const key = `ollama:${model}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push({ provider: 'ollama', model })
      }
    }
  }
  return out
}
