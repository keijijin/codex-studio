import { describe, expect, it } from 'vitest'
import {
  compactMessageContents,
  estimateTokens,
  sanitizeToolMessagePairs,
  trimAgentHistory,
} from '@codex/agent-core'
import type { AgentMessage } from '@codex/llm-adapters'

describe('context-builder', () => {
  it('estimates tokens from character length', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('a'.repeat(8))).toBe(2)
  })

  it('estimates CJK denser than ASCII', () => {
    const ascii = estimateTokens('a'.repeat(30))
    const cjk = estimateTokens('あ'.repeat(30))
    expect(cjk).toBeGreaterThan(ascii)
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

  it('inserts compact placeholder when middle history is dropped', () => {
    const messages: AgentMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'a'.repeat(200) },
      { role: 'assistant', content: 'b'.repeat(200) },
      { role: 'user', content: 'latest' },
    ]
    const trimmed = trimAgentHistory(messages, 30)
    expect(trimmed.some((m) => m.content.includes('[Compacted history]'))).toBe(true)
    expect(trimmed.at(-1)?.content).toBe('latest')
  })

  it('truncates long tool outputs when over budget', () => {
    const longToolOutput = 'x'.repeat(10_000)
    const messages: AgentMessage[] = [
      { role: 'system', content: 'sys' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: '1', name: 'Read', arguments: {} }],
      },
      { role: 'tool', tool_call_id: '1', content: longToolOutput },
      { role: 'user', content: 'question' },
    ]

    const trimmed = trimAgentHistory(messages, 100)
    const toolMsg = trimmed.find((m) => m.role === 'tool')
    // Either truncated in-place, or pair dropped as incomplete under tiny budget
    if (toolMsg) {
      expect(toolMsg.content).toContain('...(truncated)')
      expect(toolMsg.content.length).toBeLessThan(longToolOutput.length)
    } else {
      expect(trimmed.some((m) => m.role === 'assistant' && !m.tool_calls)).toBe(true)
    }
  })

  it('compacts persisted chat contents while keeping head and recent tail', () => {
    const contents = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `msg-${i}`,
    }))
    const compacted = compactMessageContents(contents, 4)
    expect(compacted[0].content).toBe('msg-0')
    expect(compacted.some((m) => m.content.includes('[Conversation compact]'))).toBe(true)
    expect(compacted.at(-1)?.content).toBe('msg-11')
    expect(compacted.length).toBeLessThan(contents.length)
  })

  it('drops orphan tool messages that lack a preceding tool_calls assistant', () => {
    const messages: AgentMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
      { role: 'tool', tool_call_id: 'orphan', content: 'leftover' },
      { role: 'assistant', content: '', tool_calls: [{ id: '1', name: 'Read', arguments: {} }] },
      { role: 'tool', tool_call_id: '1', content: 'ok' },
      { role: 'user', content: 'latest' },
    ]
    const cleaned = sanitizeToolMessagePairs(messages)
    expect(cleaned.some((m) => m.role === 'tool' && m.tool_call_id === 'orphan')).toBe(false)
    expect(cleaned.some((m) => m.role === 'tool' && m.tool_call_id === '1')).toBe(true)
  })

  it('does not leave orphan tool messages after aggressive trim', () => {
    const messages: AgentMessage[] = [
      { role: 'system', content: 'sys' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: '1', name: 'Read', arguments: {} }],
      },
      { role: 'tool', tool_call_id: '1', content: 'x'.repeat(2000) },
      { role: 'user', content: 'latest' },
    ]
    const trimmed = trimAgentHistory(messages, 20)
    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i].role === 'tool') {
        const prev = trimmed[i - 1]
        expect(prev?.role).toBe('assistant')
        expect(prev?.tool_calls?.some((tc) => tc.id === trimmed[i].tool_call_id)).toBe(true)
      }
    }
  })
})
