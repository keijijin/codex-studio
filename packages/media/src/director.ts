import {
  buildHeuristicShotlist,
  normalizeShotlist,
  parseShotlistJson,
} from './shotlist'
import type { Shotlist, VideoRenderMode } from './types'

const DIRECTOR_SYSTEM = `You are a tutorial video director. Given markdown documentation, produce a JSON shotlist for a short educational video.

Rules:
- Output ONLY valid JSON (no markdown fences).
- Schema: { "title": string, "voice": "alloy", "shots": Shot[] }
- Shot: { "id": "01", "kind": "title"|"slide"|"generative", "narration": string, "durationSec": number, "slideMarkdown"?: string, "runwayPrompt"?: string, "titleText"?: string }
- Use "slide" for any code, commands, file paths, or precise steps (never generative for code).
- Use "generative" only for conceptual/metaphor B-roll (abstract visuals, no readable text in prompt).
- Keep total shots small (about 4–10). Narration should be speakable Japanese if the source is Japanese, else English.
- durationSec between 3 and 12.`

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
}): Promise<{ shotlist: Shotlist; usedLlm: boolean }> {
  if (options.openaiApiKey) {
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
    } catch {
      // fall through to heuristic
    }
  }

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
  return { shotlist, usedLlm: false }
}
