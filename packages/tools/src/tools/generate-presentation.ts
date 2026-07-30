import { readFile } from 'fs/promises'
import {
  runPresentationPipeline,
  type PresentationThemeId,
} from '@codex/media'
import type { Tool, ToolContext, ToolResult } from '../types'

const THEMES = new Set(['midnight', 'paper', 'forest', 'coral'])

export const generatePresentationTool: Tool = {
  name: 'GeneratePresentation',
  description:
    'Generate a polished PPTX deck from a markdown file (Director deck → theme → PPTX + SVG previews). Output under .codex/presentation/<slug>/out.pptx. OpenAI key optional (heuristic fallback).',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Workspace-relative or absolute path to a Markdown source file',
      },
      themeId: {
        type: 'string',
        description: 'midnight | paper | forest | coral',
      },
      slug: {
        type: 'string',
        description: 'Optional output folder name under .codex/presentation/',
      },
    },
    required: ['path'],
  },
  requiresApproval: true,
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const pathArg = typeof args.path === 'string' ? args.path.trim() : ''
    if (!pathArg) {
      return { success: false, output: 'Error: path is required' }
    }

    const config = ctx.getPresentationConfig?.()
    if (config && config.presentation.enabled === false) {
      return {
        success: false,
        output: 'Error: presentation generation is disabled in settings (presentation.enabled=false)',
      }
    }

    const absolute = ctx.resolvePath(pathArg)
    let markdown: string
    try {
      markdown = await readFile(absolute, 'utf-8')
    } catch (err) {
      return {
        success: false,
        output: `Error: cannot read ${pathArg} (${err instanceof Error ? err.message : String(err)})`,
      }
    }

    if (!markdown.trim()) {
      return { success: false, output: 'Error: markdown file is empty' }
    }

    const themeRaw =
      typeof args.themeId === 'string' ? args.themeId : config?.presentation.themeId
    const themeId: PresentationThemeId = THEMES.has(String(themeRaw))
      ? (themeRaw as PresentationThemeId)
      : 'midnight'

    const presentation = config?.presentation
    const openaiKey =
      config?.openaiApiKey || process.env.OPENAI_API_KEY || undefined

    const result = await runPresentationPipeline({
      workspaceRoot: ctx.workspaceRoot,
      sourcePath: absolute,
      markdown,
      themeId,
      slug: typeof args.slug === 'string' ? args.slug : undefined,
      openaiApiKey: openaiKey,
      maxSlides: presentation?.maxSlides ?? 16,
      includeNotes: presentation?.includeNotes !== false,
      signal: ctx.signal,
    })

    const relativeOut = result.outputPptx
      ? ctx.getRelativePath(result.outputPptx)
      : undefined

    if (!result.success) {
      return {
        success: false,
        output: `${result.message}${
          result.warnings.length ? `\nWarnings:\n- ${result.warnings.join('\n- ')}` : ''
        }`,
        metadata: {
          path: result.outputDir || undefined,
          relativePath: result.outputDir ? ctx.getRelativePath(result.outputDir) : undefined,
        },
      }
    }

    return {
      success: true,
      output: [
        result.message,
        relativeOut ? `PPTX: ${relativeOut}` : null,
        result.deckPath ? `Deck: ${ctx.getRelativePath(result.deckPath)}` : null,
        result.slideSvgPaths.length
          ? `SVG previews: ${result.slideSvgPaths.length} files under slides/`
          : null,
        result.warnings.length ? `Warnings:\n- ${result.warnings.join('\n- ')}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      metadata: {
        path: result.outputPptx,
        relativePath: relativeOut,
        outputDir: result.outputDir,
        warnings: result.warnings,
      },
    }
  },
}
