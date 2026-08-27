import { readFile } from 'fs/promises'
import { runVideoPipeline, type VideoRenderMode } from '@codex/media'
import type { Tool, ToolContext, ToolResult } from '../types'

export const generateVideoTool: Tool = {
  name: 'GenerateVideo',
  description:
    'Generate a NotebookLM-style explainer MP4 from markdown (intent → Director shotlist → TTS/sparse slides → optional Runway B-roll → FFmpeg). Output under videos/<slug>/<slug>.mp4. Requires ffmpeg. OpenAI key recommended for Director/TTS; Runway optional (slides fallback).',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Workspace-relative or absolute path to a Markdown source file',
      },
      mode: {
        type: 'string',
        description: 'hybrid (default) | slides | generative',
      },
      slug: {
        type: 'string',
        description: 'Optional output folder / file basename under videos/',
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

    const config = ctx.getVideoConfig?.()
    if (config && config.video.enabled === false) {
      return {
        success: false,
        output: 'Error: video generation is disabled in settings (video.enabled=false)',
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

    const modeRaw = typeof args.mode === 'string' ? args.mode : config?.video.mode
    const mode: VideoRenderMode =
      modeRaw === 'slides' || modeRaw === 'generative' || modeRaw === 'hybrid'
        ? modeRaw
        : 'hybrid'

    const video = config?.video
    const runwayKey =
      config?.runwayApiKey ||
      process.env.RUNWAYML_API_SECRET ||
      process.env.RUNWAY_API_KEY ||
      video?.runwayApiKey
    const openaiKey =
      config?.openaiApiKey || process.env.OPENAI_API_KEY || undefined

    const result = await runVideoPipeline({
      workspaceRoot: ctx.workspaceRoot,
      sourcePath: absolute,
      markdown,
      mode,
      slug: typeof args.slug === 'string' ? args.slug : undefined,
      outputDir: video?.outputDir,
      runwayApiKey: runwayKey,
      runwayModel: video?.runwayModel || 'gen4.5',
      openaiApiKey: openaiKey,
      ttsProvider: video?.ttsProvider === 'none' ? 'none' : openaiKey ? 'openai' : 'none',
      ttsVoice: video?.ttsVoice || 'alloy',
      maxShots: video?.maxShots ?? 12,
      maxGenerativeShots: video?.maxGenerativeShots ?? 4,
      signal: ctx.signal,
    })

    const relativeOut = result.outputMp4
      ? ctx.getRelativePath(result.outputMp4)
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
        relativeOut ? `MP4: ${relativeOut}` : null,
        result.shotlistPath ? `Shotlist: ${ctx.getRelativePath(result.shotlistPath)}` : null,
        result.warnings.length ? `Warnings:\n- ${result.warnings.join('\n- ')}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      metadata: {
        path: result.outputMp4,
        relativePath: relativeOut,
        outputDir: result.outputDir,
        warnings: result.warnings,
      },
    }
  },
}
