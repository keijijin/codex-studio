import {
  buildCostOptimizedProfile,
  createDefaultCatalog,
  type CostTier,
  type ModelCatalogSnapshot,
} from './catalog'
import { classifyTask } from './classify'
import type {
  DecideRoutingInput,
  ModelCandidate,
  RoutingDecision,
  TaskKind,
} from './types'

export function builtinProfileFor(
  taskKind: TaskKind,
  tier: CostTier,
  catalog: ModelCatalogSnapshot = createDefaultCatalog(),
): ModelCandidate[] {
  const taskHint =
    taskKind === 'agent_code' || taskKind === 'agent_hard'
      ? 'code'
      : taskKind === 'team'
        ? 'team'
        : 'chat'
  const startTier: CostTier =
    taskKind === 'agent_hard' || taskKind === 'team'
      ? 'premium'
      : taskKind === 'chat_simple' || taskKind === 'agent_explore'
        ? tier === 'premium'
          ? 'standard'
          : tier
        : tier

  return buildCostOptimizedProfile(startTier, catalog, {
    taskHint,
  })
}

/** @deprecated Use builtinProfileFor with catalog — static snapshot for tests */
export const BUILTIN_AUTO_PROFILES: Record<TaskKind, ModelCandidate[]> = {
  chat_simple: builtinProfileFor('chat_simple', 'lite'),
  chat_long: builtinProfileFor('chat_long', 'standard'),
  agent_code: builtinProfileFor('agent_code', 'standard'),
  agent_explore: builtinProfileFor('agent_explore', 'lite'),
  agent_hard: builtinProfileFor('agent_hard', 'premium'),
  team: builtinProfileFor('team', 'premium'),
  unknown: builtinProfileFor('unknown', 'standard'),
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
 * Auto mode uses cost-tier cascade (lite → standard → premium) from the catalog.
 */
export function decideRouting(input: DecideRoutingInput): RoutingDecision {
  const maxAttempts = Math.min(5, Math.max(1, input.maxAttempts || 1))
  const catalog = input.catalog ?? createDefaultCatalog()

  if (input.mode === 'fixed') {
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

  // auto — cost-optimized cascade (do not force user's primary first)
  const classified = classifyTask({
    prompt: input.prompt ?? '',
    runMode: input.runMode,
    isTeam: input.isTeam,
  })
  const taskKind = classified.taskKind
  const profile =
    input.profiles?.[taskKind] ??
    builtinProfileFor(taskKind, classified.tier, catalog)

  const raw = dedupe([...profile, ...input.fallbackChain, input.primary])
  const queue = filterAvailable(raw, input.isAvailable).slice(0, maxAttempts)
  const selected = queue[0] ?? input.primary

  return {
    mode: 'auto',
    selected,
    reason:
      `Auto (${taskKind}/${classified.tier}, ${classified.rule}, ~${classified.estimatedTokens} tok, score ${classified.score})` +
      ` → ${selected.provider}:${selected.model}`,
    queue: queue.length > 0 ? queue : [input.primary],
    taskKind,
    tier: classified.tier,
    complexityScore: classified.score,
  }
}
