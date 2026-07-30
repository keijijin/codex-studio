import { readFile, writeFile } from 'fs/promises'

export type SvgRenderOptions = { width?: number; height?: number }

/**
 * Rasterize SVG → PNG via resvg.
 * Uses a dynamic import so Electron main does not load the native binding at startup.
 */
export async function renderSvgToPng(
  svgPath: string,
  pngPath: string,
  options?: SvgRenderOptions,
): Promise<void> {
  const width = options?.width ?? 1280
  const height = options?.height ?? 720
  // Dynamic import: static import of @resvg/resvg-js breaks Electron (native binding).
  const { Resvg } = await import('@resvg/resvg-js')
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
  void height
}
