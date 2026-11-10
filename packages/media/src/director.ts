import {
  buildHeuristicShotlist,
  normalizeShotlist,
  parseShotlistJson,
} from './shotlist'
import { extractVideoIntentHeuristic } from './intent'
import type { Shotlist, VideoRenderMode } from './types'

/**
 * NotebookLM Video Overview–inspired director.
 * Grounded in source → learning goal / audience → pedagogic arc → speakable host narration.
 */
const DIRECTOR_SYSTEM = `You are the director of a NotebookLM-style Video Overview (narrated educational slideshow with optional abstract B-roll).
Your job: distill the AUTHOR'S INTENT from the markdown, then produce a short, teachable video shotlist.
Viewers should understand the point without reading the original doc.

Output ONLY valid JSON (no markdown fences).
Schema:
{
  "title": string,
  "voice": "alloy",
  "intent": {
    "learningGoal": string,   // one sentence payoff
    "audience": string,
    "mustTeach": string[],    // 3–6 ordered points from the source
    "takeaway": string,
    "language": "ja"|"en"|"other"
  },
  "shots": Shot[]
}
Shot: {
  "id": "01",
  "kind": "title"|"slide"|"generative",
  "role": "hook"|"why"|"concept"|"step"|"example"|"recap",
  "narration": string,          // SPOKEN host script — teach, do not read headings aloud
  "durationSec": number,        // 3–14; match spoken length
  "onScreenKey"?: string,       // ≤6 words / ≤12 JP chars — the visual anchor
  "visual"?: "title"|"keyphrase"|"bullets"|"steps"|"code"|"quote",
  "slideMarkdown"?: string,     // sparse on-screen text; never invent code/facts
  "runwayPrompt"?: string,      // generative only: cinematic, NO readable text/UI
  "titleText"?: string
}

Pedagogy (match NotebookLM Explainer):
1) Extract intent FIRST — what should the viewer be able to DO after watching?
2) Arc: hook → why → concept/steps/examples → recap. Prefer 6–9 shots.
3) One idea per shot. onScreenKey is the billboard; narration explains it in a warm host voice.
4) Narration ≠ dump of slideMarkdown. Short spoken sentences. JP source → JP narration (else English).
5) Grounding: code, paths, commands, numbers must come from the markdown. If unsure, omit.
6) visual=keyphrase for concepts; steps for procedures; code when a fence is needed; quote for a pivotal sentence from the source.
7) kind=generative ONLY for abstract metaphor B-roll (role=concept|why). Never for code.
8) End with role=recap that restates mustTeach / takeaway — do not introduce new facts.`

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
  const seed = extractVideoIntentHeuristic(options.markdown)
  const user = `Render mode: ${options.mode}
Max shots: ${options.maxShots}
Max generative shots: ${options.maxGenerativeShots}

Steering seed (refine from the markdown; do not ignore the source):
- Suggested learningGoal: ${seed.learningGoal}
- Suggested audience: ${seed.audience}
- Suggested mustTeach: ${JSON.stringify(seed.mustTeach)}
- Language hint: ${seed.language}

Format: Explainer (structured walkthrough). Prioritize clarity of author intent over covering every section.
If the doc is a how-to, emphasize steps with visual=steps|code.
If the doc is conceptual, emphasize why + concept with visual=keyphrase and at most ${options.maxGenerativeShots} generative shots.

--- MARKDOWN (source of truth) ---
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
