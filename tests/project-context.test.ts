import { mkdtemp, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import { loadProjectContext, PROJECT_CONTEXT_FILES } from '@codex/agent-core'

describe('project-context', () => {
  it('exports expected file names', () => {
    expect(PROJECT_CONTEXT_FILES).toEqual(['CODEX.md', 'CLAUDE.md', 'AGENTS.md'])
  })

  it('loads present project context files into a prompt section', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-ctx-'))
    try {
      await writeFile(join(root, 'CODEX.md'), 'Use pnpm.', 'utf-8')
      await writeFile(join(root, 'AGENTS.md'), 'Respond in Japanese.', 'utf-8')

      const prompt = await loadProjectContext(root)
      expect(prompt).toContain('## Project context')
      expect(prompt).toContain('### CODEX.md')
      expect(prompt).toContain('Use pnpm.')
      expect(prompt).toContain('### AGENTS.md')
      expect(prompt).toContain('Respond in Japanese.')
      expect(prompt).not.toContain('### CLAUDE.md')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('returns empty string when no context files exist', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-ctx-empty-'))
    try {
      expect(await loadProjectContext(root)).toBe('')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
