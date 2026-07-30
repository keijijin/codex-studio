export type ShotKind = 'title' | 'slide' | 'generative'

export interface Shot {
  id: string
  kind: ShotKind
  narration: string
  durationSec: number
  runwayPrompt?: string
  slideMarkdown?: string
  titleText?: string
}

export interface Shotlist {
  title: string
  voice: string
  shots: Shot[]
}

export type VideoRenderMode = 'hybrid' | 'slides' | 'generative'

export interface VideoPipelineOptions {
  workspaceRoot: string
  /** Absolute or workspace-relative markdown path */
  sourcePath: string
  markdown: string
  mode: VideoRenderMode
  slug?: string
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
