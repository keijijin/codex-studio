import {
  buildHeuristicShotlist,
  normalizeShotlist,
  parseShotlistJson,
} from './shotlist'
import type { Shotlist, VideoRenderMode } from './types'

const DIRECTOR_SYSTEM = `You are a senior tutorial video director for developer education.
Given markdown documentation, produce a JSON shotlist for a short, watchable educational video.

Output ONLY valid JSON (no markdown fences).
Schema: { "title": string, "voice": "alloy", "shots": Shot[] }
Shot: {
  "id": "01",
  "kind": "title"|"slide"|"generative",
  "narration": string,
  "durationSec": number,
  "slideMarkdown"?: string,
  "runwayPrompt"?: string,
  "titleText"?: string
}

Narrative craft:
- Open with a title shot that states the payoff in one sentence.
- Alternate concept (generative) and concrete steps (slide). Avoid 5 slide-only shots in a row.
- Narration must be speakable aloud (short sentences). Japanese if source is Japanese, else English.
- One idea per shot. Prefer 5–9 shots total unless the doc is tiny.

Visual rules:
- kind=slide for ANY code, CLI, file paths, config, or precise steps. Put the exact snippet in slideMarkdown (from source; never invent code).
- kind=generative ONLY for abstract metaphor B-roll. runwayPrompt: cinematic, no readable text/UI chrome, 16:9.
- durationSec between 3 and 12. Match length to narration density.
- For slide shots with code fences, keep the fence in slideMarkdown so the renderer can show a code card.`

export async function buildShotlistWithLlm(options: {
  markdown: string
  mode: VideoRenderMode
  maxShots: number
  maxGenerativeShots: number
  openaiApiKey: string
  model?: string
  signal?: AbortSignal
}): Promise<Shotlist> {
  const model = options.model ?? 'gpt-4o-mini'
  const user = `Render mode: ${options.mode}
Max shots: ${options.maxShots}
Max generative shots: ${options.maxGenerativeShots}

Audience: engineers who will apply this in a real codebase.
Story arc: hook → why it matters → concrete steps/code → takeaway.

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
      temperature: 0.3,
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
    throw new Error(`Director LLM failed (${res.status}): ${text.slice(0, 200)}`)
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new Error('Director LLM returned empty content')

  const parsed = parseShotlistJson(content, options.mode)
  return normalizeShotlist(
    parsed,
    options.mode,
    options.maxShots,
    options.maxGenerativeShots,
  )
}

export async function buildShotlist(options: {
  markdown: string
  mode: VideoRenderMode
  maxShots: number
  maxGenerativeShots: number
  openaiApiKey?: string
  directorModel?: string
  signal?: AbortSignal
}): Promise<{ shotlist: Shotlist; usedLlm: boolean; fallbackReason?: string }> {
  if (!options.openaiApiKey) {
    const shotlist = normalizeShotlist(
      buildHeuristicShotlist(options.markdown, {
        mode: options.mode,
        maxShots: options.maxShots,
        maxGenerativeShots: options.maxGenerativeShots,
      }),
      options.mode,
      options.maxShots,
      options.maxGenerativeShots,
    )
    return {
      shotlist,
      usedLlm: false,
      fallbackReason: 'OpenAI API key が未設定のため heuristic shotlist を使用',
    }
  }

  try {
    const shotlist = await buildShotlistWithLlm({
      markdown: options.markdown,
      mode: options.mode,
      maxShots: options.maxShots,
      maxGenerativeShots: options.maxGenerativeShots,
      openaiApiKey: options.openaiApiKey,
      model: options.directorModel,
      signal: options.signal,
    })
    return { shotlist, usedLlm: true }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    const shotlist = normalizeShotlist(
      buildHeuristicShotlist(options.markdown, {
        mode: options.mode,
        maxShots: options.maxShots,
        maxGenerativeShots: options.maxGenerativeShots,
      }),
      options.mode,
      options.maxShots,
      options.maxGenerativeShots,
    )
    return {
      shotlist,
      usedLlm: false,
      fallbackReason: `Director LLM 失敗のため heuristic に降格: ${detail.slice(0, 180)}`,
    }
  }
}
