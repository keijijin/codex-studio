import { describe, expect, it } from 'vitest'
import {
  buildHeuristicShotlist,
  extractTitle,
  normalizeShotlist,
  parseShotlistJson,
  slugifyTitle,
} from '@codex/media'

describe('media shotlist', () => {
  it('extracts title and slug', () => {
    expect(extractTitle('# Hello World\n\nbody')).toBe('Hello World')
    expect(slugifyTitle('Hello World')).toMatch(/^hello-world/)
  })

  it('builds a heuristic shotlist from markdown', () => {
    const md = `# RLS 入門

概要です。

## 手順

1. 設定する
2. 確認する

\`\`\`sql
SELECT 1;
\`\`\`
`
    const list = buildHeuristicShotlist(md, {
      mode: 'hybrid',
      maxShots: 8,
      maxGenerativeShots: 2,
    })
    expect(list.title).toContain('RLS')
    expect(list.shots.length).toBeGreaterThan(1)
    expect(list.shots[0]?.kind).toBe('title')
    expect(list.shots.some((s) => s.kind === 'slide')).toBe(true)
  })

  it('parses and normalizes JSON shotlist', () => {
    const raw = JSON.stringify({
      title: 'Demo',
      voice: 'alloy',
      shots: [
        { id: '01', kind: 'title', narration: 'Intro', durationSec: 4 },
        {
          id: '02',
          kind: 'generative',
          narration: 'Concept',
          runwayPrompt: 'abstract vaults',
          durationSec: 5,
        },
        { id: '03', kind: 'slide', narration: 'Step', slideMarkdown: '## Step', durationSec: 6 },
      ],
    })
    const parsed = parseShotlistJson(raw, 'hybrid')
    expect(parsed.shots).toHaveLength(3)
    const normalized = normalizeShotlist(parsed, 'slides', 10, 0)
    expect(normalized.shots.every((s) => s.kind !== 'generative')).toBe(true)
  })

  it('downgrades generative in slides mode during parse', () => {
    const raw = JSON.stringify({
      title: 'X',
      shots: [{ kind: 'generative', narration: 'n', durationSec: 5 }],
    })
    const parsed = parseShotlistJson(raw, 'slides')
    expect(parsed.shots[0]?.kind).toBe('slide')
  })
})
