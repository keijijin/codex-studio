import { readFile } from 'fs/promises'
import { join } from 'path'

/** Project-level persistent context files (Claude Code / AGENTS.md compatible). */
export const PROJECT_CONTEXT_FILES = ['CODEX.md', 'CLAUDE.md', 'AGENTS.md'] as const

export async function loadProjectContext(workspaceRoot: string): Promise<string> {
  const sections: string[] = []

  for (const name of PROJECT_CONTEXT_FILES) {
    const path = join(workspaceRoot, name)
    try {
      const raw = (await readFile(path, 'utf-8')).trim()
      if (!raw) continue
      sections.push(`### ${name}\n${raw}`)
    } catch {
      // missing is fine
    }
  }

  if (sections.length === 0) return ''

  return `\n\n## Project context\nThe following project documents apply to this workspace:\n\n${sections.join('\n\n')}`
}
