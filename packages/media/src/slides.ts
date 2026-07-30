import { writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'
import type { Shot } from './types'
import { FONT_MONO, FONT_SANS, clampLine, escapeXml, wrapText } from './text'

type VideoSlideLayout = 'title' | 'code' | 'bullets'

function detectLayout(shot: Shot): VideoSlideLayout {
  if (shot.kind === 'title') return 'title'
  const md = shot.slideMarkdown || ''
  if (/```/.test(md) || /^\s{4,}\S/m.test(md)) return 'code'
  return 'bullets'
}

function extractCode(md: string): { lang: string; code: string } {
  const m = md.match(/```([\w+-]*)\n?([\s\S]*?)```/)
  if (m) {
    return { lang: (m[1] || 'text').trim() || 'text', code: (m[2] || '').trim() }
  }
  return {
    lang: 'text',
    code: md
      .replace(/^#+\s+.+$/gm, '')
      .trim()
      .slice(0, 1200),
  }
}

function bulletLines(md: string, narration: string): string[] {
  const fromList = md
    .split('\n')
    .map((l) => l.trim())
    .map((l) => {
      const m = l.match(/^[-*+]\s+(.+)$/) || l.match(/^\d+\.\s+(.+)$/)
      return m?.[1]?.replace(/[*_`]/g, '').trim()
    })
    .filter((x): x is string => Boolean(x))
  if (fromList.length > 0) return fromList.slice(0, 7).map((l) => clampLine(l, 42))

  const plain = md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_`>#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const source = plain || narration
  return wrapText(source, 40, 7)
}

function shell(body: string, brand = 'Codex Studio'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <rect x="0" y="0" width="10" height="720" fill="#38bdf8"/>
  <rect x="40" y="36" width="1200" height="648" rx="18" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
  ${body}
  <text x="64" y="666" fill="#64748b" font-size="16" font-family="${FONT_SANS}">${escapeXml(brand)}</text>
</svg>
`
}

/** Write an SVG slide (1280x720) — layout-aware title / code / bullets. */
export async function writeSlideSvg(shot: Shot, outPath: string): Promise<string> {
  await mkdir(dirname(outPath), { recursive: true })
  const layout = detectLayout(shot)
  const title =
    shot.titleText ||
    shot.slideMarkdown?.match(/^#+\s+(.+)$/m)?.[1]?.trim() ||
    shot.narration.slice(0, 40) ||
    'Slide'

  let body = ''
  if (layout === 'title') {
    const titleLines = wrapText(title, 18, 3)
    const titleSvg = titleLines
      .map(
        (l, i) =>
          `<text x="80" y="${250 + i * 64}" fill="#f8fafc" font-size="52" font-family="${FONT_SANS}" font-weight="700">${escapeXml(l)}</text>`,
      )
      .join('\n')
    const subLines = wrapText(shot.narration, 36, 2)
    const sub = subLines
      .map(
        (l, i) =>
          `<text x="80" y="${280 + titleLines.length * 64 + i * 36}" fill="#94a3b8" font-size="24" font-family="${FONT_SANS}">${escapeXml(l)}</text>`,
      )
      .join('\n')
    body = `${titleSvg}\n${sub}`
  } else if (layout === 'code') {
    const { lang, code } = extractCode(shot.slideMarkdown || '')
    const lines = code.split('\n').slice(0, 14)
    const codeSvg = lines
      .map((l, i) => {
        const y = 178 + i * 28
        return `<text x="96" y="${y}" fill="#e2e8f0" font-size="15" font-family="${FONT_MONO}">${escapeXml(clampLine(l, 86))}</text>`
      })
      .join('\n')
    body = `
      <text x="80" y="100" fill="#38bdf8" font-size="30" font-family="${FONT_SANS}" font-weight="700">${escapeXml(clampLine(title, 28))}</text>
      <text x="1100" y="100" fill="#64748b" font-size="14" font-family="${FONT_MONO}" text-anchor="end">${escapeXml(lang)}</text>
      <rect x="64" y="120" width="1152" height="500" rx="12" fill="#020617" stroke="#334155"/>
      ${codeSvg}
    `
  } else {
    const items = bulletLines(shot.slideMarkdown || '', shot.narration)
    const list = items
      .map((b, i) => {
        const y = 178 + i * 52
        return `
          <circle cx="88" cy="${y - 6}" r="5" fill="#38bdf8"/>
          <text x="110" y="${y}" fill="#e2e8f0" font-size="24" font-family="${FONT_SANS}">${escapeXml(b)}</text>
        `
      })
      .join('\n')
    body = `
      <text x="80" y="110" fill="#38bdf8" font-size="32" font-family="${FONT_SANS}" font-weight="700">${escapeXml(clampLine(title, 28))}</text>
      ${list}
    `
  }

  await writeFile(outPath, shell(body), 'utf-8')
  return outPath
}
