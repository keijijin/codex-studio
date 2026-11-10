import type { Tool, ToolContext, ToolResult } from '../types'
import { applyDelete } from '../utils/file-ops'

async function runDelete(
  ctx: ToolContext,
  args: Record<string, unknown>,
  mode: 'preview' | 'apply',
): Promise<ToolResult> {
  const pathArg = String(args.path ?? '')
  if (!pathArg) return { success: false, output: 'Error: path is required' }

  try {
    const resolved = ctx.fs.resolveUnlink(pathArg)
    const meta = ctx.fs.lstat(pathArg)
    if (!meta) {
      return { success: false, output: `Error: file not found: ${ctx.getRelativePath(resolved)}` }
    }

    let oldContent = ''
    if (!meta.isSymbolicLink) {
      try {
        oldContent = await ctx.fs.readText(pathArg)
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      }
    }

    const rel = ctx.getRelativePath(resolved)

    if (mode === 'preview') {
      return {
        success: true,
        output: `Preview: delete ${rel}`,
        metadata: { path: resolved, relativePath: rel, oldContent, newContent: '', action: 'delete' },
      }
    }

    await applyDelete(ctx, resolved, oldContent)
    return { success: true, output: `Deleted ${rel}`, metadata: { path: resolved, relativePath: rel } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed'
    return { success: false, output: `Error: ${message}` }
  }
}

export const deleteTool: Tool = {
  name: 'Delete',
  description: 'Delete a file from the workspace',
  requiresApproval: true,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to delete' },
    },
    required: ['path'],
  },
  preview: (ctx, args) => runDelete(ctx, args, 'preview'),
  apply: (ctx, args) => runDelete(ctx, args, 'apply'),
  execute: (ctx, args) => runDelete(ctx, args, ctx.executeMode),
}
