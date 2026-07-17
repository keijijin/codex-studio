import { mkdtemp, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import { appendMemoryNote, loadMemory, memoryFilePath } from '@codex/agent-core'

describe('memory', () => {
  it('returns empty when MEMORY.md is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-mem-'))
    try {
      expect(await loadMemory(root)).toBe('')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('appends notes and loads them into a prompt section', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-mem-'))
    try {
      await appendMemoryNote(root, 'Use pnpm not npm')
      const prompt = await loadMemory(root)
      expect(prompt).toContain('## Project memory')
      expect(prompt).toContain('Use pnpm not npm')
      const raw = await readFile(memoryFilePath(root), 'utf-8')
      expect(raw).toContain('Use pnpm not npm')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
