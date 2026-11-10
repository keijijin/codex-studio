import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { appendMemoryNote } from '@codex/agent-core'
import { createWorkspaceFs } from '@codex/tools'

describe('S-MEM-01 memory symlink escape', () => {
  it('refuses appendMemoryNote when .codex/memory escapes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-sec-mem-'))
    const outside = mkdtempSync(join(tmpdir(), 'codex-sec-mem-out-'))
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

  it('WorkspaceFs.appendText also refuses escaping memory dir', async () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-sec-fs-mem-'))
    const outside = mkdtempSync(join(tmpdir(), 'codex-sec-fs-out-'))
    try {
      mkdirSync(join(root, '.codex'), { recursive: true })
      writeFileSync(join(outside, 'MEMORY.md'), '# outside\n', 'utf-8')
      symlinkSync(outside, join(root, '.codex', 'memory'))
      const fs = createWorkspaceFs(root)
      await expect(fs.appendText('.codex/memory/MEMORY.md', 'pwn\n')).rejects.toThrow(
        /outside workspace/,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })
})
