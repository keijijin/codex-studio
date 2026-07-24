import { describe, expect, it } from 'vitest'
import { estimateCostUsd, isPathInsideRoot, priceForModel } from '@codex/shared'

describe('pricing', () => {
  it('estimates cost with cached input discount', () => {
    const model = 'claude-sonnet-4'
    const full = estimateCostUsd(model, {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cachedInputTokens: 0,
    })
    const cached = estimateCostUsd(model, {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cachedInputTokens: 1_000_000,
    })
    expect(cached).toBeLessThan(full)
    expect(priceForModel(model).inputPerMTok).toBe(3)
  })
})

describe('path-sandbox', () => {
  it('allows paths inside root', () => {
    expect(isPathInsideRoot('/tmp/workspace', '/tmp/workspace/src/a.ts')).toBe(true)
    expect(isPathInsideRoot('/tmp/workspace', '/tmp/workspace')).toBe(true)
  })

  it('rejects sibling prefix matches', () => {
    expect(isPathInsideRoot('/tmp/workspace', '/tmp/workspace-evil/x')).toBe(false)
  })
})
