import { readdir, readFile } from 'fs/promises'
import { join } from 'path'

export async function loadRules(workspaceRoot: string): Promise<string> {
  const rulesDir = join(workspaceRoot, '.codex', 'rules')
  let entries: string[]
  try {
    entries = await readdir(rulesDir)
  } catch {
    return ''
  }

  const parts: string[] = []
  for (const entry of entries.sort()) {
    if (!entry.endsWith('.md')) continue
    try {
      const content = await readFile(join(rulesDir, entry), 'utf-8')
      parts.push(`### Rule: ${entry}\n${content.trim()}`)
    } catch {
      // skip
    }
  }

  return parts.length > 0 ? `\n\n## Project Rules\n${parts.join('\n\n')}` : ''
}
