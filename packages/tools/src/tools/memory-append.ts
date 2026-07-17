import type { Tool, ToolResult } from '../types'
import { appendFile, mkdir } from 'fs/promises'
import { dirname, join } from 'path'

export function memoryFilePath(workspaceRoot: string): string {
  return join(workspaceRoot, '.codex', 'memory', 'MEMORY.md')
}

/** Append a durable note to project memory (opt-in usage by the agent). */
export const memoryAppendTool: Tool = {
  name: 'MemoryAppend',
  description:
    'Append a short durable note to .codex/memory/MEMORY.md (project conventions, decisions, gotchas). Keep entries concise (1–3 sentences).',
  requiresApproval: true,
  parameters: {
    type: 'object',
    properties: {
      note: {
        type: 'string',
        description: 'Note to append (plain text or markdown bullet)',
      },
    },
    required: ['note'],
  },
  async execute(ctx, args): Promise<ToolResult> {
    const note = String(args.note ?? '').trim()
    if (!note) return { success: false, output: 'Error: note is required' }

    const path = memoryFilePath(ctx.workspaceRoot)
    const relativePath = ctx.getRelativePath(path)
    const date = new Date().toISOString().slice(0, 10)
    const entry = `\n- [${date}] ${note.replace(/\s+/g, ' ').trim()}\n`

    if (ctx.executeMode === 'preview') {
      return {
        success: true,
        output: `Would append to ${relativePath}:\n${entry.trim()}`,
        metadata: {
          path,
          relativePath,
          oldContent: '',
          newContent: entry,
          action: 'write',
        },
      }
    }

    try {
      await mkdir(dirname(path), { recursive: true })
      await appendFile(path, entry, 'utf-8')
      ctx.onFileChanged?.(path)
      return {
        success: true,
        output: `Appended memory note to ${relativePath}`,
        metadata: { path, relativePath, action: 'write' },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Memory append failed'
      return { success: false, output: `Error: ${message}` }
    }
  },
}
