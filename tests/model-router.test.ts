import { describe, expect, it } from 'vitest'
import {
  classifyTask,
  classifyTaskKind,
  decideRouting,
  isConnectionError,
  isRetryableError,
  buildCostOptimizedProfile,
  createDefaultCatalog,
  resolveModelId,
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

  it('classifies simple chat as lite tier', () => {
    const result = classifyTask({ prompt: 'こんにちは', runMode: 'chat' })
    expect(result.taskKind).toBe('chat_simple')
    expect(result.tier).toBe('lite')
  })

  it('classifies hard architecture agent work as premium', () => {
    const result = classifyTask({
      prompt: '分散システムのアーキテクチャ全体を設計し、障害の根本原因分析も行う',
      runMode: 'agent',
    })
    expect(result.taskKind).toBe('agent_hard')
    expect(result.tier).toBe('premium')
  })

  it('auto picks cost-optimized lite models for simple chat (not user primary first)', () => {
    const decision = decideRouting({
      mode: 'auto',
      primary: { provider: 'openai', model: 'gpt-5.5' },
      fallbackChain: DEFAULT_ROUTING.fallbackChain,
      maxAttempts: 3,
      isAvailable: (c) => c.provider !== 'ollama',
      runMode: 'chat',
      prompt: 'hello',
      catalog: createDefaultCatalog(),
    })
    expect(decision.taskKind).toBe('chat_simple')
    expect(decision.tier).toBe('lite')
    // Should start on a cheap model, not the expensive primary
    expect(decision.selected.model).not.toBe('gpt-5.5')
    expect(['xai', 'openai', 'anthropic']).toContain(decision.selected.provider)
  })

  it('auto agent code prefers coding-capable mid tier before premium', () => {
    const kind = classifyTaskKind({
      prompt: 'TypeScript のバグを修正して実装する',
      runMode: 'agent',
    })
    expect(kind).toBe('agent_code')

    const decision = decideRouting({
      mode: 'auto',
      primary: { provider: 'openai', model: 'gpt-5.5' },
      fallbackChain: DEFAULT_ROUTING.fallbackChain,
      maxAttempts: 4,
      isAvailable: (c) => c.provider !== 'ollama',
      runMode: 'agent',
      prompt: 'TypeScript のバグを修正して実装する',
      catalog: createDefaultCatalog(),
    })
    expect(decision.taskKind).toBe('agent_code')
    expect(decision.queue.length).toBeGreaterThan(1)
    expect(decision.reason).toMatch(/Auto \(agent_code\//)
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
    expect(decision.queue.map((c) => c.provider)).not.toContain('ollama')
  })

  it('resolveModelId prefers exact then prefix matches', () => {
    expect(resolveModelId(['gpt-5.4-nano', 'gpt-4o-mini'], ['gpt-4o-mini', 'gpt-4o'])).toBe(
      'gpt-4o-mini',
    )
    expect(
      resolveModelId(['gpt-5.4-mini'], ['gpt-5.4-mini-2026-03-17', 'gpt-4o']),
    ).toBe('gpt-5.4-mini-2026-03-17')
  })

  it('buildCostOptimizedProfile cascades lite → standard → premium', () => {
    const profile = buildCostOptimizedProfile('lite', createDefaultCatalog(), {
      taskHint: 'chat',
      includeOllama: false,
    })
    expect(profile[0]?.provider).toBe('xai')
    expect(profile.some((c) => c.model.includes('grok'))).toBe(true)
    expect(profile.some((c) => c.provider === 'openai')).toBe(true)
    expect(profile.some((c) => c.provider === 'anthropic')).toBe(true)
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
