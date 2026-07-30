import type { Shot, ShotKind, Shotlist, VideoRenderMode } from './types'

const CODE_FENCE = /```[\s\S]*?```/g

export function slugifyTitle(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return base || `video-${Date.now()}`
}

export function extractTitle(markdown: string): string {
  const h1 = markdown.match(/^#\s+(.+)$/m)
  if (h1?.[1]) return h1[1].trim().slice(0, 80)
  const first = markdown.trim().split(/\n/)[0]?.replace(/^#+\s*/, '').trim()
  return (first && first.length > 0 ? first : 'Tutorial').slice(0, 80)
}

function clampDuration(n: number, min = 3, max = 12): number {
  if (!Number.isFinite(n)) return 5
  return Math.min(max, Math.max(min, Math.round(n)))
}

function normalizeKind(raw: unknown, mode: VideoRenderMode): ShotKind {
  const k = String(raw ?? 'slide')
  if (k === 'title' || k === 'slide' || k === 'generative') {
    if (mode === 'slides' && k === 'generative') return 'slide'
    if (mode === 'generative' && k === 'slide') return 'generative'
    return k
  }
  return 'slide'
}

export function parseShotlistJson(raw: string, mode: VideoRenderMode): Shotlist {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const data = JSON.parse(cleaned) as Partial<Shotlist>
  if (!data || !Array.isArray(data.shots) || data.shots.length === 0) {
    throw new Error('shotlist must include a non-empty shots array')
  }
  const shots: Shot[] = data.shots.map((s, i) => {
    const kind = normalizeKind(s.kind, mode)
    const narration = String(s.narration ?? '').trim() || `Shot ${i + 1}`
    return {
      id: String(s.id ?? String(i + 1).padStart(2, '0')),
      kind,
      narration,
      durationSec: clampDuration(Number(s.durationSec ?? 5)),
      runwayPrompt: s.runwayPrompt ? String(s.runwayPrompt) : undefined,
      slideMarkdown: s.slideMarkdown ? String(s.slideMarkdown) : undefined,
      titleText: s.titleText ? String(s.titleText) : undefined,
    }
  })
  return {
    title: String(data.title ?? 'Tutorial').slice(0, 120),
    voice: String(data.voice ?? 'alloy'),
    shots,
  }
}

/**
 * Heuristic director: split markdown into title + section slides.
 * Used when LLM director is unavailable; never emits generative shots unless mode=generative
 * (then first conceptual section becomes generative with a generic prompt).
 */
export function buildHeuristicShotlist(
  markdown: string,
  options: {
    mode: VideoRenderMode
    maxShots: number
    maxGenerativeShots: number
    voice?: string
  },
): Shotlist {
  const title = extractTitle(markdown)
  const body = markdown.replace(/^#\s+.+$/m, '').trim()
  const sections = body
    .split(/\n(?=##\s+)/)
    .map((s) => s.trim())
    .filter(Boolean)

  const chunks =
    sections.length > 0
      ? sections
      : body
          .split(/\n{2,}/)
          .map((s) => s.trim())
          .filter((s) => s.length > 20)

  const shots: Shot[] = [
    {
      id: '01',
      kind: 'title',
      titleText: title,
      narration: `${title}について説明します。`,
      durationSec: 4,
      slideMarkdown: `# ${title}`,
    },
  ]

  let generativeUsed = 0
  const limit = Math.max(1, options.maxShots - 1)
  for (let i = 0; i < Math.min(chunks.length, limit); i++) {
    const chunk = chunks[i]!
    const heading = chunk.match(/^##\s+(.+)$/m)?.[1]?.trim()
    const plain = chunk.replace(CODE_FENCE, ' ').replace(/[#>*_`]/g, ' ').replace(/\s+/g, ' ').trim()
    const hasCode = CODE_FENCE.test(chunk)
    CODE_FENCE.lastIndex = 0

    let kind: ShotKind = 'slide'
    if (
      options.mode === 'generative' ||
      (options.mode === 'hybrid' &&
        !hasCode &&
        generativeUsed < options.maxGenerativeShots &&
        i === 0)
    ) {
      kind = 'generative'
      generativeUsed++
    }
    if (options.mode === 'slides') kind = 'slide'

    const narration =
      (heading ? `${heading}。` : '') +
      plain.slice(0, 180) +
      (plain.length > 180 ? '…' : '')

    shots.push({
      id: String(i + 2).padStart(2, '0'),
      kind,
      narration: narration || `セクション ${i + 1}`,
      durationSec: clampDuration(4 + Math.min(6, Math.ceil(plain.length / 80))),
      slideMarkdown: chunk.slice(0, 2000),
      titleText: heading,
      runwayPrompt:
        kind === 'generative'
          ? `Clean abstract technology visualization for: ${heading || title}. Soft lighting, slow camera push-in, 16:9, no text overlays.`
          : undefined,
    })
  }

  return {
    title,
    voice: options.voice ?? 'alloy',
    shots: shots.slice(0, options.maxShots),
  }
}

/** Enforce max generative shots and mode constraints. */
export function normalizeShotlist(
  list: Shotlist,
  mode: VideoRenderMode,
  maxShots: number,
  maxGenerativeShots: number,
): Shotlist {
  let generative = 0
  const shots = list.shots.slice(0, maxShots).map((s) => {
    let kind = s.kind
    if (mode === 'slides' && kind === 'generative') kind = 'slide'
    if (kind === 'generative') {
      generative++
      if (generative > maxGenerativeShots) kind = 'slide'
    }
    if (kind === 'generative' && !s.runwayPrompt) {
      s = {
        ...s,
        runwayPrompt: `Abstract cinematic B-roll for educational video titled "${list.title}", clean tech aesthetic, no readable text.`,
      }
    }
    if ((kind === 'slide' || kind === 'title') && !s.slideMarkdown) {
      s = {
        ...s,
        slideMarkdown: `# ${s.titleText || list.title}\n\n${s.narration}`,
      }
    }
    return { ...s, kind, durationSec: clampDuration(s.durationSec) }
  })
  return { ...list, shots }
}
