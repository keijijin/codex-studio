import { writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'
import type { DeckSlide, ThemeTokens } from './presentation-types'
import {
  FONT_MONO,
  FONT_SANS,
  FONT_SERIF,
  clampLine,
  escapeXml,
  wrapText,
} from './text'

function bulletTexts(items: string[], max = 7, maxChars = 36): string[] {
  return items.slice(0, max).map((b) => clampLine(b, maxChars))
}

/** Write a 1280x720 SVG preview for one deck slide. */
export async function writePresentationSlideSvg(
  slide: DeckSlide,
  theme: ThemeTokens,
  outPath: string,
  brand = 'Codex Studio',
): Promise<string> {
  await mkdir(dirname(outPath), { recursive: true })

  const accentBar = `<rect x="0" y="0" width="12" height="720" fill="${theme.accent}"/>`
  const footer = `<text x="64" y="688" fill="${theme.muted}" font-size="16" font-family="${FONT_SANS}">${escapeXml(brand)}</text>`

  let body = ''
  const layout = slide.layout

  if (layout === 'title' || layout === 'section') {
    const titleLines = wrapText(slide.title, 16, 3)
    const titleSize = layout === 'title' ? 48 : 40
    const titleSvg = titleLines
      .map(
        (l, i) =>
          `<text x="80" y="${240 + i * 58}" fill="${theme.text}" font-size="${titleSize}" font-family="${FONT_SANS}" font-weight="700">${escapeXml(l)}</text>`,
      )
      .join('\n')
    const subLines = slide.subtitle ? wrapText(slide.subtitle, 28, 2) : []
    const sub = subLines
      .map(
        (l, i) =>
          `<text x="80" y="${260 + titleLines.length * 58 + i * 34}" fill="${theme.muted}" font-size="22" font-family="${FONT_SANS}">${escapeXml(l)}</text>`,
      )
      .join('\n')
    body = `${titleSvg}\n${sub}`
  } else if (layout === 'quote') {
    const quote = slide.quote || slide.title
    const qLines = wrapText(quote, 22, 5)
    body = `
      <text x="80" y="200" fill="${theme.accent}" font-size="72" font-family="${FONT_SERIF}">“</text>
      ${qLines
        .map(
          (l, i) =>
            `<text x="100" y="${280 + i * 42}" fill="${theme.text}" font-size="28" font-family="${FONT_SERIF}">${escapeXml(l)}</text>`,
        )
        .join('\n')}
      ${
        slide.title && slide.title !== quote
          ? `<text x="100" y="560" fill="${theme.muted}" font-size="18" font-family="${FONT_SANS}">— ${escapeXml(clampLine(slide.title, 40))}</text>`
          : ''
      }
    `
  } else if (layout === 'code') {
    const code = (slide.code || '').split('\n').slice(0, 14)
    const lang = slide.codeLanguage || 'code'
    const codeLines = code
      .map((l, i) => {
        const y = 180 + i * 28
        return `<text x="96" y="${y}" fill="${theme.text}" font-size="15" font-family="${FONT_MONO}">${escapeXml(clampLine(l, 86))}</text>`
      })
      .join('\n')
    body = `
      <text x="80" y="100" fill="${theme.accent}" font-size="30" font-family="${FONT_SANS}" font-weight="700">${escapeXml(clampLine(slide.title, 28))}</text>
      <text x="1100" y="100" fill="${theme.muted}" font-size="14" font-family="${FONT_MONO}" text-anchor="end">${escapeXml(lang)}</text>
      <rect x="64" y="130" width="1152" height="480" rx="12" fill="${theme.codeBg}" stroke="${theme.muted}" stroke-opacity="0.35"/>
      ${codeLines}
    `
  } else if (layout === 'two_column') {
    const left = bulletTexts(slide.leftBullets || [], 6, 22)
    const right = bulletTexts(slide.rightBullets || [], 6, 22)
    const leftTitle = clampLine(slide.leftTitle || 'A', 18)
    const rightTitle = clampLine(slide.rightTitle || 'B', 18)
    const leftItems = left
      .map(
        (b, i) =>
          `<text x="80" y="${220 + i * 44}" fill="${theme.text}" font-size="18" font-family="${FONT_SANS}">• ${escapeXml(b)}</text>`,
      )
      .join('\n')
    const rightItems = right
      .map(
        (b, i) =>
          `<text x="680" y="${220 + i * 44}" fill="${theme.text}" font-size="18" font-family="${FONT_SANS}">• ${escapeXml(b)}</text>`,
      )
      .join('\n')
    body = `
      <text x="80" y="100" fill="${theme.accent}" font-size="30" font-family="${FONT_SANS}" font-weight="700">${escapeXml(clampLine(slide.title, 28))}</text>
      <text x="80" y="160" fill="${theme.muted}" font-size="16" font-family="${FONT_SANS}" font-weight="600">${escapeXml(leftTitle)}</text>
      <text x="680" y="160" fill="${theme.muted}" font-size="16" font-family="${FONT_SANS}" font-weight="600">${escapeXml(rightTitle)}</text>
      <line x1="640" y1="140" x2="640" y2="620" stroke="${theme.muted}" stroke-opacity="0.4"/>
      ${leftItems}
      ${rightItems}
    `
  } else {
    // bullets | closing
    const items = bulletTexts(slide.bullets || [], 7, 36)
    const titleSize = layout === 'closing' ? 38 : 30
    const list = items
      .map((b, i) => {
        const y = 190 + i * 50
        return `
          <circle cx="88" cy="${y - 6}" r="5" fill="${theme.accent}"/>
          <text x="110" y="${y}" fill="${theme.text}" font-size="22" font-family="${FONT_SANS}">${escapeXml(b)}</text>
        `
      })
      .join('\n')
    const sub = slide.subtitle
      ? `<text x="80" y="148" fill="${theme.muted}" font-size="18" font-family="${FONT_SANS}">${escapeXml(clampLine(slide.subtitle, 40))}</text>`
      : ''
    body = `
      <text x="80" y="110" fill="${theme.accent}" font-size="${titleSize}" font-family="${FONT_SANS}" font-weight="700">${escapeXml(clampLine(slide.title, 28))}</text>
      ${sub}
      ${list}
    `
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="${theme.background}"/>
  <rect x="32" y="32" width="1216" height="656" rx="20" fill="${theme.surface}"/>
  ${accentBar}
  ${body}
  ${footer}
</svg>
`
  await writeFile(outPath, svg, 'utf-8')
  return outPath
}
