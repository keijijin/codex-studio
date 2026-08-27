import { writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'
import type { Shot, SlideVisual } from './types'
import { FONT_MONO, FONT_SANS, clampLine, escapeXml, wrapText } from './text'

function detectLayout(shot: Shot): SlideVisual {
  if (shot.visual) return shot.visual
  if (shot.kind === 'title') return 'title'
  const md = shot.slideMarkdown || ''
  if (/```/.test(md) || /^\s{4,}\S/m.test(md)) return 'code'
  if (shot.role === 'step') return 'steps'
  if (shot.onScreenKey && shot.role !== 'recap') return 'keyphrase'
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

function bulletLines(md: string, narration: string, max = 4): string[] {
  const fromList = md
    .split('\n')
    .map((l) => l.trim())
    .map((l) => {
      const m = l.match(/^[-*+]\s+(.+)$/) || l.match(/^\d+\.\s+(.+)$/)
      return m?.[1]?.replace(/[*_`]/g, '').trim()
    })
    .filter((x): x is string => Boolean(x))
  if (fromList.length > 0) return fromList.slice(0, max).map((l) => clampLine(l, 36))

  const plain = md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_`>#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const source = plain || narration
  return wrapText(source, 34, max)
}

function roleLabel(shot: Shot): string {
  switch (shot.role) {
    case 'hook':
      return 'Overview'
    case 'why':
      return 'Why it matters'
    case 'concept':
      return 'Concept'
    case 'step':
      return 'Steps'
    case 'example':
      return 'Example'
    case 'recap':
      return 'Takeaways'
    default:
      return 'Explainer'
  }
}

function shell(body: string, brand = 'Codex Studio'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="55%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <radialGradient id="glow" cx="80%" cy="20%" r="50%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <rect width="1280" height="720" fill="url(#glow)"/>
  <rect x="0" y="0" width="8" height="720" fill="#38bdf8"/>
  ${body}
  <text x="64" y="680" fill="#64748b" font-size="15" font-family="${FONT_SANS}">${escapeXml(brand)}</text>
</svg>
`
}

/** Write an SVG slide (1280x720) — NotebookLM-like sparse visuals. */
export async function writeSlideSvg(shot: Shot, outPath: string): Promise<string> {
  await mkdir(dirname(outPath), { recursive: true })
  const layout = detectLayout(shot)
  const title =
    shot.titleText ||
    shot.slideMarkdown?.match(/^#+\s+(.+)$/m)?.[1]?.trim() ||
    shot.onScreenKey ||
    shot.narration.slice(0, 40) ||
    'Slide'
  const key = shot.onScreenKey || title
  const eyebrow = roleLabel(shot)

  let body = ''
  if (layout === 'title') {
    const titleLines = wrapText(title, 16, 3)
    const titleSvg = titleLines
      .map(
        (l, i) =>
          `<text x="96" y="${240 + i * 70}" fill="#f8fafc" font-size="56" font-family="${FONT_SANS}" font-weight="700">${escapeXml(l)}</text>`,
      )
      .join('\n')
    const goal = wrapText(shot.narration, 32, 2)
    const sub = goal
      .map(
        (l, i) =>
          `<text x="96" y="${280 + titleLines.length * 70 + i * 36}" fill="#94a3b8" font-size="22" font-family="${FONT_SANS}">${escapeXml(l)}</text>`,
      )
      .join('\n')
    body = `
      <text x="96" y="160" fill="#38bdf8" font-size="18" font-family="${FONT_SANS}" letter-spacing="2">${escapeXml(eyebrow.toUpperCase())}</text>
      ${titleSvg}
      ${sub}
    `
  } else if (layout === 'keyphrase' || layout === 'quote') {
    const keyLines = wrapText(key, 12, 3)
    const keySvg = keyLines
      .map(
        (l, i) =>
          `<text x="96" y="${300 + i * 78}" fill="#f8fafc" font-size="64" font-family="${FONT_SANS}" font-weight="700">${escapeXml(l)}</text>`,
      )
      .join('\n')
    const supportSrc =
      layout === 'quote'
        ? (shot.slideMarkdown || '')
            .replace(/^#+\s+.+$/gm, '')
            .replace(/[*_`]/g, '')
            .trim() || shot.narration
        : shot.narration
    const support = wrapText(supportSrc, 34, 3)
    const supportSvg = support
      .map(
        (l, i) =>
          `<text x="96" y="${340 + keyLines.length * 78 + i * 34}" fill="#94a3b8" font-size="22" font-family="${FONT_SANS}">${escapeXml(l)}</text>`,
      )
      .join('\n')
    body = `
      <text x="96" y="150" fill="#38bdf8" font-size="18" font-family="${FONT_SANS}" letter-spacing="2">${escapeXml(eyebrow.toUpperCase())}</text>
      ${layout === 'quote' ? `<text x="96" y="240" fill="#64748b" font-size="72" font-family="${FONT_SANS}">“</text>` : ''}
      ${keySvg}
      ${supportSvg}
    `
  } else if (layout === 'code') {
    const { lang, code } = extractCode(shot.slideMarkdown || '')
    const lines = code.split('\n').slice(0, 12)
    const codeSvg = lines
      .map((l, i) => {
        const y = 200 + i * 30
        return `<text x="112" y="${y}" fill="#e2e8f0" font-size="16" font-family="${FONT_MONO}">${escapeXml(clampLine(l, 78))}</text>`
      })
      .join('\n')
    body = `
      <text x="96" y="120" fill="#38bdf8" font-size="18" font-family="${FONT_SANS}" letter-spacing="2">${escapeXml(eyebrow.toUpperCase())}</text>
      <text x="96" y="168" fill="#f8fafc" font-size="32" font-family="${FONT_SANS}" font-weight="700">${escapeXml(clampLine(title, 28))}</text>
      <text x="1184" y="168" fill="#64748b" font-size="14" font-family="${FONT_MONO}" text-anchor="end">${escapeXml(lang)}</text>
      <rect x="80" y="188" width="1120" height="420" rx="14" fill="#020617" stroke="#334155"/>
      ${codeSvg}
    `
  } else if (layout === 'steps') {
    const items = bulletLines(shot.slideMarkdown || '', shot.narration, 5)
    const list = items
      .map((b, i) => {
        const y = 220 + i * 72
        return `
          <circle cx="120" cy="${y - 8}" r="22" fill="#0ea5e9"/>
          <text x="120" y="${y - 2}" fill="#0b1220" font-size="18" font-family="${FONT_SANS}" font-weight="700" text-anchor="middle">${i + 1}</text>
          <text x="170" y="${y}" fill="#e2e8f0" font-size="26" font-family="${FONT_SANS}">${escapeXml(b)}</text>
        `
      })
      .join('\n')
    body = `
      <text x="96" y="120" fill="#38bdf8" font-size="18" font-family="${FONT_SANS}" letter-spacing="2">${escapeXml(eyebrow.toUpperCase())}</text>
      <text x="96" y="168" fill="#f8fafc" font-size="34" font-family="${FONT_SANS}" font-weight="700">${escapeXml(clampLine(key, 24))}</text>
      ${list}
    `
  } else {
    const items = bulletLines(shot.slideMarkdown || '', shot.narration, 4)
    const list = items
      .map((b, i) => {
        const y = 230 + i * 70
        return `
          <circle cx="112" cy="${y - 8}" r="6" fill="#38bdf8"/>
          <text x="140" y="${y}" fill="#e2e8f0" font-size="26" font-family="${FONT_SANS}">${escapeXml(b)}</text>
        `
      })
      .join('\n')
    body = `
      <text x="96" y="120" fill="#38bdf8" font-size="18" font-family="${FONT_SANS}" letter-spacing="2">${escapeXml(eyebrow.toUpperCase())}</text>
      <text x="96" y="168" fill="#f8fafc" font-size="34" font-family="${FONT_SANS}" font-weight="700">${escapeXml(clampLine(key, 24))}</text>
      ${list}
    `
  }

  await writeFile(outPath, shell(body), 'utf-8')
  return outPath
}
