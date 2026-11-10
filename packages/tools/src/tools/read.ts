import type { Tool, ToolContext, ToolResult } from '../types'
import { secretReadDecision } from '../utils/secret-paths'

const MAX_LINES = 2000
const MAX_BYTES = 100 * 1024

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf',
  '.zip', '.gz', '.tar', '.wasm', '.node', '.exe', '.dll',
])

async function runRead(
  ctx: ToolContext,
  args: Record<string, unknown>,
  mode: 'preview' | 'apply',
): Promise<ToolResult> {
  const pathArg = String(args.path ?? '')
  if (!pathArg) {
    return { success: false, output: 'Error: path is required' }
  }

  try {
    const resolved = ctx.fs.resolve(pathArg)
    const rel = ctx.getRelativePath(resolved)
    const decision = secretReadDecision(rel, ctx.secretReadPolicy ?? 'ask')

    if (decision === 'deny') {
      return {
        success: false,
        output: `Error: reading secret path is denied by policy: ${rel}`,
      }
    }

    if (mode === 'preview') {
      // Do not load secret file contents into the approval UI.
      return {
        success: true,
        output:
          decision === 'ask'
            ? `Preview: read secret path ${rel} (contents hidden until approved)`
            : `Preview: read ${rel}`,
        metadata: {
          path: resolved,
          relativePath: rel,
          oldContent: '',
          newContent: decision === 'ask' ? '(secret — approve to read)' : '',
          action: 'read',
          secret: decision === 'ask',
        },
      }
    }

    const ext = resolved.slice(resolved.lastIndexOf('.')).toLowerCase()
    if (BINARY_EXTENSIONS.has(ext)) {
      return { success: false, output: `Error: cannot read binary file (${ext})` }
    }

    const content = await ctx.fs.readText(pathArg)
    if (Buffer.byteLength(content, 'utf-8') > MAX_BYTES) {
      return { success: false, output: `Error: file exceeds ${MAX_BYTES} bytes limit` }
    }

    const lines = content.split('\n')
    const offset = Math.max(1, Number(args.offset) || 1)
    const limit = Math.min(MAX_LINES, Number(args.limit) || MAX_LINES)
    const slice = lines.slice(offset - 1, offset - 1 + limit)

    const numbered = slice
      .map((line, i) => `${String(offset + i).padStart(6, ' ')}|${line}`)
      .join('\n')

    return {
      success: true,
      output: numbered || '(empty file)',
      metadata: { path: resolved, relativePath: rel },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Read failed'
    return { success: false, output: `Error: ${message}` }
  }
}

export const readTool: Tool = {
  name: 'Read',
  description: 'Read file contents from the workspace with optional line range',
  requiresApproval: false,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Absolute or workspace-relative file path' },
      offset: { type: 'integer', description: 'Start line (1-indexed)' },
      limit: { type: 'integer', description: 'Maximum number of lines to read' },
    },
    required: ['path'],
  },
  preview: (ctx, args) => runRead(ctx, args, 'preview'),
  apply: (ctx, args) => runRead(ctx, args, 'apply'),
  execute: (ctx, args) => runRead(ctx, args, ctx.executeMode === 'preview' ? 'preview' : 'apply'),
}
