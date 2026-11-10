import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@codex/shared'
import {
  effectiveCompactTokenBudget,
  effectiveMaxOutputTokens,
  effectiveMaxSubagents,
} from '../packages/app/src/main/services/llm-config'

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
    expect(agentBudget).toBeLessThanOrEqual(chatBudget)
    // Local maxOut is clamped to 1024 (chat) / 4096 (agent)
    expect(chatBudget).toBe(Math.floor(32_768 * 0.7) - 1024 - 512)
  })

  it('caps Ollama with ollamaContextSize even when Compact 閾値 is huge', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      agent: { ...DEFAULT_SETTINGS.agent, compactTokenThreshold: 40_000 },
      models: {
        ...DEFAULT_SETTINGS.models,
        ollamaContextSize: 16_384,
      },
    }
    const budget = effectiveCompactTokenBudget(settings, 'ollama', 'agent')
    expect(budget).toBeLessThan(16_384)
    expect(budget).toBe(Math.floor(16_384 * 0.7) - 4096 - 512)
  })

  it('still caps local providers when Compact is set to 0 (off)', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      agent: { ...DEFAULT_SETTINGS.agent, compactTokenThreshold: 0 },
      models: {
        ...DEFAULT_SETTINGS.models,
        ollamaContextSize: 8_192,
      },
    }
    expect(effectiveCompactTokenBudget(settings, 'ollama', 'chat')).toBeGreaterThan(0)
    expect(effectiveCompactTokenBudget(settings, 'openai', 'chat')).toBe(0)
  })
})

describe('local runtime clamps', () => {
  it('limits output tokens and subagents on local providers', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      agent: { ...DEFAULT_SETTINGS.agent, maxSubagents: 3 },
      cost: {
        ...DEFAULT_SETTINGS.cost,
        maxOutputTokens: 4096,
        maxOutputTokensAgent: 8192,
      },
    }
    expect(effectiveMaxOutputTokens(settings, 'llamacpp', 'agent')).toBe(4096)
    expect(effectiveMaxOutputTokens(settings, 'ollama', 'chat')).toBe(1024)
    expect(effectiveMaxOutputTokens(settings, 'openai', 'agent')).toBe(8192)
    expect(effectiveMaxSubagents(settings, 'ollama')).toBe(1)
    expect(effectiveMaxSubagents(settings, 'openai')).toBe(3)
  })
})
