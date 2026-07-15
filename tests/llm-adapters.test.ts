import { describe, expect, it } from 'vitest'
import {
  getProviderInstance,
  providerDisplayName,
} from '@codex/llm-adapters'
import { toOpenAIMessages } from '../packages/llm-adapters/src/openai-messages'

describe('llm-adapters utils', () => {
  it('getProviderInstance returns provider by id', () => {
    expect(getProviderInstance('openai').id).toBe('openai')
    expect(getProviderInstance('anthropic').id).toBe('anthropic')
    expect(getProviderInstance('ollama').id).toBe('ollama')
  })

  it('providerDisplayName maps ids to labels', () => {
    expect(providerDisplayName('openai')).toBe('OpenAI')
    expect(providerDisplayName('anthropic')).toBe('Anthropic')
    expect(providerDisplayName('ollama')).toBe('Ollama')
  })

  it('toOpenAIMessages converts tool and assistant tool_calls', () => {
    const messages = toOpenAIMessages([
      { role: 'user', content: 'hello' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'tc1', name: 'Read', arguments: { path: 'a.ts' } }],
      },
      { role: 'tool', tool_call_id: 'tc1', content: 'file contents' },
    ])

    expect(messages[0]).toEqual({ role: 'user', content: 'hello' })
    expect(messages[1]).toMatchObject({
      role: 'assistant',
      tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'Read' } }],
    })
    expect(messages[2]).toEqual({
      role: 'tool',
      tool_call_id: 'tc1',
      content: 'file contents',
    })
  })
})
