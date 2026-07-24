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
  /** Short rule id for debugging / UI reason strings */
  rule: string
}

/**
 * Auto routing policy (cost vs quality):
 *
 * | Tier     | When                                                         |
 * |----------|--------------------------------------------------------------|
 * | lite     | Short chat, explore-only, explicit tiny edits (rename/typo)  |
 * | standard | Default for Agent coding / normal fixes / medium chat        |
 * | premium  | Team, or strong multi-signal hard work (not a single keyword)|
 *
 * Premium must not fire on everyday words like 「修正」「設計」 alone.
 */

const CODE_HINT =
  /\b(refactor|implement|fix|bug|test|pr\b|diff|typescript|python|rust|shell|ipc|api|function|class|file|sql|rls)\b/i
const CODE_HINT_JA =
  /(コード|実装|修正|直して|リファクタ|バグ|テスト|レビュー|型エラー|コンパイル)/

const EXPLORE_HINT =
  /\b(find|search|where|locate|explore|list|grep|which file)\b/i
const EXPLORE_HINT_JA = /(どこ|探して|探[すせ]|一覧|検索|どのファイル)/

/** Explicit tiny edits — prefer lite even in Agent mode */
const LIGHT_HINT =
  /\b(rename|typo|format|lint|whitespace|comment only|one.?line|single.?file)\b/i
const LIGHT_HINT_JA =
  /(リネーム|改名|タイポ|誤字|フォーマット|整形|lint|一言|簡単|軽い|小修正|だけ(やって|修正|変更)?|1ファイル|一ファイル)/

/** Strong hard signals (each counts). Everyday 「設計」 alone is NOT enough. */
const HARD_STRONG =
  /\b(architecture|root.?cause|rca\b|vulnerability|CVE|compliance|deadlock|distributed|kubernetes|openshift|multi.?agent|threat.?model)\b/i
const HARD_STRONG_JA =
  /(アーキテクチャ|根本原因|脆弱性|セキュリティ監査|大規模移行|分散システム|マルチエージェント|脅威モデル)/

/** Weaker hard signals — need combination with size/scope */
const HARD_SOFT =
  /\b(security|migrate|migration|performance|design.?doc|rfc\b)\b/i
const HARD_SOFT_JA = /(セキュリティ|マイグレーション|性能|ボトルネック|設計書|仕様策定)/

const WIDE_SCOPE =
  /\b(entire|whole|codebase|monorepo|all files|every module)\b/i
const WIDE_SCOPE_JA = /(全体|全部|コードベース|一括|横断|すべてのファイル|リポジトリ全体)/

const IMPLEMENT_HINT =
  /\b(implement|add feature|write code|create|build)\b/i
const IMPLEMENT_HINT_JA = /(実装|機能追加|作って|書いて|追加して)/

function countMatches(prompt: string, ...patterns: RegExp[]): number {
  let n = 0
  for (const re of patterns) {
    if (re.test(prompt)) n++
  }
  return n
}

function has(prompt: string, ...patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(prompt))
}

function lengthScore(length: number): number {
  if (length > 12_000) return 4
  if (length > 4_000) return 3
  if (length > 1_500) return 2
  if (length > 500) return 1
  return 0
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
      score: 9,
      estimatedTokens,
      rule: 'team→premium',
    }
  }

  const isCode = has(prompt, CODE_HINT, CODE_HINT_JA)
  const isExplore = has(prompt, EXPLORE_HINT, EXPLORE_HINT_JA)
  const isLight = has(prompt, LIGHT_HINT, LIGHT_HINT_JA)
  const isImplement = has(prompt, IMPLEMENT_HINT, IMPLEMENT_HINT_JA)
  const wideScope = has(prompt, WIDE_SCOPE, WIDE_SCOPE_JA)
  const hardStrong = countMatches(prompt, HARD_STRONG, HARD_STRONG_JA)
  const hardSoft = countMatches(prompt, HARD_SOFT, HARD_SOFT_JA)

  let score = lengthScore(length)
  if (input.runMode === 'agent') score += 1
  if (isCode) score += 1
  if (isImplement) score += 1
  if (wideScope) score += 2
  if (hardStrong) score += 3 * hardStrong
  if (hardSoft) score += 1 * hardSoft
  if (isLight && !hardStrong) score -= 2
  if (isExplore && !isCode && !isImplement) score -= 1

  score = Math.max(0, Math.min(10, score))

  /** Premium only with strong multi-signal evidence */
  const premiumOk =
    hardStrong >= 2 ||
    (hardStrong >= 1 && (wideScope || length > 2_000 || hardSoft >= 1 || score >= 8)) ||
    (hardSoft >= 2 && (wideScope || length > 3_000))

  if (input.runMode === 'agent') {
    // Explore-only (no implement/fix verbs)
    if (isExplore && !isImplement && !has(prompt, /\b(fix|refactor|implement)\b/i, /(実装|修正|直して|リファクタ)/)) {
      return {
        taskKind: 'agent_explore',
        tier: premiumOk ? 'standard' : 'lite',
        score,
        estimatedTokens,
        rule: premiumOk ? 'explore+hard→standard' : 'explore→lite',
      }
    }

    if (premiumOk) {
      return {
        taskKind: 'agent_hard',
        tier: 'premium',
        score,
        estimatedTokens,
        rule: 'hard-multi-signal→premium',
      }
    }

    // Explicit tiny edit
    if (isLight && !wideScope && hardStrong === 0) {
      return {
        taskKind: 'agent_code',
        tier: 'lite',
        score,
        estimatedTokens,
        rule: 'light-edit→lite',
      }
    }

    // Default Agent coding: mid-tier (Sonnet / mini), not nano and not Opus
    return {
      taskKind: 'agent_code',
      tier: 'standard',
      score,
      estimatedTokens,
      rule: 'agent-default→standard',
    }
  }

  // --- chat ---
  if (premiumOk && length > 2_000) {
    return {
      taskKind: 'chat_long',
      tier: 'premium',
      score,
      estimatedTokens,
      rule: 'chat-hard-long→premium',
    }
  }
  if (length > 3_000 || (isCode && length > 1_200) || score >= 6) {
    return {
      taskKind: 'chat_long',
      tier: 'standard',
      score,
      estimatedTokens,
      rule: 'chat-long→standard',
    }
  }
  if (isCode && length > 60 && !isLight) {
    return {
      taskKind: 'agent_code',
      tier: 'standard',
      score,
      estimatedTokens,
      rule: 'chat-code→standard',
    }
  }
  if (isLight && isCode) {
    return {
      taskKind: 'agent_code',
      tier: 'lite',
      score,
      estimatedTokens,
      rule: 'chat-light-code→lite',
    }
  }
  return {
    taskKind: 'chat_simple',
    tier: 'lite',
    score,
    estimatedTokens,
    rule: 'chat-simple→lite',
  }
}

/** @deprecated Prefer classifyTask — kept for existing tests / callers */
export function classifyTaskKind(input: ClassifyInput): TaskKind {
  return classifyTask(input).taskKind
}
