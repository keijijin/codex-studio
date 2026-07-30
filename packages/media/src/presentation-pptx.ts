import { mkdir } from 'fs/promises'
import { dirname } from 'path'
import PptxGenJSImport from 'pptxgenjs'
import type { Deck, DeckSlide, ThemeTokens } from './presentation-types'
import { PPTX_MONO, PPTX_SANS, PPTX_SERIF } from './text'
import { resolveTheme } from './themes'

type PptxGenCtor = typeof PptxGenJSImport

function resolvePptxCtor(): PptxGenCtor {
  const mod = PptxGenJSImport as unknown as PptxGenCtor | { default: PptxGenCtor }
  if (typeof mod === 'function') return mod
  if (mod && typeof mod.default === 'function') return mod.default
  throw new Error('pptxgenjs constructor not found')
}

function addNotes(
  slide: { addNotes: (notes: string) => void },
  deckSlide: DeckSlide,
  includeNotes: boolean,
) {
  if (includeNotes && deckSlide.notes) {
    slide.addNotes(deckSlide.notes)
  }
}

function renderSlide(
  pptx: InstanceType<PptxGenCtor>,
  slide: DeckSlide,
  theme: ThemeTokens,
  includeNotes: boolean,
) {
  const s = pptx.addSlide()
  s.background = { color: theme.pptxBackground }

  // Surface card
  s.addShape(pptx.ShapeType.roundRect, {
    x: 0.25,
    y: 0.25,
    w: 9.5,
    h: 5.0,
    fill: { color: theme.pptxSurface },
    rectRadius: 0.12,
  })
  // Accent bar
  s.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.1,
    h: 5.5,
    fill: { color: theme.pptxAccent },
  })

  const layout = slide.layout

  if (layout === 'title' || layout === 'section') {
    s.addText(slide.title, {
      x: 0.6,
      y: 1.8,
      w: 8.8,
      h: 1.4,
      fontSize: layout === 'title' ? 40 : 34,
      fontFace: PPTX_SANS,
      bold: true,
      color: theme.pptxText,
      valign: 'middle',
    })
    if (slide.subtitle) {
      s.addText(slide.subtitle, {
        x: 0.6,
        y: 3.3,
        w: 8.8,
        h: 0.6,
        fontSize: 18,
        fontFace: PPTX_SANS,
        color: theme.pptxMuted,
      })
    }
  } else if (layout === 'quote') {
    s.addText(`“${slide.quote || slide.title}”`, {
      x: 0.8,
      y: 1.6,
      w: 8.4,
      h: 2.4,
      fontSize: 26,
      fontFace: PPTX_SERIF,
      italic: true,
      color: theme.pptxText,
      valign: 'middle',
    })
    if (slide.title && slide.quote) {
      s.addText(`— ${slide.title}`, {
        x: 0.8,
        y: 4.2,
        w: 8.4,
        h: 0.4,
        fontSize: 14,
        fontFace: PPTX_SANS,
        color: theme.pptxMuted,
      })
    }
  } else if (layout === 'code') {
    const langLabel = slide.codeLanguage ? `  ·  ${slide.codeLanguage}` : ''
    s.addText(`${slide.title}${langLabel}`, {
      x: 0.6,
      y: 0.45,
      w: 8.8,
      h: 0.5,
      fontSize: 22,
      fontFace: PPTX_SANS,
      bold: true,
      color: theme.pptxAccent,
    })
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.55,
      y: 1.1,
      w: 8.9,
      h: 3.7,
      fill: { color: theme.pptxCodeBg },
      rectRadius: 0.08,
    })
    s.addText(slide.code || '', {
      x: 0.7,
      y: 1.25,
      w: 8.6,
      h: 3.4,
      fontSize: 12,
      fontFace: PPTX_MONO,
      color: theme.pptxText,
      valign: 'top',
    })
  } else if (layout === 'two_column') {
    s.addText(slide.title, {
      x: 0.6,
      y: 0.45,
      w: 8.8,
      h: 0.5,
      fontSize: 24,
      fontFace: PPTX_SANS,
      bold: true,
      color: theme.pptxAccent,
    })
    s.addText(slide.leftTitle || 'A', {
      x: 0.6,
      y: 1.15,
      w: 4.0,
      h: 0.35,
      fontSize: 14,
      fontFace: PPTX_SANS,
      bold: true,
      color: theme.pptxMuted,
    })
    s.addText(slide.rightTitle || 'B', {
      x: 5.2,
      y: 1.15,
      w: 4.0,
      h: 0.35,
      fontSize: 14,
      fontFace: PPTX_SANS,
      bold: true,
      color: theme.pptxMuted,
    })
    s.addText(
      (slide.leftBullets || []).map((b) => ({ text: b, options: { bullet: true } })),
      {
        x: 0.6,
        y: 1.6,
        w: 4.0,
        h: 3.2,
        fontSize: 15,
        fontFace: PPTX_SANS,
        color: theme.pptxText,
        paraSpaceAfter: 8,
      },
    )
    s.addText(
      (slide.rightBullets || []).map((b) => ({ text: b, options: { bullet: true } })),
      {
        x: 5.2,
        y: 1.6,
        w: 4.0,
        h: 3.2,
        fontSize: 15,
        fontFace: PPTX_SANS,
        color: theme.pptxText,
        paraSpaceAfter: 8,
      },
    )
  } else {
    s.addText(slide.title, {
      x: 0.6,
      y: 0.45,
      w: 8.8,
      h: 0.55,
      fontSize: layout === 'closing' ? 30 : 24,
      fontFace: PPTX_SANS,
      bold: true,
      color: theme.pptxAccent,
    })
    if (slide.subtitle) {
      s.addText(slide.subtitle, {
        x: 0.6,
        y: 1.05,
        w: 8.8,
        h: 0.35,
        fontSize: 14,
        fontFace: PPTX_SANS,
        color: theme.pptxMuted,
      })
    }
    s.addText(
      (slide.bullets || []).map((b) => ({ text: b, options: { bullet: true } })),
      {
        x: 0.6,
        y: slide.subtitle ? 1.5 : 1.2,
        w: 8.8,
        h: 3.4,
        fontSize: 17,
        fontFace: PPTX_SANS,
        color: theme.pptxText,
        paraSpaceAfter: 10,
      },
    )
  }

  s.addText('Codex Studio', {
    x: 0.6,
    y: 5.05,
    w: 4,
    h: 0.25,
    fontSize: 10,
    fontFace: PPTX_SANS,
    color: theme.pptxMuted,
  })

  addNotes(s, slide, includeNotes)
}

export async function writePptx(
  deck: Deck,
  outPath: string,
  options: { includeNotes: boolean },
): Promise<string> {
  await mkdir(dirname(outPath), { recursive: true })
  const theme = resolveTheme(deck.themeId)
  const PptxGenJS = resolvePptxCtor()
  const pptx = new PptxGenJS()
  pptx.author = 'Codex Studio'
  pptx.title = deck.title
  pptx.subject = 'Generated presentation'
  pptx.defineLayout({ name: 'CODEX_16x9', width: 10, height: 5.625 })
  pptx.layout = 'CODEX_16x9'

  for (const slide of deck.slides) {
    renderSlide(pptx, slide, theme, options.includeNotes)
  }

  await pptx.writeFile({ fileName: outPath })
  return outPath
}
