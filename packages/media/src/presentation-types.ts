export type PresentationThemeId = 'midnight' | 'paper' | 'forest' | 'coral'

export type SlideLayout =
  | 'title'
  | 'section'
  | 'bullets'
  | 'two_column'
  | 'code'
  | 'quote'
  | 'closing'

export interface DeckSlide {
  id: string
  layout: SlideLayout
  title: string
  subtitle?: string
  bullets?: string[]
  leftTitle?: string
  rightTitle?: string
  leftBullets?: string[]
  rightBullets?: string[]
  code?: string
  codeLanguage?: string
  quote?: string
  notes?: string
}

export interface Deck {
  title: string
  themeId: PresentationThemeId
  slides: DeckSlide[]
}

export interface ThemeTokens {
  id: PresentationThemeId
  label: string
  background: string
  surface: string
  text: string
  muted: string
  accent: string
  codeBg: string
  /** pptxgenjs color without # */
  pptxBackground: string
  pptxSurface: string
  pptxText: string
  pptxMuted: string
  pptxAccent: string
  pptxCodeBg: string
}

export interface PresentationPipelineOptions {
  workspaceRoot: string
  sourcePath: string
  markdown: string
  themeId?: PresentationThemeId
  slug?: string
  openaiApiKey?: string
  directorModel?: string
  maxSlides: number
  includeNotes: boolean
  /** Prefer prebuilt deck (skips director) */
  deck?: Deck
  signal?: AbortSignal
  onProgress?: (message: string) => void
}

export interface PresentationPipelineResult {
  success: boolean
  outputDir: string
  outputPptx?: string
  deckPath?: string
  slideSvgPaths: string[]
  warnings: string[]
  message: string
}
