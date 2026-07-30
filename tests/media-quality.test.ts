import { describe, expect, it } from 'vitest'
import { mkdtemp, access, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  buildHeuristicDeck,
  clampLine,
  renderSvgToPng,
  runPresentationPipeline,
  wrapText,
  writePresentationSlideSvg,
  resolveTheme,
} from '@codex/media'

describe('media text wrap', () => {
  it('wraps Japanese without requiring spaces', () => {
    const lines = wrapText('マルチテナント環境では行レベルでデータを隔離する必要があります', 12, 4)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every((l) => l.length <= 13)).toBe(true) // allow ellipsis
  })

  it('wraps Latin on word boundaries', () => {
    const lines = wrapText('Row level security isolates tenant data at the database layer', 20, 4)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines[0]).not.toMatch(/^\s/)
  })

  it('clamps with ellipsis', () => {
    expect(clampLine('あいうえおかきくけこ', 5)).toBe('あいうえ…')
  })
})

describe('media presentation quality', () => {
  it('heuristic deck uses varied layouts', () => {
    const md = `# RLS 入門

テナント分離はアプリ層だけでは不十分です。

## 背景

- 漏れやすい
- 監査が難しい
- ポリシーが散る
- テストが必要

## 実装

\`\`\`sql
CREATE POLICY p ON t USING (true);
\`\`\`

## 運用

- 監視する
- 見直す
`
    const deck = buildHeuristicDeck(md, { themeId: 'midnight', maxSlides: 16 })
    const layouts = new Set(deck.slides.map((s) => s.layout))
    expect(layouts.has('title')).toBe(true)
    expect(layouts.has('code')).toBe(true)
    expect(layouts.has('closing')).toBe(true)
    expect(
      layouts.has('quote') || layouts.has('two_column') || layouts.has('section'),
    ).toBe(true)
  })

  it('runs presentation pipeline to PPTX + SVG + PNG via resvg', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-pres-q-'))
    const result = await runPresentationPipeline({
      workspaceRoot: root,
      sourcePath: join(root, 'doc.md'),
      markdown: `# Demo\n\n要点です。\n\n## A\n\n- 一\n- 二\n\n## B\n\n\`\`\`ts\nconst x = 1\n\`\`\`\n`,
      themeId: 'paper',
      maxSlides: 10,
      includeNotes: true,
    })
    expect(result.success).toBe(true)
    expect(result.outputPptx).toBeTruthy()
    await access(result.outputPptx!)
    await access(result.deckPath!)
    expect(result.slideSvgPaths.length).toBeGreaterThan(2)
    expect(result.warnings.some((w) => /heuristic|API key/i.test(w))).toBe(true)

    const svg = result.slideSvgPaths[0]!
    const png = svg.replace(/\.svg$/, '.png')
    await renderSvgToPng(svg, png)
    const buf = await readFile(png)
    expect(buf.length).toBeGreaterThan(1000)
    // PNG magic
    expect(buf[0]).toBe(0x89)
  }, 30_000)

  it('writes Japanese title SVG without blanking', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codex-svg-'))
    const out = join(dir, '01.svg')
    await writePresentationSlideSvg(
      {
        id: '01',
        layout: 'title',
        title: '行レベルセキュリティ入門',
        subtitle: 'テナント分離を正しく実装する',
      },
      resolveTheme('midnight'),
      out,
    )
    const svg = await readFile(out, 'utf-8')
    expect(svg).toContain('行レベル')
    expect(svg).toContain('Hiragino')
    const png = join(dir, '01.png')
    await renderSvgToPng(out, png)
    await access(png)
  })
})
