import { describe, expect, it } from 'vitest'
import {
  classifyTaskKind,
  decideRouting,
  isConnectionError,
  isRetryableError,
} from '../packages/llm-adapters/src/router/index'
import {
  DEFAULT_ROUTING,
  DEFAULT_SETTINGS,
  normalizeRoutingSettings,
} from '../packages/shared/src/index'

describe('model router', () => {
  it('isRetryableError detects rate limits and connection failures', () => {
    expect(isRetryableError('Error 429 rate limit exceeded')).toBe(true)
    expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true)
    expect(isRetryableError('Connection error.')).toBe(true)
    expect(isRetryableError('Ollama に接続できません。Ollama が起動しているか確認してください。')).toBe(
      true,
    )
    expect(isConnectionError('Connection error.')).toBe(true)
    expect(isConnectionError('Ollama に接続できません')).toBe(true)
    expect(isRetryableError('quota exceeded')).toBe(true)
    expect(isRetryableError('404 not_found_error model: claude-sonnet-4-20250514')).toBe(true)
    expect(isRetryableError('Invalid API key')).toBe(false)
    expect(isRetryableError('401 Unauthorized')).toBe(false)
    expect(isRetryableError('Request aborted')).toBe(false)
  })

  it('fixed mode prefers primary but keeps fallbacks for connection errors', () => {
    const decision = decideRouting({
      mode: 'fixed',
      primary: { provider: 'openai', model: 'gpt-4o' },
      fallbackChain: DEFAULT_ROUTING.fallbackChain,
      maxAttempts: 3,
      isAvailable: () => true,
      runMode: 'chat',
      prompt: 'hello',
    })
    expect(decision.queue[0]).toEqual({ provider: 'openai', model: 'gpt-4o' })
    expect(decision.queue.length).toBeGreaterThan(1)
    expect(decision.mode).toBe('fixed')
  })

  it('fixed mode skips unavailable primary and uses next available', () => {
    const decision = decideRouting({
      mode: 'fixed',
      primary: { provider: 'ollama', model: 'qwen2.5-coder:7b' },
      fallbackChain: [
        { provider: 'anthropic', model: 'claude-sonnet-4-6' },
        { provider: 'openai', model: 'gpt-4o' },
      ],
      maxAttempts: 3,
      isAvailable: (c) => c.provider !== 'ollama',
      runMode: 'chat',
      prompt: 'hello',
    })
    expect(decision.selected.provider).toBe('anthropic')
    expect(decision.queue.map((c) => c.provider)).toEqual(['anthropic', 'openai'])
  })

  it('fallback-only builds a chain and skips unavailable providers', () => {
    const decision = decideRouting({
      mode: 'fallback-only',
      primary: { provider: 'openai', model: 'gpt-4o' },
      fallbackChain: [
        { provider: 'anthropic', model: 'claude-sonnet-4-6' },
        { provider: 'ollama', model: 'qwen2.5-coder:14b' },
      ],
      maxAttempts: 3,
      isAvailable: (c) => c.provider !== 'anthropic',
      runMode: 'agent',
      prompt: 'fix the bug',
    })
    expect(decision.queue.map((c) => c.provider)).toEqual(['openai', 'ollama'])
  })

  it('auto classifies agent code tasks and prefers quality models', () => {
    const kind = classifyTaskKind({
      prompt: 'TypeScript のバグを修正して実装する',
      runMode: 'agent',
    })
    expect(kind).toBe('agent_code')

    const decision = decideRouting({
      mode: 'auto',
      primary: { provider: 'openai', model: 'gpt-4o' },
      fallbackChain: DEFAULT_ROUTING.fallbackChain,
      maxAttempts: 3,
      isAvailable: () => true,
      runMode: 'agent',
      prompt: 'TypeScript のバグを修正して実装する',
    })
    expect(decision.taskKind).toBe('agent_code')
    // User primary comes first; quality profile models follow.
    expect(decision.queue[0]?.provider).toBe('openai')
    expect(decision.queue.map((c) => c.provider)).toContain('anthropic')
  })

  it('auto skips offline Ollama and uses cloud providers', () => {
    const decision = decideRouting({
      mode: 'auto',
      primary: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
      fallbackChain: [
        { provider: 'openai', model: 'gpt-4o' },
        { provider: 'ollama', model: 'qwen2.5-coder:14b' },
      ],
      maxAttempts: 3,
      isAvailable: (c) => c.provider !== 'ollama',
      runMode: 'chat',
      prompt: 'hello',
    })
    expect(decision.selected).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4-6' })
    expect(decision.queue.map((c) => c.provider)).not.toContain('ollama')
  })

  it('normalizeRoutingSettings defaults missing values to fixed', () => {
    expect(normalizeRoutingSettings(undefined).mode).toBe('fixed')
    expect(normalizeRoutingSettings({ mode: 'auto' as const }).maxAttempts).toBe(3)
    expect(DEFAULT_SETTINGS.routing.mode).toBe('fixed')
  })

  it('migrates retired Anthropic model ids in fallback chain', () => {
    const routing = normalizeRoutingSettings({
      mode: 'fallback-only',
      fallbackChain: [
        { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
      ],
    })
    expect(routing.fallbackChain[0]?.model).toBe('claude-sonnet-4-6')
  })
})
