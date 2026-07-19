import type { CostTier } from './catalog'
import type { TaskKind } from './types'

export interface ClassifyInput {
  prompt: string
  runMode: 'chat' | 'agent'
  isTeam?: boolean
}

export interface ClassifyResult {
  taskKind: TaskKind
  /** Starting cost tier for cascade routing */
  tier: CostTier
  /** 0–10 complexity heuristic */
  score: number
  /** Rough input size proxy (chars / 4) */
  estimatedTokens: number
}

const CODE_HINT =
  /\b(refactor|implement|fix|bug|test|pr\b|diff|typescript|python|rust|shell|ipc|api|function|class|file)\b/i
const CODE_HINT_JA = /(コード|実装|修正|リファクタ|バグ|テスト|レビュー)/

const EXPLORE_HINT =
  /\b(find|search|where|locate|explore|list|grep)\b/i
const EXPLORE_HINT_JA = /(どこ|探|一覧|検索)/

const HARD_HINT =
  /\b(architecture|architect|rca|root.?cause|security|vulnerability|CVE|compliance|legal|design.?doc|multi.?agent|migrate|migration|performance|deadlock|distributed|kubernetes|openshift)\b/i
const HARD_HINT_JA =
  /(アーキテクチャ|設計|障害|根本原因|セキュリティ|法務|大規模|複雑)/

const LIGHT_CODE_HINT =
  /\b(script|snippet|rename|typo|format|lint)\b/i
const LIGHT_CODE_HINT_JA = /(コメント|一言|簡単|軽い|小修正)/

function hasCodeHint(prompt: string): boolean {
  return CODE_HINT.test(prompt) || CODE_HINT_JA.test(prompt)
}
function hasExploreHint(prompt: string): boolean {
  return EXPLORE_HINT.test(prompt) || EXPLORE_HINT_JA.test(prompt)
}
function hasHardHint(prompt: string): boolean {
  return HARD_HINT.test(prompt) || HARD_HINT_JA.test(prompt)
}
function hasLightCodeHint(prompt: string): boolean {
  return LIGHT_CODE_HINT.test(prompt) || LIGHT_CODE_HINT_JA.test(prompt)
}

/**
 * Heuristic complexity / task classifier (no LLM call).
 * Drives cost-tiered Auto routing.
 */
export function classifyTask(input: ClassifyInput): ClassifyResult {
  const prompt = input.prompt.trim()
  const length = prompt.length
  const estimatedTokens = Math.max(1, Math.ceil(length / 4))

  if (input.isTeam) {
    return {
      taskKind: 'team',
      tier: 'premium',
      score: 8,
      estimatedTokens,
    }
  }

  let score = 0
  if (length > 12_000) score += 4
  else if (length > 4_000) score += 3
  else if (length > 1_200) score += 2
  else if (length > 400) score += 1

  if (hasHardHint(prompt)) score += 4
  if (hasCodeHint(prompt)) score += 2
  if (hasLightCodeHint(prompt)) score -= 2
  if (input.runMode === 'agent') score += 2
  if (hasExploreHint(prompt) && !hasCodeHint(prompt)) score -= 1

  score = Math.max(0, Math.min(10, score))

  if (input.runMode === 'agent') {
    if (hasExploreHint(prompt) && !hasHardHint(prompt) && !hasCodeHint(prompt)) {
      return {
        taskKind: 'agent_explore',
        tier: score >= 6 ? 'standard' : 'lite',
        score,
        estimatedTokens,
      }
    }
    if (score >= 8 || hasHardHint(prompt)) {
      return {
        taskKind: 'agent_hard',
        tier: 'premium',
        score,
        estimatedTokens,
      }
    }
    if (score <= 3 || hasLightCodeHint(prompt)) {
      return {
        taskKind: 'agent_code',
        tier: 'lite',
        score,
        estimatedTokens,
      }
    }
    return {
      taskKind: 'agent_code',
      tier: 'standard',
      score,
      estimatedTokens,
    }
  }

  // chat
  if (length > 4000 || score >= 6) {
    return {
      taskKind: 'chat_long',
      tier: score >= 8 ? 'premium' : 'standard',
      score,
      estimatedTokens,
    }
  }
  if (hasCodeHint(prompt) && length > 80) {
    return {
      taskKind: 'agent_code',
      tier: score >= 7 ? 'standard' : 'lite',
      score,
      estimatedTokens,
    }
  }
  return {
    taskKind: 'chat_simple',
    tier: 'lite',
    score,
    estimatedTokens,
  }
}

/** @deprecated Prefer classifyTask — kept for existing tests / callers */
export function classifyTaskKind(input: ClassifyInput): TaskKind {
  return classifyTask(input).taskKind
}
