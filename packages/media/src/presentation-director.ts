import {
  buildHeuristicDeck,
  normalizeDeck,
  parseDeckJson,
} from './deck'
import type { Deck, PresentationThemeId } from './presentation-types'

const DIRECTOR_SYSTEM = `You are a principal presentation designer (think: sharp tech keynote, not a wall of bullets).
Given markdown documentation, produce a JSON deck for a polished slide deck.

Output ONLY valid JSON (no markdown fences).
Schema: { "title": string, "themeId": "midnight"|"paper"|"forest"|"coral", "slides": Slide[] }
Slide: {
  "id": "01",
  "layout": "title"|"section"|"bullets"|"two_column"|"code"|"diagram"|"quote"|"closing",
  "title": string,
  "subtitle"?: string,
  "bullets"?: string[],
  "leftTitle"?: string,
  "rightTitle"?: string,
  "leftBullets"?: string[],
  "rightBullets"?: string[],
  "code"?: string,
  "codeLanguage"?: string,
  "quote"?: string,
  "notes"?: string
}

Craft rules:
- One message per slide. Max 5 bullets preferred (hard max 7). Each bullet ≤ 40 chars when possible.
- Vary layouts: use section for chapter breaks, two_column for contrasts, quote for a key insight, code for real snippets.
- code layout: copy code ONLY from the source markdown fences (never invent). Use for sql/ts/js/etc.
- diagram layout: REQUIRED for \`\`\`mermaid fences. Put the mermaid source in "code" and set "codeLanguage":"mermaid". Never paste mermaid as plain code text on a code slide.
- Always start with title and end with closing (next steps / CTA).
- Speaker notes: what to say aloud (1–3 sentences), not a paste of bullets.
- Language: Japanese if source is Japanese, else English.
- Keep 6–12 slides unless the doc is tiny.`

export async function buildDeckWithLlm(options: {
  markdown: string
  themeId: PresentationThemeId
  maxSlides: number
  openaiApiKey: string
  model?: string
  signal?: AbortSignal
}): Promise<Deck> {
  const model = options.model ?? 'gpt-4o-mini'
  const user = `Preferred themeId: ${options.themeId}
Max slides: ${options.maxSlides}

Audience: engineers / stakeholders reviewing a technical topic.
Arc: hook → problem → approach → concrete evidence (code) → takeaway.

--- MARKDOWN ---
${options.markdown.slice(0, 24_000)}
`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: DIRECTOR_SYSTEM },
        { role: 'user', content: user },
      ],
    }),
    signal: options.signal,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Presentation director LLM failed (${res.status}): ${text.slice(0, 200)}`)
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new Error('Presentation director LLM returned empty content')

  const parsed = parseDeckJson(content, options.themeId)
  return normalizeDeck(parsed, options.maxSlides)
}

export async function buildDeck(options: {
  markdown: string
  themeId: PresentationThemeId
  maxSlides: number
  openaiApiKey?: string
  directorModel?: string
  signal?: AbortSignal
}): Promise<{ deck: Deck; usedLlm: boolean; fallbackReason?: string }> {
  if (!options.openaiApiKey) {
    return {
      deck: buildHeuristicDeck(options.markdown, {
        themeId: options.themeId,
        maxSlides: options.maxSlides,
      }),
      usedLlm: false,
      fallbackReason: 'OpenAI API key が未設定のため heuristic deck を使用',
    }
  }

  try {
    const deck = await buildDeckWithLlm({
      markdown: options.markdown,
      themeId: options.themeId,
      maxSlides: options.maxSlides,
      openaiApiKey: options.openaiApiKey,
      model: options.directorModel,
      signal: options.signal,
    })
    return { deck: { ...deck, themeId: options.themeId }, usedLlm: true }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return {
      deck: buildHeuristicDeck(options.markdown, {
        themeId: options.themeId,
        maxSlides: options.maxSlides,
      }),
      usedLlm: false,
      fallbackReason: `Director LLM 失敗のため heuristic に降格: ${detail.slice(0, 180)}`,
    }
  }
}
