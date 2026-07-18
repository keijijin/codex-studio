import type { TaskKind } from './types'

export interface ClassifyInput {
  prompt: string
  runMode: 'chat' | 'agent'
  isTeam?: boolean
}

const CODE_HINT =
  /\b(refactor|implement|fix|bug|test|pr\b|diff|typescript|python|rust|shell|ipc|api|function|class|file|コード|実装|修正|リファクタ|バグ|テスト)\b/i

const EXPLORE_HINT =
  /\b(find|search|where|locate|explore|list|grep|どこ|探|一覧|検索)\b/i

/**
 * Lightweight heuristic classifier (no LLM call).
 */
export function classifyTaskKind(input: ClassifyInput): TaskKind {
  if (input.isTeam) return 'team'

  const prompt = input.prompt.trim()
  const length = prompt.length

  if (input.runMode === 'agent') {
    if (EXPLORE_HINT.test(prompt) && !CODE_HINT.test(prompt)) return 'agent_explore'
    return 'agent_code'
  }

  if (length > 4000) return 'chat_long'
  if (CODE_HINT.test(prompt) && length > 80) return 'agent_code'
  return 'chat_simple'
}
