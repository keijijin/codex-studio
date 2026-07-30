import { describe, expect, it } from 'vitest'
import {
  buildHeuristicDeck,
  normalizeDeck,
  parseDeckJson,
  slugifyDeckTitle,
} from '@codex/media'

describe('media presentation deck', () => {
  it('builds a heuristic deck from markdown with code', () => {
    const md = `# RLS 入門

概要です。

## なぜ必要か

- アプリ層だけでは漏れる
- DB が最後の防衛線

## 手順

ポリシーを追加します。

\`\`\`sql
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant_id'));
\`\`\`
`
    const deck = buildHeuristicDeck(md, { themeId: 'midnight', maxSlides: 12 })
    expect(deck.title).toContain('RLS')
    expect(deck.slides[0]?.layout).toBe('title')
    expect(deck.slides.some((s) => s.layout === 'code')).toBe(true)
    expect(deck.slides.some((s) => s.layout === 'closing')).toBe(true)
    expect(deck.slides.length).toBeGreaterThan(2)
    // Quality pass: heuristic should not be bullets-only
    expect(
      deck.slides.some((s) =>
        ['quote', 'section', 'two_column', 'code'].includes(s.layout),
      ),
    ).toBe(true)
    expect(slugifyDeckTitle(deck.title)).toMatch(/rls|入門/i)
  })

  it('parses and normalizes JSON deck', () => {
    const raw = JSON.stringify({
      title: 'Demo',
      themeId: 'paper',
      slides: [
        { id: '01', layout: 'title', title: 'Hello', subtitle: 'World' },
        { id: '02', layout: 'bullets', title: 'Points', bullets: ['a', 'b', 'c'] },
        { id: '03', layout: 'code', title: 'SQL', code: 'SELECT 1;' },
      ],
    })
    const parsed = parseDeckJson(raw, 'midnight')
    expect(parsed.themeId).toBe('paper')
    expect(parsed.slides).toHaveLength(3)
    const normalized = normalizeDeck(parsed, 2)
    expect(normalized.slides).toHaveLength(2)
  })

  it('fills missing bullets / quote fields on normalize', () => {
    const deck = normalizeDeck(
      {
        title: 'X',
        themeId: 'coral',
        slides: [
          { id: '01', layout: 'bullets', title: 'Only title' },
          { id: '02', layout: 'quote', title: 'Q' },
        ],
      },
      10,
    )
    expect(deck.slides[0]?.bullets?.length).toBeGreaterThan(0)
    expect(deck.slides[1]?.quote).toBeTruthy()
  })
})
