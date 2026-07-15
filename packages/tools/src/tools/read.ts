import { readFile } from 'fs/promises'
import type { Tool, ToolContext, ToolResult } from '../types'

const MAX_LINES = 2000
const MAX_BYTES = 100 * 1024

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf',
  '.zip', '.gz', '.tar', '.wasm', '.node', '.exe', '.dll',
])

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
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const pathArg = String(args.path ?? '')
    if (!pathArg) {
      return { success: false, output: 'Error: path is required' }
    }

    try {
      const resolved = ctx.resolvePath(pathArg)
      const ext = resolved.slice(resolved.lastIndexOf('.')).toLowerCase()
      if (BINARY_EXTENSIONS.has(ext)) {
        return { success: false, output: `Error: cannot read binary file (${ext})` }
      }

      const content = await readFile(resolved, 'utf-8')
      if (Buffer.byteLength(content, 'utf-8') > MAX_BYTES) {
        return { success: false, output: `Error: file exceeds ${MAX_BYTES} bytes limit` }
      }

      const lines = content.split('\n')
      const offset = Math.max(1, Number(args.offset) || 1)
      const limit = Math.min(MAX_LINES, Number(args.limit) || MAX_LINES)
      const slice = lines.slice(offset - 1, offset - 1 + limit)

      const rel = ctx.getRelativePath(resolved)
      const numbered = slice
        .map((line, i) => `${String(offset + i).padStart(6, ' ')}|${line}`)
        .join('\n')

      const header = `File: ${rel} (${lines.length} lines total)\n---\n`
      return {
        success: true,
        output: header + numbered,
        metadata: { path: resolved, relativePath: rel, totalLines: lines.length },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Read failed'
      return { success: false, output: `Error: ${message}` }
    }
  },
}
