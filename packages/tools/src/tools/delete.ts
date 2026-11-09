import { lstatSync } from 'fs'
import { readFile } from 'fs/promises'
import type { Tool, ToolContext, ToolResult } from '../types'
import { resolveUnlinkWithinWorkspace } from '../resolve-path'
import { applyDelete } from '../utils/file-ops'

function resolveDeleteTarget(ctx: ToolContext, pathArg: string): string {
  try {
    // Prefer unlink semantics on the primary root (keeps workspace symlinks as links).
    return resolveUnlinkWithinWorkspace(ctx.workspaceRoot, pathArg)
  } catch {
    // Secondary workspace roots are only reachable via ctx.resolvePath.
    return ctx.resolvePath(pathArg)
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
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const pathArg = String(args.path ?? '')
    if (!pathArg) return { success: false, output: 'Error: path is required' }

    try {
      const resolved = resolveDeleteTarget(ctx, pathArg)
      let oldContent = ''
      let isLink = false
      try {
        const st = lstatSync(resolved)
        isLink = st.isSymbolicLink()
        if (!isLink) {
          oldContent = await readFile(resolved, 'utf-8')
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      }

      const rel = ctx.getRelativePath(resolved)

      if (!isLink && oldContent === '' && !(await exists(resolved))) {
        return { success: false, output: `Error: file not found: ${rel}` }
      }
      if (isLink && !(await linkExists(resolved))) {
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

async function linkExists(path: string): Promise<boolean> {
  try {
    const { lstat } = await import('fs/promises')
    await lstat(path)
    return true
  } catch {
    return false
  }
}
