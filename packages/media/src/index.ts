export type {
  Shot,
  ShotKind,
  ShotRole,
  Shotlist,
  SlideVisual,
  VideoIntentSummary,
  VideoPipelineOptions,
  VideoPipelineResult,
  VideoRenderMode,
  VideoProviderClipResult,
} from './types'
export type {
  Deck,
  DeckSlide,
  PresentationPipelineOptions,
  PresentationPipelineResult,
  PresentationThemeId,
  SlideLayout,
  ThemeTokens,
} from './presentation-types'
export {
  buildHeuristicShotlist,
  extractTitle,
  normalizeShotlist,
  parseShotlistJson,
  slugifyTitle,
} from './shotlist'
export {
  detectLanguage,
  estimateNarrationDurationSec,
  extractVideoIntentHeuristic,
} from './intent'
export {
  buildHeuristicDeck,
  normalizeDeck,
  parseDeckJson,
  slugifyDeckTitle,
} from './deck'
export { PRESENTATION_THEMES, resolveTheme } from './themes'
export { buildShotlist, buildShotlistWithLlm } from './director'
export { buildDeck, buildDeckWithLlm } from './presentation-director'
export { runVideoPipeline } from './pipeline'
export { runPresentationPipeline } from './presentation-pipeline'
export { writePresentationSlideSvg } from './presentation-svg'
export { writeSlideSvg } from './slides'
export { findFfmpeg, svgToPng, videoWorkDir } from './ffmpeg'
export {
  DEFAULT_PRESENTATION_OUTPUT_DIR,
  DEFAULT_VIDEO_OUTPUT_DIR,
  resolveMediaOutput,
  resolveOutputSlug,
} from './output-paths'
export { isMermaidLanguage, renderMermaidToPng } from './mermaid-render'
/** Lazy re-export — do not statically pull @resvg/resvg-js into Electron main. */
export async function renderSvgToPng(
  ...args: Parameters<typeof import('./svg-render').renderSvgToPng>
): ReturnType<typeof import('./svg-render').renderSvgToPng> {
  const { renderSvgToPng: impl } = await import('./svg-render')
  return impl(...args)
}
export { wrapText, clampLine } from './text'
export { generateRunwayClip } from './runway'
