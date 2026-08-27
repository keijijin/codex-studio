/**
 * NotebookLM-style intent extraction for tutorial videos.
 * Distills author goals before shot planning (steering / learning objectives).
 */

export interface VideoIntent {
  /** One-sentence learning payoff */
  learningGoal: string
  /** Who this is for */
  audience: string
  /** Ordered must-teach points (3–7) */
  mustTeach: string[]
  /** Final takeaway for the recap shot */
  takeaway: string
  /** Source language hint */
  language: 'ja' | 'en' | 'other'
}

const CODE_FENCE = /```[\s\S]*?```/g

export function detectLanguage(markdown: string): VideoIntent['language'] {
  const sample = markdown.slice(0, 4000)
  const cjk = (sample.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) || []).length
  const latin = (sample.match(/[A-Za-z]/g) || []).length
  if (cjk > latin * 0.35) return 'ja'
  if (latin > 40) return 'en'
  return 'other'
}

function plainFromMarkdown(md: string): string {
  return md
    .replace(CODE_FENCE, ' ')
    .replace(/^#+\s+/gm, '')
    .replace(/[*_`>#\[\]()!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractHeadings(markdown: string): string[] {
  return [...markdown.matchAll(/^##\s+(.+)$/gm)]
    .map((m) => m[1]!.trim())
    .filter(Boolean)
    .slice(0, 8)
}

function extractTitleLine(markdown: string): string {
  const h1 = markdown.match(/^#\s+(.+)$/m)
  if (h1?.[1]) return h1[1].trim()
  return markdown.trim().split(/\n/)[0]?.replace(/^#+\s*/, '').trim() || 'Tutorial'
}

/**
 * Heuristic intent when LLM is unavailable.
 * Prefer H2 sections as must-teach; otherwise first meaningful paragraphs.
 */
export function extractVideoIntentHeuristic(markdown: string): VideoIntent {
  const language = detectLanguage(markdown)
  const title = extractTitleLine(markdown)
  const headings = extractHeadings(markdown)
  const body = plainFromMarkdown(markdown.replace(/^#\s+.+$/m, ''))
  const sentences = body
    .split(/[。．.!?！？]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12)

  const mustTeach =
    headings.length > 0
      ? headings.slice(0, 6)
      : sentences.slice(0, 5).map((s) => s.slice(0, 60))

  const learningGoal =
    language === 'ja'
      ? `${title}の要点を理解し、すぐに使えるようにする`
      : `Understand the essentials of ${title} and apply them`

  const audience =
    language === 'ja'
      ? '実装に落とし込むエンジニア'
      : 'Engineers who will apply this in a codebase'

  const takeaway =
    mustTeach[mustTeach.length - 1] ||
    (language === 'ja' ? `${title}のポイントを押さえて次の作業に進む` : `Apply the key points of ${title}`)

  return { learningGoal, audience, mustTeach, takeaway, language }
}

/** Estimate spoken duration from narration (rough, language-aware). */
export function estimateNarrationDurationSec(narration: string, language: VideoIntent['language']): number {
  const t = narration.replace(/\s+/g, ' ').trim()
  if (!t) return 4
  if (language === 'ja') {
    // ~6–7 mora/sec for calm explainer
    const chars = [...t.replace(/\s/g, '')].length
    return Math.min(14, Math.max(3, Math.round(chars / 6.5) + 1))
  }
  const words = t.split(/\s+/).filter(Boolean).length
  // ~140 wpm explainer pace
  return Math.min(14, Math.max(3, Math.round((words / 140) * 60) + 1))
}
