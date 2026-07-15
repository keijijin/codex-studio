import type { AgentMessage } from '@codex/llm-adapters'

const CHARS_PER_TOKEN = 4
const DEFAULT_BUDGET = 100_000

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export function trimAgentHistory(
  messages: AgentMessage[],
  budgetTokens = DEFAULT_BUDGET,
): AgentMessage[] {
  const system = messages.filter((m) => m.role === 'system')
  const rest = messages.filter((m) => m.role !== 'system')

  if (rest.length === 0) return system

  const lastUserIdx = (() => {
    for (let i = rest.length - 1; i >= 0; i--) {
      if (rest[i].role === 'user') return i
    }
    return -1
  })()
  const pinned = lastUserIdx >= 0 ? rest.slice(lastUserIdx) : [rest[rest.length - 1]]
  const middle = lastUserIdx >= 0 ? rest.slice(0, lastUserIdx) : rest.slice(0, -1)

  const tokenCount = (msgs: AgentMessage[]) =>
    msgs.reduce((sum, m) => sum + estimateTokens(m.content), 0)

  let budget = budgetTokens - tokenCount(system) - tokenCount(pinned)
  const kept: AgentMessage[] = []

  for (let i = middle.length - 1; i >= 0; i--) {
    const msg = middle[i]
    let content = msg.content
    const tokens = estimateTokens(content)

    if (tokens > budget && msg.role === 'tool') {
      content = content.slice(0, budget * CHARS_PER_TOKEN) + '\n...(truncated)'
    }

    const used = estimateTokens(content)
    if (used > budget && kept.length > 0) break

    kept.unshift({ ...msg, content })
    budget -= used
  }

  return [...system, ...kept, ...pinned]
}
