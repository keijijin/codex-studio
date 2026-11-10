import { join } from 'path'
import type { Tool, ToolContext, ToolResult } from '../types'

export const MEMORY_RELATIVE_PATH = '.codex/memory/MEMORY.md'

/** Logical memory path (does not validate symlinks — use fs at write time). */
export function memoryFilePath(workspaceRoot: string): string {
  return join(workspaceRoot, MEMORY_RELATIVE_PATH)
}

async function runMemoryAppend(
  ctx: ToolContext,
  args: Record<string, unknown>,
  mode: 'preview' | 'apply',
): Promise<ToolResult> {
  const note = String(args.note ?? '').trim()
  if (!note) return { success: false, output: 'Error: note is required' }

  let path: string
  try {
    path = ctx.fs.resolve(MEMORY_RELATIVE_PATH)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid memory path'
    return { success: false, output: `Error: ${message}` }
  }
  const relativePath = ctx.getRelativePath(path)
  const date = new Date().toISOString().slice(0, 10)
  const entry = `\n- [${date}] ${note.replace(/\s+/g, ' ').trim()}\n`

  if (mode === 'preview') {
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
    await ctx.fs.appendText(MEMORY_RELATIVE_PATH, entry)
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
  preview: (ctx, args) => runMemoryAppend(ctx, args, 'preview'),
  apply: (ctx, args) => runMemoryAppend(ctx, args, 'apply'),
  execute: (ctx, args) => runMemoryAppend(ctx, args, ctx.executeMode),
}
