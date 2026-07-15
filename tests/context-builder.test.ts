import { describe, expect, it } from 'vitest'
import { estimateTokens, trimAgentHistory } from '@codex/agent-core'
import type { AgentMessage } from '@codex/llm-adapters'

describe('context-builder', () => {
  it('estimates tokens from character length', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('a'.repeat(8))).toBe(2)
  })

  it('keeps system and latest user messages when trimming', () => {
    const messages: AgentMessage[] = [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'old question' },
      { role: 'assistant', content: 'old answer' },
      { role: 'user', content: 'latest question' },
    ]

    const trimmed = trimAgentHistory(messages, 20)
    expect(trimmed[0].role).toBe('system')
    expect(trimmed.at(-1)?.content).toBe('latest question')
  })

  it('truncates long tool outputs when over budget', () => {
    const longToolOutput = 'x'.repeat(10_000)
    const messages: AgentMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'tool', tool_call_id: '1', content: longToolOutput },
      { role: 'user', content: 'question' },
    ]

    const trimmed = trimAgentHistory(messages, 100)
    const toolMsg = trimmed.find((m) => m.role === 'tool')
    expect(toolMsg?.content).toContain('...(truncated)')
    expect(toolMsg?.content.length).toBeLessThan(longToolOutput.length)
  })
})
