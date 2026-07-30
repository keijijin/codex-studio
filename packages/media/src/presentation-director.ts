import {
  buildHeuristicDeck,
  normalizeDeck,
  parseDeckJson,
} from './deck'
import type { Deck, PresentationThemeId } from './presentation-types'

const DIRECTOR_SYSTEM = `You are a presentation designer and narrative director. Given markdown documentation, produce a JSON deck for a polished slide deck.

Rules:
- Output ONLY valid JSON (no markdown fences).
- Schema: { "title": string, "themeId": "midnight"|"paper"|"forest"|"coral", "slides": Slide[] }
- Slide: { "id": "01", "layout": "title"|"section"|"bullets"|"two_column"|"code"|"quote"|"closing", "title": string, "subtitle"?: string, "bullets"?: string[], "leftTitle"?: string, "rightTitle"?: string, "leftBullets"?: string[], "rightBullets"?: string[], "code"?: string, "codeLanguage"?: string, "quote"?: string, "notes"?: string }
- One message per slide. Max 7 bullets, short lines.
- Use "code" ONLY for code/commands that appear in the source markdown (never invent code).
- Prefer Japanese narration/titles if the source is Japanese, else English.
- Always include a title slide first and a closing slide last.
- Add speaker notes when helpful.
- Keep total slides modest (about 5–12).`

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
}): Promise<{ deck: Deck; usedLlm: boolean }> {
  if (options.openaiApiKey) {
    try {
      const deck = await buildDeckWithLlm({
        markdown: options.markdown,
        themeId: options.themeId,
        maxSlides: options.maxSlides,
        openaiApiKey: options.openaiApiKey,
        model: options.directorModel,
        signal: options.signal,
      })
      // Prefer configured theme over LLM suggestion for consistency
      return { deck: { ...deck, themeId: options.themeId }, usedLlm: true }
    } catch {
      // fall through to heuristic
    }
  }

  const deck = buildHeuristicDeck(options.markdown, {
    themeId: options.themeId,
    maxSlides: options.maxSlides,
  })
  return { deck, usedLlm: false }
}
