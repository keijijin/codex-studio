import { writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'
import type { DeckSlide, ThemeTokens } from './presentation-types'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length > maxChars && cur) {
      lines.push(cur)
      cur = w
      if (lines.length >= maxLines) break
    } else {
      cur = next
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur)
  return lines
}

function bulletTexts(items: string[], max = 7): string[] {
  return items.slice(0, max).map((b) => b.slice(0, 90))
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
  const footer = `<text x="64" y="688" fill="${theme.muted}" font-size="16" font-family="Helvetica, Arial, sans-serif">${escapeXml(brand)}</text>`

  let body = ''
  const layout = slide.layout

  if (layout === 'title' || layout === 'section') {
    const titleLines = wrapText(slide.title, 28, 3)
    const titleSvg = titleLines
      .map(
        (l, i) =>
          `<text x="80" y="${280 + i * 56}" fill="${theme.text}" font-size="48" font-family="Helvetica, Arial, sans-serif" font-weight="700">${escapeXml(l)}</text>`,
      )
      .join('\n')
    const sub = slide.subtitle
      ? `<text x="80" y="${300 + titleLines.length * 56}" fill="${theme.muted}" font-size="24" font-family="Helvetica, Arial, sans-serif">${escapeXml(slide.subtitle.slice(0, 80))}</text>`
      : ''
    body = `${titleSvg}\n${sub}`
  } else if (layout === 'quote') {
    const quote = slide.quote || slide.title
    const qLines = wrapText(quote, 36, 5)
    body = `
      <text x="80" y="200" fill="${theme.accent}" font-size="72" font-family="Georgia, serif">“</text>
      ${qLines
        .map(
          (l, i) =>
            `<text x="100" y="${280 + i * 40}" fill="${theme.text}" font-size="28" font-family="Georgia, serif">${escapeXml(l)}</text>`,
        )
        .join('\n')}
      ${slide.title && slide.title !== quote ? `<text x="100" y="560" fill="${theme.muted}" font-size="18" font-family="Helvetica, Arial, sans-serif">— ${escapeXml(slide.title.slice(0, 60))}</text>` : ''}
    `
  } else if (layout === 'code') {
    const code = (slide.code || '').split('\n').slice(0, 14)
    const codeLines = code
      .map((l, i) => {
        const y = 180 + i * 28
        return `<text x="96" y="${y}" fill="${theme.text}" font-size="16" font-family="Menlo, Consolas, monospace">${escapeXml(l.slice(0, 88))}</text>`
      })
      .join('\n')
    body = `
      <text x="80" y="100" fill="${theme.accent}" font-size="32" font-family="Helvetica, Arial, sans-serif" font-weight="700">${escapeXml(slide.title.slice(0, 50))}</text>
      <rect x="64" y="130" width="1152" height="480" rx="12" fill="${theme.codeBg}" stroke="${theme.muted}" stroke-opacity="0.35"/>
      ${codeLines}
    `
  } else if (layout === 'two_column') {
    const left = bulletTexts(slide.leftBullets || [], 6)
    const right = bulletTexts(slide.rightBullets || [], 6)
    const leftTitle = slide.leftTitle || 'A'
    const rightTitle = slide.rightTitle || 'B'
    const leftItems = left
      .map(
        (b, i) =>
          `<text x="80" y="${220 + i * 44}" fill="${theme.text}" font-size="20" font-family="Helvetica, Arial, sans-serif">• ${escapeXml(b)}</text>`,
      )
      .join('\n')
    const rightItems = right
      .map(
        (b, i) =>
          `<text x="680" y="${220 + i * 44}" fill="${theme.text}" font-size="20" font-family="Helvetica, Arial, sans-serif">• ${escapeXml(b)}</text>`,
      )
      .join('\n')
    body = `
      <text x="80" y="100" fill="${theme.accent}" font-size="32" font-family="Helvetica, Arial, sans-serif" font-weight="700">${escapeXml(slide.title.slice(0, 50))}</text>
      <text x="80" y="160" fill="${theme.muted}" font-size="18" font-family="Helvetica, Arial, sans-serif" font-weight="600">${escapeXml(leftTitle)}</text>
      <text x="680" y="160" fill="${theme.muted}" font-size="18" font-family="Helvetica, Arial, sans-serif" font-weight="600">${escapeXml(rightTitle)}</text>
      <line x1="640" y1="140" x2="640" y2="620" stroke="${theme.muted}" stroke-opacity="0.4"/>
      ${leftItems}
      ${rightItems}
    `
  } else {
    // bullets | closing
    const items = bulletTexts(slide.bullets || [], 7)
    const titleSize = layout === 'closing' ? 40 : 32
    const list = items
      .map(
        (b, i) =>
          `<text x="80" y="${180 + i * 48}" fill="${theme.text}" font-size="22" font-family="Helvetica, Arial, sans-serif">• ${escapeXml(b)}</text>`,
      )
      .join('\n')
    body = `
      <text x="80" y="110" fill="${theme.accent}" font-size="${titleSize}" font-family="Helvetica, Arial, sans-serif" font-weight="700">${escapeXml(slide.title.slice(0, 50))}</text>
      ${slide.subtitle ? `<text x="80" y="148" fill="${theme.muted}" font-size="18" font-family="Helvetica, Arial, sans-serif">${escapeXml(slide.subtitle.slice(0, 80))}</text>` : ''}
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
