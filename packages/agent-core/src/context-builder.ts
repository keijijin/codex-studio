import type { AgentMessage } from '@codex/llm-adapters'

/**
 * Improved heuristic token estimate:
 * - ASCII / latin: ~4 chars per token
 * - CJK / fullwidth: ~1.5 chars per token (closer to real BPE for JP/CN)
 * - Includes tool_calls JSON when present
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  let ascii = 0
  let other = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code <= 0x7f) ascii++
    else other++
  }
  return Math.max(1, Math.ceil(ascii / 4 + other / 1.5))
}

function estimateMessageTokens(m: AgentMessage): number {
  let total = estimateTokens(m.content ?? '')
  if (m.tool_calls?.length) {
    for (const tc of m.tool_calls) {
      total += estimateTokens(tc.name) + estimateTokens(JSON.stringify(tc.arguments ?? {})) + 8
    }
  }
  if (m.tool_call_id) total += 4
  return total + 4 // role overhead
}

export function estimateMessagesTokens(messages: AgentMessage[]): number {
  return messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0)
}

const CHARS_PER_TOKEN_ASCII = 4
const DEFAULT_BUDGET = 100_000

/**
 * Drop orphan tool messages / incomplete tool_call groups so OpenAI/Anthropic
 * accept the transcript (`tool` must follow an assistant with `tool_calls`).
 */
export function sanitizeToolMessagePairs(messages: AgentMessage[]): AgentMessage[] {
  const out: AgentMessage[] = []
  let i = 0
  while (i < messages.length) {
    const msg = messages[i]
    if (msg.role === 'tool') {
      // Orphan tool result — skip
      i++
      continue
    }
    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      const ids = new Set(msg.tool_calls.map((tc) => tc.id))
      const results: AgentMessage[] = []
      let j = i + 1
      while (j < messages.length && messages[j].role === 'tool') {
        const toolMsg = messages[j]
        if (toolMsg.tool_call_id && ids.has(toolMsg.tool_call_id)) {
          results.push(toolMsg)
          ids.delete(toolMsg.tool_call_id)
        }
        j++
      }
      // Only keep the assistant+tools block if every tool_call has a result
      if (ids.size === 0 && results.length === msg.tool_calls.length) {
        out.push(msg)
        out.push(...results)
        i = j
        continue
      }
      // Incomplete pair: keep assistant text only (drop tool_calls)
      out.push({ role: 'assistant', content: msg.content || '(tool results omitted)' })
      i = j
      continue
    }
    out.push(msg)
    i++
  }
  return out
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
    msgs.reduce((sum, m) => sum + estimateMessageTokens(m), 0)

  let budget = budgetTokens - tokenCount(system) - tokenCount(pinned)
  const kept: AgentMessage[] = []
  let dropped = 0

  for (let i = middle.length - 1; i >= 0; i--) {
    const msg = middle[i]
    let content = msg.content
    const tokens = estimateMessageTokens({ ...msg, content })

    if (tokens > budget && msg.role === 'tool' && budget > 0) {
      const maxChars = Math.max(0, budget * CHARS_PER_TOKEN_ASCII - 20)
      content = content.slice(0, maxChars) + '\n...(truncated)'
    }

    const used = estimateMessageTokens({ ...msg, content })
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

  let trimmed: AgentMessage[]
  if (dropped > 0) {
    const summary: AgentMessage = {
      role: 'user',
      content:
        `[Compacted history] ${dropped} earlier message(s) were summarized away to stay within the context budget. Continue from the remaining conversation.`,
    }
    trimmed = [...system, summary, ...kept, ...pinned]
  } else {
    trimmed = [...system, ...kept, ...pinned]
  }

  return sanitizeToolMessagePairs(trimmed)
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
