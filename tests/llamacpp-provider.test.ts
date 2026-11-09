import { describe, expect, it } from 'vitest'
import { getProviderForModel, listModels } from '@codex/llm-adapters'
import { DEFAULT_LLAMACPP_MODEL } from '@codex/llm-adapters'

describe('llamacpp provider wiring', () => {
  it('routes .gguf model ids to llamacpp', () => {
    expect(getProviderForModel('Qwen-AgentWorld-35B-A3B-UD-Q4_K_M.gguf')).toBe('llamacpp')
    expect(getProviderForModel('something-agentworld-q4')).toBe('llamacpp')
  })

  it('lists models from a live llama-server when available', async () => {
    const baseUrl = process.env.LLAMACPP_BASE_URL || 'http://127.0.0.1:8080'
    let reachable = false
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/models`, {
        signal: AbortSignal.timeout(800),
      })
      reachable = res.ok
    } catch {
      reachable = false
    }
    if (!reachable) {
      const fallback = await listModels('llamacpp', 'llamacpp', {
        baseUrl: 'http://127.0.0.1:9',
      })
      expect(fallback[0]?.id).toBe(DEFAULT_LLAMACPP_MODEL)
      return
    }

    const models = await listModels('llamacpp', 'llamacpp', { baseUrl })
    expect(models.length).toBeGreaterThan(0)
    expect(models.every((m) => m.provider === 'llamacpp')).toBe(true)
    expect(models.some((m) => m.id.includes('Qwen-AgentWorld') || m.id.endsWith('.gguf'))).toBe(
      true,
    )
  })
})
