import { describe, expect, it } from 'vitest'
import {
  buildHeuristicShotlist,
  extractTitle,
  extractVideoIntentHeuristic,
  normalizeShotlist,
  parseShotlistJson,
  slugifyTitle,
} from '@codex/media'

describe('media shotlist', () => {
  it('extracts title and slug', () => {
    expect(extractTitle('# Hello World\n\nbody')).toBe('Hello World')
    expect(slugifyTitle('Hello World')).toMatch(/^hello-world/)
  })

  it('extracts author intent heuristically', () => {
    const md = `# RLS 入門

テナント分離のために行レベルセキュリティを使います。

## 有効化

テーブルで RLS を有効にする。

## ポリシー

テナント ID で絞り込む。
`
    const intent = extractVideoIntentHeuristic(md)
    expect(intent.language).toBe('ja')
    expect(intent.mustTeach.length).toBeGreaterThanOrEqual(2)
    expect(intent.learningGoal).toContain('RLS')
  })

  it('builds a pedagogical heuristic shotlist from markdown', () => {
    const md = `# RLS 入門

概要です。なぜ分離が必要かを説明します。

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
    expect(list.intent?.learningGoal).toBeTruthy()
    expect(list.shots.length).toBeGreaterThan(2)
    expect(list.shots[0]?.kind).toBe('title')
    expect(list.shots[0]?.role).toBe('hook')
    expect(list.shots.some((s) => s.role === 'recap')).toBe(true)
    expect(list.shots.some((s) => s.kind === 'slide')).toBe(true)
    expect(list.shots.every((s) => s.onScreenKey || s.titleText)).toBe(true)
  })

  it('parses and normalizes JSON shotlist with intent', () => {
    const raw = JSON.stringify({
      title: 'Demo',
      voice: 'alloy',
      intent: {
        learningGoal: 'Ship safely',
        audience: 'engineers',
        mustTeach: ['A', 'B'],
        takeaway: 'Remember A and B',
        language: 'en',
      },
      shots: [
        {
          id: '01',
          kind: 'title',
          role: 'hook',
          narration: 'Intro',
          onScreenKey: 'Demo',
          durationSec: 4,
        },
        {
          id: '02',
          kind: 'generative',
          role: 'concept',
          narration: 'Concept',
          runwayPrompt: 'abstract vaults',
          onScreenKey: 'Isolation',
          visual: 'keyphrase',
          durationSec: 5,
        },
        {
          id: '03',
          kind: 'slide',
          role: 'recap',
          narration: 'Step',
          slideMarkdown: '## Step',
          durationSec: 6,
        },
      ],
    })
    const parsed = parseShotlistJson(raw, 'hybrid')
    expect(parsed.shots).toHaveLength(3)
    expect(parsed.intent?.mustTeach).toEqual(['A', 'B'])
    const normalized = normalizeShotlist(parsed, 'slides', 10, 0)
    expect(normalized.shots.every((s) => s.kind !== 'generative')).toBe(true)
    expect(normalized.shots.some((s) => s.role === 'recap')).toBe(true)
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
