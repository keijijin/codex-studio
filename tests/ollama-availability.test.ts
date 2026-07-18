import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearOllamaAvailabilityCache,
  getCachedOllamaAvailability,
  markOllamaAvailability,
  probeOllamaAvailable,
} from '../packages/app/src/main/services/ollama-availability'
import {
  isCandidateAvailable,
  resolveRoutingDecisionAsync,
} from '../packages/app/src/main/services/llm-config'
import { DEFAULT_SETTINGS } from '../packages/shared/src/index'

describe('ollama availability probe', () => {
  afterEach(() => {
    clearOllamaAvailabilityCache()
    vi.unstubAllGlobals()
  })

  it('treats uncached Ollama as unavailable in sync checks', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      models: {
        ...DEFAULT_SETTINGS.models,
        anthropicApiKey: 'sk-ant-test',
      },
    }
    expect(
      isCandidateAvailable({ provider: 'ollama', model: 'qwen2.5-coder:7b' }, settings),
    ).toBe(false)
    expect(
      isCandidateAvailable({ provider: 'anthropic', model: 'claude-sonnet-4-6' }, settings),
    ).toBe(true)
  })

  it('probe caches a negative result when Ollama is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      }),
    )

    const ok = await probeOllamaAvailable('http://localhost:11434')
    expect(ok).toBe(false)
    expect(getCachedOllamaAvailability('http://localhost:11434')).toBe(false)
  })

  it('async routing skips Ollama when probe fails and selects Anthropic', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      }),
    )

    const settings = {
      ...DEFAULT_SETTINGS,
      models: {
        ...DEFAULT_SETTINGS.models,
        defaultProvider: 'anthropic' as const,
        defaultChatModel: 'claude-sonnet-4-6',
        anthropicApiKey: 'sk-ant-test',
        openaiApiKey: 'sk-test',
      },
      routing: {
        mode: 'auto' as const,
        fallbackChain: [
          { provider: 'openai' as const, model: 'gpt-4o' },
          { provider: 'ollama' as const, model: 'qwen2.5-coder:14b' },
        ],
        maxAttempts: 3,
      },
    }

    const decision = await resolveRoutingDecisionAsync(settings, {
      runMode: 'chat',
      prompt: 'こんにちは',
    })

    expect(decision.selected.provider).toBe('anthropic')
    expect(decision.queue.map((c) => c.provider)).not.toContain('ollama')
  })

  it('markOllamaAvailability(false) keeps Ollama out of subsequent sync checks', () => {
    markOllamaAvailability('http://localhost:11434', false)
    const settings = DEFAULT_SETTINGS
    expect(
      isCandidateAvailable({ provider: 'ollama', model: 'llama3.2' }, settings),
    ).toBe(false)
  })
})
