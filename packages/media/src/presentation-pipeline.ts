import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { buildDeck } from './presentation-director'
import { normalizeDeck, slugifyDeckTitle } from './deck'
import { writePptx } from './presentation-pptx'
import { writePresentationSlideSvg } from './presentation-svg'
import { resolveTheme } from './themes'
import type {
  PresentationPipelineOptions,
  PresentationPipelineResult,
  PresentationThemeId,
} from './presentation-types'

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('cancelled')
}

export async function runPresentationPipeline(
  options: PresentationPipelineOptions,
): Promise<PresentationPipelineResult> {
  const warnings: string[] = []
  const themeId: PresentationThemeId = options.themeId || 'midnight'
  const progress = options.onProgress ?? (() => {})

  progress('Building deck…')
  assertNotAborted(options.signal)

  let deck = options.deck
  let usedLlm = false
  if (!deck) {
    const built = await buildDeck({
      markdown: options.markdown,
      themeId,
      maxSlides: options.maxSlides,
      openaiApiKey: options.openaiApiKey,
      directorModel: options.directorModel,
      signal: options.signal,
    })
    deck = built.deck
    usedLlm = built.usedLlm
    if (!usedLlm) {
      warnings.push(
        options.openaiApiKey
          ? 'Director LLM failed; used heuristic deck'
          : 'No OpenAI key; used heuristic deck',
      )
    }
  } else {
    deck = normalizeDeck({ ...deck, themeId: deck.themeId || themeId }, options.maxSlides)
  }

  const slug = options.slug?.trim() || slugifyDeckTitle(deck.title)
  const outputDir = join(options.workspaceRoot, '.codex', 'presentation', slug)
  const slidesDir = join(outputDir, 'slides')
  await mkdir(slidesDir, { recursive: true })

  const deckPath = join(outputDir, 'deck.json')
  await writeFile(deckPath, JSON.stringify(deck, null, 2), 'utf-8')

  progress('Rendering SVG previews…')
  const theme = resolveTheme(deck.themeId)
  const slideSvgPaths: string[] = []
  for (const slide of deck.slides) {
    assertNotAborted(options.signal)
    const svgPath = join(slidesDir, `${slide.id}.svg`)
    await writePresentationSlideSvg(slide, theme, svgPath)
    slideSvgPaths.push(svgPath)
  }

  progress('Writing PPTX…')
  const outputPptx = join(outputDir, 'out.pptx')
  try {
    await writePptx(deck, outputPptx, { includeNotes: options.includeNotes })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      outputDir,
      deckPath,
      slideSvgPaths,
      warnings,
      message: `Failed to write PPTX: ${msg}`,
    }
  }

  return {
    success: true,
    outputDir,
    outputPptx,
    deckPath,
    slideSvgPaths,
    warnings,
    message: `Presentation ready (${deck.slides.length} slides, theme=${deck.themeId}${usedLlm ? ', LLM director' : ', heuristic'})`,
  }
}
