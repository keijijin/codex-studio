export type ShotKind = 'title' | 'slide' | 'generative'

/** Pedagogical role in a NotebookLM-style explainer arc. */
export type ShotRole = 'hook' | 'why' | 'concept' | 'step' | 'example' | 'recap'

export type SlideVisual =
  | 'title'
  | 'keyphrase'
  | 'bullets'
  | 'steps'
  | 'code'
  | 'quote'

export interface Shot {
  id: string
  kind: ShotKind
  narration: string
  durationSec: number
  runwayPrompt?: string
  slideMarkdown?: string
  titleText?: string
  /** Learning role in the story arc */
  role?: ShotRole
  /** Large on-screen keyword / phrase (NotebookLM-style visual anchor) */
  onScreenKey?: string
  /** Preferred slide layout hint */
  visual?: SlideVisual
}

export interface VideoIntentSummary {
  learningGoal: string
  audience: string
  mustTeach: string[]
  takeaway: string
  language?: 'ja' | 'en' | 'other'
}

export interface Shotlist {
  title: string
  voice: string
  shots: Shot[]
  /** Author-intent steering (filled by Director / heuristic) */
  intent?: VideoIntentSummary
}

export type VideoRenderMode = 'hybrid' | 'slides' | 'generative'

export interface VideoPipelineOptions {
  workspaceRoot: string
  /** Absolute or workspace-relative markdown path */
  sourcePath: string
  markdown: string
  mode: VideoRenderMode
  slug?: string
  /** Relative to workspace root (default: videos) */
  outputDir?: string
  runwayApiKey?: string
  runwayModel: string
  openaiApiKey?: string
  ttsProvider: 'openai' | 'none'
  ttsVoice: string
  maxShots: number
  maxGenerativeShots: number
  /** Prefer prebuilt shotlist (skips director) */
  shotlist?: Shotlist
  signal?: AbortSignal
  onProgress?: (message: string) => void
}

export interface VideoPipelineResult {
  success: boolean
  outputDir: string
  outputMp4?: string
  shotlistPath?: string
  warnings: string[]
  message: string
}

export interface VideoProviderClipResult {
  localPath: string
  remoteUrl?: string
  jobId: string
}
