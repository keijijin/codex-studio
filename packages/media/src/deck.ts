import { extractTitle, slugifyTitle } from './shotlist'
import type {
  Deck,
  DeckSlide,
  PresentationThemeId,
  SlideLayout,
} from './presentation-types'

const CODE_FENCE = /```([\w+-]*)\n?([\s\S]*?)```/g
const LAYOUTS: SlideLayout[] = [
  'title',
  'section',
  'bullets',
  'two_column',
  'code',
  'quote',
  'closing',
]

export { extractTitle, slugifyTitle }

export function slugifyDeckTitle(title: string): string {
  const base = slugifyTitle(title)
  return base.startsWith('video-') ? base.replace(/^video-/, 'deck-') : base
}

function normalizeLayout(raw: unknown): SlideLayout {
  const k = String(raw ?? 'bullets')
  return (LAYOUTS as string[]).includes(k) ? (k as SlideLayout) : 'bullets'
}

function trimLines(items: unknown, max = 7): string[] | undefined {
  if (!Array.isArray(items)) return undefined
  const out = items
    .map((x) => String(x ?? '').trim())
    .filter(Boolean)
    .map((s) => s.slice(0, 120))
    .slice(0, max)
  return out.length > 0 ? out : undefined
}

export function parseDeckJson(raw: string, themeId: PresentationThemeId): Deck {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const data = JSON.parse(cleaned) as Partial<Deck>
  if (!data || !Array.isArray(data.slides) || data.slides.length === 0) {
    throw new Error('deck must include a non-empty slides array')
  }
  const slides: DeckSlide[] = data.slides.map((s, i) => {
    const layout = normalizeLayout(s.layout)
    return {
      id: String(s.id ?? String(i + 1).padStart(2, '0')),
      layout,
      title: String(s.title ?? `Slide ${i + 1}`).trim().slice(0, 100) || `Slide ${i + 1}`,
      subtitle: s.subtitle ? String(s.subtitle).trim().slice(0, 160) : undefined,
      bullets: trimLines(s.bullets),
      leftTitle: s.leftTitle ? String(s.leftTitle).trim().slice(0, 60) : undefined,
      rightTitle: s.rightTitle ? String(s.rightTitle).trim().slice(0, 60) : undefined,
      leftBullets: trimLines(s.leftBullets, 6),
      rightBullets: trimLines(s.rightBullets, 6),
      code: s.code ? String(s.code).slice(0, 2500) : undefined,
      codeLanguage: s.codeLanguage ? String(s.codeLanguage).slice(0, 32) : undefined,
      quote: s.quote ? String(s.quote).trim().slice(0, 280) : undefined,
      notes: s.notes ? String(s.notes).trim().slice(0, 500) : undefined,
    }
  })
  const resolvedTheme =
    data.themeId && data.themeId in { midnight: 1, paper: 1, forest: 1, coral: 1 }
      ? data.themeId
      : themeId
  return {
    title: String(data.title ?? 'Presentation').slice(0, 120),
    themeId: resolvedTheme,
    slides,
  }
}

/** Enforce max slides and fill missing fields for each layout. */
export function normalizeDeck(deck: Deck, maxSlides: number): Deck {
  const slides = deck.slides.slice(0, Math.max(1, maxSlides)).map((s) => {
    const slide = { ...s }
    if (slide.layout === 'bullets' || slide.layout === 'closing') {
      if (!slide.bullets?.length) {
        slide.bullets = [slide.subtitle || slide.title].filter(Boolean)
      }
      slide.bullets = slide.bullets?.slice(0, 7)
    }
    if (slide.layout === 'two_column') {
      slide.leftBullets = slide.leftBullets?.slice(0, 6) ?? slide.bullets?.slice(0, 3) ?? [slide.title]
      slide.rightBullets =
        slide.rightBullets?.slice(0, 6) ?? slide.bullets?.slice(3, 6) ?? [slide.subtitle || '—']
    }
    if (slide.layout === 'code' && !slide.code) {
      slide.code = slide.bullets?.join('\n') || '// (no code)'
      slide.layout = slide.code.startsWith('//') ? 'bullets' : 'code'
      if (slide.layout === 'bullets' && !slide.bullets?.length) {
        slide.bullets = [slide.subtitle || 'コード例を追加してください']
      }
    }
    if (slide.layout === 'quote' && !slide.quote) {
      slide.quote = slide.subtitle || slide.bullets?.[0] || slide.title
    }
    return slide
  })
  return { ...deck, slides }
}

function extractCodeBlocks(markdown: string): Array<{ lang: string; code: string }> {
  const blocks: Array<{ lang: string; code: string }> = []
  let m: RegExpExecArray | null
  const re = new RegExp(CODE_FENCE.source, 'g')
  while ((m = re.exec(markdown)) !== null) {
    const code = (m[2] || '').trim()
    if (code) blocks.push({ lang: (m[1] || 'text').trim() || 'text', code: code.slice(0, 2000) })
  }
  return blocks
}

function bulletsFromSection(section: string): string[] {
  const lines = section.split('\n').map((l) => l.trim()).filter(Boolean)
  const bullets: string[] = []
  for (const line of lines) {
    if (/^##\s+/.test(line)) continue
    const list = line.match(/^[-*+]\s+(.+)$/) || line.match(/^\d+\.\s+(.+)$/)
    if (list?.[1]) {
      bullets.push(list[1].replace(/[*_`]/g, '').slice(0, 100))
    }
  }
  if (bullets.length > 0) return bullets.slice(0, 7)

  const plain = section
    .replace(CODE_FENCE, ' ')
    .replace(/^##\s+.+$/m, '')
    .replace(/[#>*_`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!plain) return ['（内容なし）']
  const chunks = plain.match(/.{1,80}(?:\s|$)/g) || [plain.slice(0, 80)]
  return chunks.map((c) => c.trim()).filter(Boolean).slice(0, 5)
}

/**
 * Heuristic director: title + section slides (+ code slides from fences).
 * Used when LLM director is unavailable.
 */
export function buildHeuristicDeck(
  markdown: string,
  options: {
    themeId: PresentationThemeId
    maxSlides: number
  },
): Deck {
  const title = extractTitle(markdown)
  const body = markdown.replace(/^#\s+.+$/m, '').trim()
  const sections = body
    .split(/\n(?=##\s+)/)
    .map((s) => s.trim())
    .filter(Boolean)

  const slides: DeckSlide[] = [
    {
      id: '01',
      layout: 'title',
      title,
      subtitle: '要点をすばやく共有する',
      notes: `${title}の目的と聴衆への価値を一文で述べる。`,
    },
  ]

  const codeBlocks = extractCodeBlocks(markdown)
  let codeIdx = 0
  const limit = Math.max(1, options.maxSlides - 2)
  const chunks =
    sections.length > 0
      ? sections
      : body
          .split(/\n{2,}/)
          .map((s) => s.trim())
          .filter((s) => s.length > 15)

  // Opening quote from first non-heading sentence when available
  const firstSentence = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s+.+$/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .match(/[^。.!?]{12,}[。!?]/)?.[0]
  if (firstSentence && slides.length < options.maxSlides - 1) {
    slides.push({
      id: String(slides.length + 1).padStart(2, '0'),
      layout: 'quote',
      title,
      quote: firstSentence.slice(0, 120),
      notes: '問題意識やキーメッセージを強調する。',
    })
  }

  for (let i = 0; i < Math.min(chunks.length, limit); i++) {
    const chunk = chunks[i]!
    const heading = chunk.match(/^##\s+(.+)$/m)?.[1]?.trim() || `ポイント ${i + 1}`
    const hasCode = /```/.test(chunk)
    const bullets = bulletsFromSection(chunk)

    // Chapter break every few sections
    if (i > 0 && i % 3 === 0 && slides.length < options.maxSlides - 1) {
      slides.push({
        id: String(slides.length + 1).padStart(2, '0'),
        layout: 'section',
        title: heading,
        subtitle: '次のブロック',
        notes: `${heading}に入る。`,
      })
    }

    if (hasCode && codeBlocks[codeIdx]) {
      const block = codeBlocks[codeIdx]!
      codeIdx++
      slides.push({
        id: String(slides.length + 1).padStart(2, '0'),
        layout: 'code',
        title: heading,
        code: block.code,
        codeLanguage: block.lang,
        notes: `${heading}のコードを画面で示す。`,
      })
    } else if (bullets.length >= 4 && slides.length < options.maxSlides - 1) {
      const mid = Math.ceil(bullets.length / 2)
      slides.push({
        id: String(slides.length + 1).padStart(2, '0'),
        layout: 'two_column',
        title: heading,
        leftTitle: 'ポイント',
        rightTitle: '詳細',
        leftBullets: bullets.slice(0, mid),
        rightBullets: bullets.slice(mid),
        notes: `${heading}を対比して説明する。`,
      })
    } else {
      slides.push({
        id: String(slides.length + 1).padStart(2, '0'),
        layout: 'bullets',
        title: heading,
        bullets,
        notes: `${heading}を説明する。`,
      })
    }
  }

  // Remaining code blocks as dedicated slides if room
  while (codeIdx < codeBlocks.length && slides.length < options.maxSlides - 1) {
    const block = codeBlocks[codeIdx]!
    codeIdx++
    slides.push({
      id: String(slides.length + 1).padStart(2, '0'),
      layout: 'code',
      title: `コード ${codeIdx}`,
      code: block.code,
      codeLanguage: block.lang,
      notes: 'ソースから抽出したコード例。',
    })
  }

  slides.push({
    id: String(slides.length + 1).padStart(2, '0'),
    layout: 'closing',
    title: 'まとめ',
    bullets: ['要点を再確認する', '次のアクションを決める', '質問を受け付ける'],
    notes: 'Q&A へ。',
  })

  return normalizeDeck(
    {
      title,
      themeId: options.themeId,
      slides: slides.slice(0, options.maxSlides),
    },
    options.maxSlides,
  )
}
