import { describe, expect, it } from 'vitest'
import {
  PERSIST_MAX_CONTENT_CHARS,
  PERSIST_MAX_TOOL_RESULT_CHARS,
  sanitizeMessageForPersist,
} from '@codex/shared'

describe('sanitizeMessageForPersist', () => {
  it('truncates oversized content', () => {
    const content = 'a'.repeat(PERSIST_MAX_CONTENT_CHARS + 500)
    const out = sanitizeMessageForPersist({
      sessionId: 's1',
      role: 'assistant',
      content,
    })
    expect(out.content.length).toBeLessThanOrEqual(PERSIST_MAX_CONTENT_CHARS)
    expect(out.content).toContain('truncated for storage')
  })

  it('truncates oversized tool results', () => {
    const result = 'b'.repeat(PERSIST_MAX_TOOL_RESULT_CHARS + 200)
    const out = sanitizeMessageForPersist({
      sessionId: 's1',
      role: 'assistant',
      content: 'ok',
      toolCalls: [
        {
          id: 't1',
          name: 'Read',
          args: {},
          result,
          status: 'done',
        },
      ],
    })
    expect(out.toolCalls?.[0]?.result?.length).toBeLessThanOrEqual(
      PERSIST_MAX_TOOL_RESULT_CHARS,
    )
  })
})
