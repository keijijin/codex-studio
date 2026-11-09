import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@codex/shared'
import { effectiveCompactTokenBudget } from '../packages/app/src/main/services/llm-config'

describe('effectiveCompactTokenBudget', () => {
  it('leaves cloud providers uncapped', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      agent: { ...DEFAULT_SETTINGS.agent, compactTokenThreshold: 40_000 },
    }
    expect(effectiveCompactTokenBudget(settings, 'openai', 'chat')).toBe(40_000)
  })

  it('caps llama.cpp below server context minus output reserve', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      agent: { ...DEFAULT_SETTINGS.agent, compactTokenThreshold: 40_000 },
      models: {
        ...DEFAULT_SETTINGS.models,
        llamacppContextSize: 32_768,
      },
      cost: {
        ...DEFAULT_SETTINGS.cost,
        maxOutputTokens: 4096,
        maxOutputTokensAgent: 8192,
      },
    }
    const chatBudget = effectiveCompactTokenBudget(settings, 'llamacpp', 'chat')
    const agentBudget = effectiveCompactTokenBudget(settings, 'llamacpp', 'agent')
    expect(chatBudget).toBeLessThan(32_768)
    expect(chatBudget).toBeLessThanOrEqual(40_000)
    expect(agentBudget).toBeLessThan(chatBudget)
    // ~0.7*32768 - 4096 - 512 ≈ 18329
    expect(chatBudget).toBe(Math.floor(32_768 * 0.7) - 4096 - 512)
  })
})
