import { mkdir, readFile, appendFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

export function memoryFilePath(workspaceRoot: string): string {
  return join(workspaceRoot, '.codex', 'memory', 'MEMORY.md')
}

/** Load project memory for system prompt injection. */
export async function loadMemory(workspaceRoot: string): Promise<string> {
  const path = memoryFilePath(workspaceRoot)
  try {
    const raw = (await readFile(path, 'utf-8')).trim()
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
  const path = memoryFilePath(workspaceRoot)
  await mkdir(dirname(path), { recursive: true })
  const date = new Date().toISOString().slice(0, 10)
  let existing = ''
  try {
    existing = await readFile(path, 'utf-8')
  } catch {
    existing = '# Project memory\n\nNotes appended by Codex Studio (opt-in Auto Memory or MemoryAppend tool).\n'
    await writeFile(path, existing, 'utf-8')
  }
  await appendFile(path, `\n- [${date}] ${trimmed}\n`, 'utf-8')
}
