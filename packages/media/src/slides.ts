import { writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'
import type { Shot } from './types'

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function slideLines(shot: Shot): string[] {
  const md = shot.slideMarkdown || shot.titleText || shot.narration
  const lines = md
    .replace(/```[\s\S]*?```/g, (block) =>
      block
        .replace(/```\w*\n?/g, '')
        .replace(/```/g, '')
        .split('\n')
        .map((l) => l.slice(0, 72))
        .join('\n'),
    )
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').replace(/[*_`]/g, '').trim())
    .filter(Boolean)
    .slice(0, 12)
  return lines.length > 0 ? lines : [shot.narration.slice(0, 80)]
}

/** Write an SVG slide (1280x720) — converted to PNG/MP4 via ffmpeg. */
export async function writeSlideSvg(shot: Shot, outPath: string): Promise<string> {
  await mkdir(dirname(outPath), { recursive: true })
  const lines = slideLines(shot)
  const title = escapeXml((shot.titleText || lines[0] || 'Slide').slice(0, 60))
  const body = lines
    .slice(shot.titleText ? 0 : 1)
    .slice(0, 10)
    .map((l, i) => {
      const y = 160 + i * 44
      return `<text x="80" y="${y}" fill="#e4e4e7" font-size="26" font-family="Menlo, Consolas, monospace">${escapeXml(l.slice(0, 70))}</text>`
    })
    .join('\n')

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <rect x="48" y="48" width="1184" height="624" rx="16" fill="#111827" stroke="#334155" stroke-width="2"/>
  <text x="80" y="110" fill="#38bdf8" font-size="36" font-family="Helvetica, Arial, sans-serif" font-weight="700">${title}</text>
  ${body}
  <text x="80" y="660" fill="#64748b" font-size="18" font-family="Helvetica, Arial, sans-serif">Codex Studio</text>
</svg>
`
  await writeFile(outPath, svg, 'utf-8')
  return outPath
}
