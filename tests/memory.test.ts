import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync, rmSync } from 'fs'
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

  it('refuses to append when memory path escapes via symlink', async () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-mem-'))
    const outside = mkdtempSync(join(tmpdir(), 'codex-mem-out-'))
    try {
      mkdirSync(join(root, '.codex'), { recursive: true })
      writeFileSync(join(outside, 'MEMORY.md'), '# outside\n', 'utf-8')
      symlinkSync(outside, join(root, '.codex', 'memory'))
      await expect(appendMemoryNote(root, 'x; touch pwned')).rejects.toThrow(/outside workspace/)
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })
})
