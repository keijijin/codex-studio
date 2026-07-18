import type { LLMProviderId } from './types'

export type RoutingMode = 'fixed' | 'auto' | 'fallback-only'

export type TaskKind =
  | 'chat_simple'
  | 'chat_long'
  | 'agent_code'
  | 'agent_explore'
  | 'team'
  | 'unknown'

export interface ModelCandidate {
  provider: LLMProviderId
  model: string
}

export interface RoutingSettings {
  mode: RoutingMode
  /** Tried after the primary model on failure (and as auto profile base). */
  fallbackChain: ModelCandidate[]
  /** Optional per-task overrides for auto mode. */
  profiles?: Partial<Record<TaskKind, ModelCandidate[]>>
  /** Max providers/models to try per turn. */
  maxAttempts: number
}

/** Retired Anthropic IDs → current replacements (as of 2026-07). */
const RETIRED_MODEL_IDS: Record<string, string> = {
  'claude-sonnet-4-20250514': 'claude-sonnet-4-6',
  'claude-opus-4-20250514': 'claude-opus-4-8',
  'claude-3-7-sonnet-20250219': 'claude-sonnet-4-6',
  'claude-3-5-sonnet-20241022': 'claude-sonnet-4-6',
  'claude-3-5-haiku-20241022': 'claude-haiku-4-5',
  'claude-3-opus-20240229': 'claude-opus-4-8',
  'claude-opus-4-1-20250805': 'claude-opus-4-8',
}

export const DEFAULT_ANTHROPIC_SONNET = 'claude-sonnet-4-6'
export const DEFAULT_ANTHROPIC_HAIKU = 'claude-haiku-4-5'

export function migrateModelId(modelId: string): string {
  return RETIRED_MODEL_IDS[modelId] ?? modelId
}

export const DEFAULT_FALLBACK_CHAIN: ModelCandidate[] = [
  { provider: 'openai', model: 'gpt-4o' },
  { provider: 'anthropic', model: DEFAULT_ANTHROPIC_SONNET },
  { provider: 'ollama', model: 'qwen2.5-coder:14b' },
]

export const DEFAULT_ROUTING: RoutingSettings = {
  mode: 'fixed',
  fallbackChain: [...DEFAULT_FALLBACK_CHAIN],
  maxAttempts: 3,
}

export function candidateKey(c: ModelCandidate): string {
  return `${c.provider}:${c.model}`
}

export function normalizeRoutingSettings(
  raw: Partial<RoutingSettings> | undefined,
): RoutingSettings {
  const mode = raw?.mode
  const normalizedMode: RoutingMode =
    mode === 'auto' || mode === 'fallback-only' || mode === 'fixed' ? mode : DEFAULT_ROUTING.mode

  const chain = Array.isArray(raw?.fallbackChain) && raw.fallbackChain.length > 0
    ? raw.fallbackChain
        .filter(
          (c): c is ModelCandidate =>
            !!c &&
            (c.provider === 'openai' || c.provider === 'anthropic' || c.provider === 'ollama') &&
            typeof c.model === 'string' &&
            c.model.length > 0,
        )
        .map((c) => ({ ...c, model: migrateModelId(c.model) }))
    : [...DEFAULT_FALLBACK_CHAIN]

  const maxAttemptsRaw = raw?.maxAttempts
  const maxAttempts =
    typeof maxAttemptsRaw === 'number' && Number.isFinite(maxAttemptsRaw)
      ? Math.min(5, Math.max(1, Math.floor(maxAttemptsRaw)))
      : DEFAULT_ROUTING.maxAttempts

  const profiles = raw?.profiles
    ? (Object.fromEntries(
        Object.entries(raw.profiles).map(([kind, list]) => [
          kind,
          (list ?? []).map((c) => ({ ...c, model: migrateModelId(c.model) })),
        ]),
      ) as RoutingSettings['profiles'])
    : undefined

  return {
    mode: normalizedMode,
    fallbackChain: chain.length > 0 ? chain : [...DEFAULT_FALLBACK_CHAIN],
    profiles,
    maxAttempts,
  }
}
