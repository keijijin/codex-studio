import type { Tool, ToolContext, ToolResult } from '../types'
import { applyWrite, readTextFile } from '../utils/file-ops'

async function runWrite(
  ctx: ToolContext,
  args: Record<string, unknown>,
  mode: 'preview' | 'apply',
): Promise<ToolResult> {
  const pathArg = String(args.path ?? '')
  const content = String(args.content ?? '')
  if (!pathArg) return { success: false, output: 'Error: path is required' }

  try {
    const { resolved, content: oldContent } = await readTextFile(ctx, pathArg)
    const rel = ctx.getRelativePath(resolved)
    let exists = true
    try {
      await ctx.fs.readText(pathArg)
    } catch {
      exists = false
    }
    const isNew = !exists && oldContent === ''

    if (mode === 'preview') {
      return {
        success: true,
        output: `Preview: ${isNew ? 'create' : 'overwrite'} ${rel} (${content.split('\n').length} lines)`,
        metadata: {
          path: resolved,
          relativePath: rel,
          oldContent,
          newContent: content,
          action: isNew ? 'create' : 'overwrite',
        },
      }
    }

    await applyWrite(ctx, resolved, oldContent, content)
    return {
      success: true,
      output: `Wrote ${rel} (${content.split('\n').length} lines)`,
      metadata: { path: resolved, relativePath: rel },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Write failed'
    return { success: false, output: `Error: ${message}` }
  }
}

export const writeTool: Tool = {
  name: 'Write',
  description: 'Create or overwrite a file in the workspace with the given content',
  requiresApproval: true,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute or workspace-relative file path' },
      content: { type: 'string', description: 'Full file content to write' },
    },
    required: ['path', 'content'],
  },
  preview: (ctx, args) => runWrite(ctx, args, 'preview'),
  apply: (ctx, args) => runWrite(ctx, args, 'apply'),
  execute: (ctx, args) => runWrite(ctx, args, ctx.executeMode),
}
