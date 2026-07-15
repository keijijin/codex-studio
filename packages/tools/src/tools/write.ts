import type { Tool, ToolContext, ToolResult } from '../types'
import { applyWrite, readTextFile } from '../utils/file-ops'

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
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const pathArg = String(args.path ?? '')
    const content = String(args.content ?? '')
    if (!pathArg) return { success: false, output: 'Error: path is required' }

    try {
      const { resolved, content: oldContent } = await readTextFile(ctx, pathArg)
      const rel = ctx.getRelativePath(resolved)
      const exists = await fileExists(resolved)
      const isNew = !exists

      if (ctx.executeMode === 'preview') {
        return {
          success: true,
          output: `Preview: ${isNew ? 'create' : 'overwrite'} ${rel} (${content.split('\n').length} lines)`,
          metadata: { path: resolved, relativePath: rel, oldContent, newContent: content, action: isNew ? 'create' : 'overwrite' },
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
  },
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const { stat } = await import('fs/promises')
    await stat(path)
    return true
  } catch {
    return false
  }
}
