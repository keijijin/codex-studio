import type { Tool, ToolContext, ToolResult } from '../types'
import { applyDelete, readTextFile } from '../utils/file-ops'

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
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const pathArg = String(args.path ?? '')
    if (!pathArg) return { success: false, output: 'Error: path is required' }

    try {
      const { resolved, content: oldContent } = await readTextFile(ctx, pathArg)
      const rel = ctx.getRelativePath(resolved)

      if (oldContent === '' && !(await exists(resolved))) {
        return { success: false, output: `Error: file not found: ${rel}` }
      }

      if (ctx.executeMode === 'preview') {
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
  },
}

async function exists(path: string): Promise<boolean> {
  try {
    const { stat } = await import('fs/promises')
    await stat(path)
    return true
  } catch {
    return false
  }
}
