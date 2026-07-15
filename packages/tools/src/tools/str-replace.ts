import type { Tool, ToolContext, ToolResult } from '../types'
import { applyWrite, readTextFile } from '../utils/file-ops'

export const strReplaceTool: Tool = {
  name: 'StrReplace',
  description: 'Replace text in a file. old_string must match exactly once unless replace_all is true',
  requiresApproval: true,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' },
      old_string: { type: 'string', description: 'Text to find' },
      new_string: { type: 'string', description: 'Replacement text' },
      replace_all: { type: 'boolean', description: 'Replace all occurrences' },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const pathArg = String(args.path ?? '')
    const oldString = String(args.old_string ?? '')
    const newString = String(args.new_string ?? '')
    const replaceAll = Boolean(args.replace_all)

    if (!pathArg || !oldString) {
      return { success: false, output: 'Error: path and old_string are required' }
    }

    try {
      const { resolved, content: oldContent } = await readTextFile(ctx, pathArg)
      if (!oldContent.includes(oldString)) {
        return { success: false, output: `Error: old_string not found in ${ctx.getRelativePath(resolved)}` }
      }

      const count = oldContent.split(oldString).length - 1
      if (!replaceAll && count > 1) {
        return {
          success: false,
          output: `Error: old_string matches ${count} times. Use replace_all or provide a unique string.`,
        }
      }

      const newContent = replaceAll
        ? oldContent.split(oldString).join(newString)
        : oldContent.replace(oldString, newString)
      const rel = ctx.getRelativePath(resolved)

      if (ctx.executeMode === 'preview') {
        return {
          success: true,
          output: `Preview: replace in ${rel} (${replaceAll ? count : 1} occurrence(s))`,
          metadata: { path: resolved, relativePath: rel, oldContent, newContent, action: 'replace' },
        }
      }

      await applyWrite(ctx, resolved, oldContent, newContent)
      return {
        success: true,
        output: `Replaced in ${rel}`,
        metadata: { path: resolved, relativePath: rel },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'StrReplace failed'
      return { success: false, output: `Error: ${message}` }
    }
  },
}
