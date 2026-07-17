import { describe, expect, it } from 'vitest'
import { parseDuckDuckGoHtml } from '@codex/tools'
import {
  createConcurrencyLimiter,
  SUBAGENT_TOOLS,
} from '@codex/agent-core'

describe('web-search parser', () => {
  it('extracts result links from DuckDuckGo-like HTML', () => {
    const html = `
      <a class="result__a" href="https://example.com/docs">Example Docs</a>
      <a class="result__snippet" href="#">Snippet about the API</a>
      <a class="result__a" href="https://example.com/guide">Guide</a>
    `
    const hits = parseDuckDuckGoHtml(html, 5)
    expect(hits.length).toBeGreaterThanOrEqual(1)
    expect(hits[0].url).toContain('https://')
    expect(hits[0].title.length).toBeGreaterThan(0)
  })
})

describe('subagent helpers', () => {
  it('exposes read-only tool set', () => {
    expect(SUBAGENT_TOOLS).toEqual(['Read', 'Grep', 'Glob'])
  })

  it('limits concurrency', async () => {
    const runLimited = createConcurrencyLimiter(2)
    let peak = 0
    let active = 0
    const jobs = Array.from({ length: 5 }, (_, i) =>
      runLimited(async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 20))
        active--
        return i
      }),
    )
    const results = await Promise.all(jobs)
    expect(results).toEqual([0, 1, 2, 3, 4])
    expect(peak).toBeLessThanOrEqual(2)
  })
})
