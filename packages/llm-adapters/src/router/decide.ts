import { classifyTaskKind } from './classify'
import type {
  DecideRoutingInput,
  ModelCandidate,
  RoutingDecision,
  TaskKind,
} from './types'

/** Keep in sync with @codex/shared DEFAULT_ANTHROPIC_* (avoid circular dep). */
const SONNET = 'claude-sonnet-4-6'
const HAIKU = 'claude-haiku-4-5'

export const BUILTIN_AUTO_PROFILES: Record<TaskKind, ModelCandidate[]> = {
  chat_simple: [
    { provider: 'ollama', model: 'qwen2.5-coder:7b' },
    { provider: 'openai', model: 'gpt-4o-mini' },
    { provider: 'anthropic', model: HAIKU },
  ],
  chat_long: [
    { provider: 'anthropic', model: SONNET },
    { provider: 'openai', model: 'gpt-4o' },
    { provider: 'ollama', model: 'qwen2.5-coder:14b' },
  ],
  agent_code: [
    { provider: 'anthropic', model: SONNET },
    { provider: 'openai', model: 'gpt-4o' },
    { provider: 'ollama', model: 'qwen2.5-coder:14b' },
  ],
  agent_explore: [
    { provider: 'openai', model: 'gpt-4o-mini' },
    { provider: 'anthropic', model: HAIKU },
    { provider: 'ollama', model: 'qwen2.5-coder:7b' },
  ],
  team: [
    { provider: 'anthropic', model: SONNET },
    { provider: 'openai', model: 'gpt-4o' },
    { provider: 'ollama', model: 'qwen2.5-coder:14b' },
  ],
  unknown: [
    { provider: 'openai', model: 'gpt-4o' },
    { provider: 'anthropic', model: SONNET },
    { provider: 'ollama', model: 'qwen2.5-coder:14b' },
  ],
}

function keyOf(c: ModelCandidate): string {
  return `${c.provider}:${c.model}`
}

function dedupe(candidates: ModelCandidate[]): ModelCandidate[] {
  const seen = new Set<string>()
  const out: ModelCandidate[] = []
  for (const c of candidates) {
    const k = keyOf(c)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(c)
  }
  return out
}

function filterAvailable(
  candidates: ModelCandidate[],
  isAvailable: (c: ModelCandidate) => boolean,
): ModelCandidate[] {
  return candidates.filter(isAvailable)
}

function buildFallbackQueue(
  primary: ModelCandidate,
  fallbackChain: ModelCandidate[],
): ModelCandidate[] {
  return dedupe([primary, ...fallbackChain])
}

/**
 * Resolve which models to try for this turn.
 */
export function decideRouting(input: DecideRoutingInput): RoutingDecision {
  const maxAttempts = Math.min(5, Math.max(1, input.maxAttempts || 1))

  if (input.mode === 'fixed') {
    // Prefer the primary model, but keep available fallbacks for connection errors.
    const raw = buildFallbackQueue(input.primary, input.fallbackChain)
    const queue = filterAvailable(raw, input.isAvailable).slice(0, maxAttempts)
    const primaryAvailable = input.isAvailable(input.primary)
    const selected = primaryAvailable
      ? input.primary
      : (queue[0] ?? input.primary)
    return {
      mode: 'fixed',
      selected,
      reason: primaryAvailable
        ? `固定モデル ${selected.provider}:${selected.model}`
        : `固定モデル不可 → ${selected.provider}:${selected.model}`,
      queue: queue.length > 0 ? queue : [input.primary],
    }
  }

  if (input.mode === 'fallback-only') {
    const raw = buildFallbackQueue(input.primary, input.fallbackChain)
    const queue = filterAvailable(raw, input.isAvailable).slice(0, maxAttempts)
    const selected = queue[0] ?? input.primary
    return {
      mode: 'fallback-only',
      selected,
      reason: `フォールバック開始 ${selected.provider}:${selected.model}`,
      queue: queue.length > 0 ? queue : [input.primary],
    }
  }

  // auto
  const taskKind = classifyTaskKind({
    prompt: input.prompt ?? '',
    runMode: input.runMode,
    isTeam: input.isTeam,
  })
  const profile =
    input.profiles?.[taskKind] ??
    BUILTIN_AUTO_PROFILES[taskKind] ??
    BUILTIN_AUTO_PROFILES.unknown

  // Prefer the user's configured primary, then task profile, then fallback chain.
  // (Avoid starting on a local Ollama that may be offline while cloud keys exist.)
  const raw = dedupe([input.primary, ...profile, ...input.fallbackChain])
  const queue = filterAvailable(raw, input.isAvailable).slice(0, maxAttempts)
  const selected = queue[0] ?? input.primary

  return {
    mode: 'auto',
    selected,
    reason: `Auto (${taskKind}) → ${selected.provider}:${selected.model}`,
    queue: queue.length > 0 ? queue : [input.primary],
    taskKind,
  }
}
