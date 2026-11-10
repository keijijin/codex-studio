import { join } from 'path'
import { createWorkspaceFs } from '@codex/tools'

export function memoryFilePath(workspaceRoot: string): string {
  return join(workspaceRoot, '.codex', 'memory', 'MEMORY.md')
}

const MEMORY_REL = '.codex/memory/MEMORY.md'

/** Load project memory for system prompt injection. */
export async function loadMemory(workspaceRoot: string): Promise<string> {
  const fs = createWorkspaceFs(workspaceRoot)
  try {
    const raw = (await fs.readText(MEMORY_REL)).trim()
    if (!raw) return ''
    return `\n\n## Project memory\nDurable notes from previous sessions (from \`.codex/memory/MEMORY.md\`):\n\n${raw}`
  } catch {
    return ''
  }
}

/** Append a dated bullet (used by auto-memory and tools). */
export async function appendMemoryNote(workspaceRoot: string, note: string): Promise<void> {
  const trimmed = note.replace(/\s+/g, ' ').trim()
  if (!trimmed) return
  const fs = createWorkspaceFs(workspaceRoot)
  const date = new Date().toISOString().slice(0, 10)
  let existing = ''
  try {
    existing = await fs.readText(MEMORY_REL)
  } catch {
    existing =
      '# Project memory\n\nNotes appended by Codex Studio (opt-in Auto Memory or MemoryAppend tool).\n'
    await fs.writeText(MEMORY_REL, existing)
  }
  await fs.appendText(MEMORY_REL, `\n- [${date}] ${trimmed}\n`)
}
