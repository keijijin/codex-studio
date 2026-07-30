/** Shared typography helpers for SVG / PPTX slide rendering. */

export const FONT_SANS =
  "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Yu Gothic', 'Noto Sans CJK JP', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"

export const FONT_SERIF =
  "'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif CJK JP', Georgia, 'Times New Roman', serif"

export const FONT_MONO =
  "'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'Cascadia Mono', monospace"

/** pptxgenjs faces — prefer fonts commonly available on JP desktops. */
export const PPTX_SANS = 'Yu Gothic'
export const PPTX_SERIF = 'Yu Mincho'
export const PPTX_MONO = 'Consolas'

/**
 * Wrap text for CJK + Latin. Splits on whitespace for Latin words;
 * falls back to grapheme/character chunks when a token is too long (Japanese).
 */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  const tokens = tokenize(normalized)
  const lines: string[] = []
  let cur = ''

  const push = (line: string) => {
    if (lines.length >= maxLines) return
    lines.push(line)
  }

  for (const token of tokens) {
    if (lines.length >= maxLines) break
    if (token === ' ') {
      if (cur.length > 0 && cur.length < maxChars) cur += ' '
      continue
    }

    if (token.length > maxChars) {
      if (cur) {
        push(cur.trimEnd())
        cur = ''
      }
      for (let i = 0; i < token.length && lines.length < maxLines; i += maxChars) {
        const chunk = token.slice(i, i + maxChars)
        if (i + maxChars < token.length && lines.length === maxLines - 1) {
          push(`${chunk.slice(0, Math.max(1, maxChars - 1))}…`)
        } else {
          push(chunk)
        }
      }
      continue
    }

    const next = cur ? `${cur}${token}` : token
    if (next.length > maxChars && cur) {
      push(cur.trimEnd())
      cur = token
    } else {
      cur = next
    }
  }

  if (cur && lines.length < maxLines) push(cur.trimEnd())

  if (lines.length === maxLines) {
    const last = lines[maxLines - 1]!
    const remaining = tokens.join('').length > lines.join('').length
    if (remaining && !last.endsWith('…')) {
      lines[maxLines - 1] = `${last.slice(0, Math.max(1, maxChars - 1))}…`
    }
  }

  return lines.filter(Boolean)
}

function tokenize(text: string): string[] {
  // Keep spaces as tokens; split CJK runs into characters for wrapping flexibility
  const out: string[] = []
  const re = /(\s+)|([\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]+)|([^\s\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m[1]) {
      out.push(' ')
    } else if (m[2]) {
      out.push(...[...m[2]])
    } else if (m[3]) {
      out.push(m[3])
    }
  }
  return out
}

export function clampLine(text: string, maxChars: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= maxChars) return t
  return `${t.slice(0, Math.max(1, maxChars - 1))}…`
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
