import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { buildDeck } from './presentation-director'
import { normalizeDeck, slugifyDeckTitle } from './deck'
import { isMermaidLanguage, renderMermaidToPng } from './mermaid-render'
import {
  DEFAULT_PRESENTATION_OUTPUT_DIR,
  resolveMediaOutput,
  resolveOutputSlug,
} from './output-paths'
import { writePptx } from './presentation-pptx'
import { writePresentationSlideSvg } from './presentation-svg'
import { resolveTheme } from './themes'
import type {
  Deck,
  DeckSlide,
  PresentationPipelineOptions,
  PresentationPipelineResult,
  PresentationThemeId,
} from './presentation-types'

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('cancelled')
}

async function materializeDiagrams(
  deck: Deck,
  diagramsDir: string,
  warnings: string[],
  signal?: AbortSignal,
): Promise<Deck> {
  await mkdir(diagramsDir, { recursive: true })
  const slides: DeckSlide[] = []
  for (const slide of deck.slides) {
    assertNotAborted(signal)
    const mermaidSource =
      slide.layout === 'diagram' || isMermaidLanguage(slide.codeLanguage)
        ? slide.code
        : undefined
    if (!mermaidSource?.trim()) {
      slides.push(slide)
      continue
    }
    const pngPath = join(diagramsDir, `${slide.id}-diagram.png`)
    try {
      const { method } = await renderMermaidToPng(mermaidSource, pngPath, { signal })
      if (method === 'fallback') {
        warnings.push(
          `Slide ${slide.id}: Mermaid local render failed; used fallback image. Install @mermaid-js/mermaid-cli for best quality.`,
        )
      } else if (method === 'mermaid.ink') {
        warnings.push(`Slide ${slide.id}: Mermaid rendered via mermaid.ink (network).`)
      }
      slides.push({
        ...slide,
        layout: 'diagram',
        code: mermaidSource,
        codeLanguage: 'mermaid',
        imagePath: pngPath,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      warnings.push(`Slide ${slide.id}: Mermaid render failed (${msg}); showing source as code.`)
      slides.push({
        ...slide,
        layout: 'code',
        code: mermaidSource,
        codeLanguage: 'mermaid',
      })
    }
  }
  return { ...deck, slides }
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
    if (!usedLlm && built.fallbackReason) {
      warnings.push(built.fallbackReason)
    }
  } else {
    deck = normalizeDeck({ ...deck, themeId: deck.themeId || themeId }, options.maxSlides)
  }

  const slug = resolveOutputSlug({
    slug: options.slug?.trim() || slugifyDeckTitle(deck.title),
    title: deck.title,
    sourcePath: options.sourcePath,
    fallbackPrefix: 'deck',
  })
  const { workDir: outputDir, artifactPath: outputPptx } = resolveMediaOutput({
    workspaceRoot: options.workspaceRoot,
    outputDirRel: options.outputDir || DEFAULT_PRESENTATION_OUTPUT_DIR,
    slug,
    artifactFileName: `${slug}.pptx`,
  })
  const slidesDir = join(outputDir, 'slides')
  const diagramsDir = join(outputDir, 'diagrams')
  await mkdir(slidesDir, { recursive: true })

  progress('Rendering Mermaid diagrams…')
  deck = await materializeDiagrams(deck, diagramsDir, warnings, options.signal)

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
    message: `Presentation ready (${deck.slides.length} slides, theme=${deck.themeId}${usedLlm ? ', LLM director' : ', heuristic'}) → ${outputPptx}`,
  }
}
