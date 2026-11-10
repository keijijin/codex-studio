import type {
  Shot,
  ShotKind,
  Shotlist,
  ShotRole,
  SlideVisual,
  VideoIntentSummary,
  VideoRenderMode,
} from './types'
import {
  estimateNarrationDurationSec,
  extractVideoIntentHeuristic,
  type VideoIntent,
} from './intent'

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

function clampDuration(n: number, min = 3, max = 14): number {
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

function normalizeRole(raw: unknown): ShotRole | undefined {
  const r = String(raw ?? '')
  if (
    r === 'hook' ||
    r === 'why' ||
    r === 'concept' ||
    r === 'step' ||
    r === 'example' ||
    r === 'recap'
  ) {
    return r
  }
  return undefined
}

function normalizeVisual(raw: unknown): SlideVisual | undefined {
  const v = String(raw ?? '')
  if (
    v === 'title' ||
    v === 'keyphrase' ||
    v === 'bullets' ||
    v === 'steps' ||
    v === 'code' ||
    v === 'quote'
  ) {
    return v
  }
  return undefined
}

function parseIntent(raw: unknown): VideoIntentSummary | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const learningGoal = String(o.learningGoal ?? '').trim()
  const audience = String(o.audience ?? '').trim()
  const takeaway = String(o.takeaway ?? '').trim()
  const mustTeach = Array.isArray(o.mustTeach)
    ? o.mustTeach.map((x) => String(x).trim()).filter(Boolean).slice(0, 8)
    : []
  if (!learningGoal && mustTeach.length === 0) return undefined
  const language =
    o.language === 'ja' || o.language === 'en' || o.language === 'other'
      ? o.language
      : undefined
  return {
    learningGoal: learningGoal || mustTeach[0] || 'Understand the topic',
    audience: audience || 'engineers',
    mustTeach,
    takeaway: takeaway || learningGoal || mustTeach[mustTeach.length - 1] || '',
    language,
  }
}

export function parseShotlistJson(raw: string, mode: VideoRenderMode): Shotlist {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const data = JSON.parse(cleaned) as Partial<Shotlist> & { intent?: unknown }
  if (!data || !Array.isArray(data.shots) || data.shots.length === 0) {
    throw new Error('shotlist must include a non-empty shots array')
  }
  const intent = parseIntent(data.intent)
  const lang = intent?.language ?? 'other'
  const shots: Shot[] = data.shots.map((s, i) => {
    const kind = normalizeKind(s.kind, mode)
    const narration = String(s.narration ?? '').trim() || `Shot ${i + 1}`
    const durationSec = clampDuration(
      Number(s.durationSec ?? estimateNarrationDurationSec(narration, lang)),
    )
    return {
      id: String(s.id ?? String(i + 1).padStart(2, '0')),
      kind,
      narration,
      durationSec,
      runwayPrompt: s.runwayPrompt ? String(s.runwayPrompt) : undefined,
      slideMarkdown: s.slideMarkdown ? String(s.slideMarkdown) : undefined,
      titleText: s.titleText ? String(s.titleText) : undefined,
      role: normalizeRole(s.role),
      onScreenKey: s.onScreenKey ? String(s.onScreenKey).slice(0, 48) : undefined,
      visual: normalizeVisual(s.visual),
    }
  })
  return {
    title: String(data.title ?? 'Tutorial').slice(0, 120),
    voice: String(data.voice ?? 'alloy'),
    shots,
    intent,
  }
}

function speakableJa(heading: string, plain: string, role: ShotRole): string {
  const tip = plain.slice(0, 120)
  switch (role) {
    case 'hook':
      return `${heading}について、今日押さえるポイントを短くまとめます。`
    case 'why':
      return tip
        ? `なぜこれが大事か。${tip}${plain.length > 120 ? '…' : ''}`
        : 'なぜこれが大事かを整理します。'
    case 'concept':
      return tip
        ? `まず考え方です。${tip}${plain.length > 120 ? '…' : ''}`
        : `${heading}の考え方を押さえます。`
    case 'step':
      return tip
        ? `手順です。${tip}${plain.length > 120 ? '…' : ''}`
        : `${heading}の手順を追います。`
    case 'example':
      return tip
        ? `具体例です。${tip}${plain.length > 120 ? '…' : ''}`
        : `${heading}の例を見ます。`
    case 'recap':
      return `まとめです。${heading}の要点を確認して、次の作業に進みましょう。`
  }
}

function speakableEn(heading: string, plain: string, role: ShotRole): string {
  const tip = plain.slice(0, 140)
  switch (role) {
    case 'hook':
      return `Here is what you will take away from ${heading}.`
    case 'why':
      return tip ? `Why it matters: ${tip}` : `Why ${heading} matters.`
    case 'concept':
      return tip ? `The idea: ${tip}` : `Let's frame the concept behind ${heading}.`
    case 'step':
      return tip ? `Step by step: ${tip}` : `Here is how to do ${heading}.`
    case 'example':
      return tip ? `For example: ${tip}` : `A concrete example of ${heading}.`
    case 'recap':
      return `Recap: keep these points about ${heading} in mind as you implement.`
  }
}

/**
 * Heuristic director: NotebookLM-like arc (hook → why/concept → steps → recap).
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
  const intent = extractVideoIntentHeuristic(markdown)
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
      role: 'hook',
      visual: 'title',
      titleText: title,
      onScreenKey: title.slice(0, 28),
      narration:
        intent.language === 'ja'
          ? speakableJa(title, intent.learningGoal, 'hook')
          : speakableEn(title, intent.learningGoal, 'hook'),
      durationSec: estimateNarrationDurationSec(intent.learningGoal, intent.language),
      slideMarkdown: `# ${title}\n\n${intent.learningGoal}`,
    },
  ]

  // Why / goal shot when we have room
  if (options.maxShots >= 4 && intent.learningGoal) {
    shots.push({
      id: '02',
      kind: options.mode === 'generative' ? 'generative' : 'slide',
      role: 'why',
      visual: 'keyphrase',
      titleText: intent.language === 'ja' ? '今日のゴール' : 'Learning goal',
      onScreenKey:
        intent.language === 'ja' ? 'ゴール' : 'Goal',
      narration:
        intent.language === 'ja'
          ? speakableJa(title, intent.learningGoal, 'why')
          : speakableEn(title, intent.learningGoal, 'why'),
      durationSec: estimateNarrationDurationSec(intent.learningGoal, intent.language),
      slideMarkdown: `## Goal\n\n${intent.learningGoal}\n\n- ${intent.audience}`,
      runwayPrompt:
        options.mode !== 'slides'
          ? `Clean abstract visualization of clarity and focus for: ${title}. Soft light, slow push-in, 16:9, no readable text.`
          : undefined,
    })
  }

  let generativeUsed =
    shots.filter((s) => s.kind === 'generative').length
  const remainingSlots = Math.max(1, options.maxShots - shots.length - 1) // leave 1 for recap
  for (let i = 0; i < Math.min(chunks.length, remainingSlots); i++) {
    const chunk = chunks[i]!
    const heading = chunk.match(/^##\s+(.+)$/m)?.[1]?.trim() || intent.mustTeach[i] || `Point ${i + 1}`
    const plain = chunk
      .replace(CODE_FENCE, ' ')
      .replace(/[#>*_`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const hasCode = CODE_FENCE.test(chunk)
    CODE_FENCE.lastIndex = 0

    const role: ShotRole = hasCode ? 'step' : i === 0 ? 'concept' : 'step'
    let kind: ShotKind = 'slide'
    if (
      options.mode === 'generative' ||
      (options.mode === 'hybrid' &&
        !hasCode &&
        generativeUsed < options.maxGenerativeShots &&
        role === 'concept')
    ) {
      kind = 'generative'
      generativeUsed++
    }
    if (options.mode === 'slides') kind = 'slide'

    const narration =
      intent.language === 'ja'
        ? speakableJa(heading, plain, role)
        : speakableEn(heading, plain, role)

    shots.push({
      id: String(shots.length + 1).padStart(2, '0'),
      kind,
      role,
      visual: hasCode ? 'code' : role === 'step' ? 'steps' : 'keyphrase',
      titleText: heading,
      onScreenKey: heading.slice(0, 24),
      narration,
      durationSec: estimateNarrationDurationSec(narration, intent.language),
      slideMarkdown: chunk.slice(0, 2000),
      runwayPrompt:
        kind === 'generative'
          ? `Clean abstract technology visualization for: ${heading}. Soft lighting, slow camera push-in, 16:9, no text overlays.`
          : undefined,
    })
  }

  // Recap
  if (options.maxShots > shots.length) {
    const points = intent.mustTeach.slice(0, 4)
    const recapBody =
      points.length > 0
        ? points.map((p) => `- ${p}`).join('\n')
        : `- ${intent.takeaway}`
    const narration =
      intent.language === 'ja'
        ? speakableJa(title, intent.takeaway, 'recap')
        : speakableEn(title, intent.takeaway, 'recap')
    shots.push({
      id: String(shots.length + 1).padStart(2, '0'),
      kind: 'slide',
      role: 'recap',
      visual: 'bullets',
      titleText: intent.language === 'ja' ? 'まとめ' : 'Takeaways',
      onScreenKey: intent.language === 'ja' ? 'まとめ' : 'Recap',
      narration,
      durationSec: estimateNarrationDurationSec(narration, intent.language),
      slideMarkdown: `## Takeaways\n\n${recapBody}`,
    })
  }

  return {
    title,
    voice: options.voice ?? 'alloy',
    intent: {
      learningGoal: intent.learningGoal,
      audience: intent.audience,
      mustTeach: intent.mustTeach,
      takeaway: intent.takeaway,
      language: intent.language,
    },
    shots: shots.slice(0, options.maxShots),
  }
}

function ensureArc(shots: Shot[], intent: VideoIntent | VideoIntentSummary | undefined): Shot[] {
  if (shots.length === 0) return shots
  const next = [...shots]
  if (!next[0]!.role) next[0] = { ...next[0]!, role: 'hook' }
  const hasRecap = next.some((s) => s.role === 'recap')
  if (!hasRecap && next.length >= 3) {
    const last = next[next.length - 1]!
    if (last.role !== 'hook') {
      next[next.length - 1] = {
        ...last,
        role: 'recap',
        visual: last.visual ?? 'bullets',
        onScreenKey: last.onScreenKey ?? (intent?.language === 'ja' ? 'まとめ' : 'Recap'),
      }
    }
  }
  return next
}

/** Enforce max generative shots, mode, duration, and pedagogical defaults. */
export function normalizeShotlist(
  list: Shotlist,
  mode: VideoRenderMode,
  maxShots: number,
  maxGenerativeShots: number,
): Shotlist {
  const intent =
    list.intent ??
    ({
      learningGoal: list.title,
      audience: 'engineers',
      mustTeach: [],
      takeaway: list.title,
      language: 'other' as const,
    } satisfies VideoIntentSummary)

  let generative = 0
  let shots = list.shots.slice(0, maxShots).map((s, i) => {
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
        slideMarkdown: `# ${s.titleText || list.title}\n\n${s.onScreenKey || s.narration}`,
      }
    }
    if (!s.onScreenKey && s.titleText) {
      s = { ...s, onScreenKey: s.titleText.slice(0, 28) }
    }
    if (!s.visual) {
      const visual: SlideVisual =
        kind === 'title'
          ? 'title'
          : /```/.test(s.slideMarkdown || '')
            ? 'code'
            : s.role === 'recap' || s.role === 'step'
              ? s.role === 'step'
                ? 'steps'
                : 'bullets'
              : 'keyphrase'
      s = { ...s, visual }
    }
    if (!s.role) {
      const role: ShotRole =
        i === 0 ? 'hook' : i === list.shots.length - 1 ? 'recap' : kind === 'generative' ? 'concept' : 'step'
      s = { ...s, role }
    }
    const durationSec = clampDuration(
      s.durationSec ||
        estimateNarrationDurationSec(s.narration, intent.language ?? 'other'),
    )
    return { ...s, kind, durationSec }
  })

  shots = ensureArc(shots, intent)

  return { ...list, intent, shots }
}
