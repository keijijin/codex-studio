import { readFile, writeFile } from 'fs/promises'
import { Resvg } from '@resvg/resvg-js'

/**
 * Rasterize SVG → PNG via resvg (does not depend on ffmpeg SVG support).
 */
export async function renderSvgToPng(
  svgPath: string,
  pngPath: string,
  options?: { width?: number; height?: number },
): Promise<void> {
  const width = options?.width ?? 1280
  const height = options?.height ?? 720
  const svg = await readFile(svgPath, 'utf-8')
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'sans-serif',
    },
  })
  const pngData = resvg.render()
  const buffer = pngData.asPng()
  await writeFile(pngPath, buffer)

  // If height drifted (rare), still accept — video pipeline scales/pads via ffmpeg.
  void height
}
