import type { AgentMessage } from '@codex/llm-adapters'

const CHARS_PER_TOKEN = 4
const DEFAULT_BUDGET = 100_000

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export function estimateMessagesTokens(messages: AgentMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0)
}

/**
 * Drop middle history under a token budget, pinning system + latest user turn.
 * When messages are dropped, insert a compact summary placeholder.
 */
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
  let dropped = 0

  for (let i = middle.length - 1; i >= 0; i--) {
    const msg = middle[i]
    let content = msg.content
    const tokens = estimateTokens(content)

    if (tokens > budget && msg.role === 'tool' && budget > 0) {
      const maxChars = Math.max(0, budget * CHARS_PER_TOKEN - 20)
      content = content.slice(0, maxChars) + '\n...(truncated)'
    }

    const used = estimateTokens(content)
    if (used > budget && kept.length > 0) {
      dropped += i + 1
      break
    }
    if (used > budget) {
      dropped++
      continue
    }

    kept.unshift({ ...msg, content })
    budget -= used
  }

  if (dropped > 0) {
    const summary: AgentMessage = {
      role: 'user',
      content:
        `[Compacted history] ${dropped} earlier message(s) were summarized away to stay within the context budget. Continue from the remaining conversation.`,
    }
    return [...system, summary, ...kept, ...pinned]
  }

  return [...system, ...kept, ...pinned]
}

/**
 * Heuristic compact for persisted chat: keep first user + recent tail,
 * replace the middle with a single summary message.
 */
export function compactMessageContents(
  contents: Array<{ role: string; content: string }>,
  keepRecent = 6,
): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
  if (contents.length <= keepRecent + 1) {
    return contents.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
      content: m.content,
    }))
  }

  const head = contents[0]
  const tail = contents.slice(-keepRecent)
  const middle = contents.slice(1, -keepRecent)
  const snippets = middle
    .slice(0, 12)
    .map((m) => `- (${m.role}) ${m.content.slice(0, 160).replace(/\s+/g, ' ')}`)
    .join('\n')

  const summary = {
    role: 'user' as const,
    content: `[Conversation compact]\nEarlier turns (${middle.length}) were compacted. Highlights:\n${snippets}\n\nContinue based on the recent messages below.`,
  }

  const mapRole = (role: string): 'user' | 'assistant' | 'system' =>
    role === 'assistant' ? 'assistant' : role === 'system' ? 'system' : 'user'

  return [
    { role: mapRole(head.role), content: head.content },
    summary,
    ...tail.map((m) => ({ role: mapRole(m.role), content: m.content })),
  ]
}
