import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createWorkspaceFs } from '@codex/tools'

describe('S-FS-01 WorkspaceFs', () => {
  it('writes and reads inside the primary root', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'codex-sec-fs-')))
    try {
      const fs = createWorkspaceFs(root)
      const path = await fs.writeText('notes/a.txt', 'hello')
      expect(path.startsWith(root)).toBe(true)
      expect(await fs.readText('notes/a.txt')).toBe('hello')
      await fs.appendText('notes/a.txt', '!')
      expect(readFileSync(join(root, 'notes', 'a.txt'), 'utf-8')).toBe('hello!')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('resolves files on a secondary root', async () => {
    const first = realpathSync(mkdtempSync(join(tmpdir(), 'codex-sec-r1-')))
    const second = realpathSync(mkdtempSync(join(tmpdir(), 'codex-sec-r2-')))
    try {
      writeFileSync(join(second, 'only-second.txt'), 'ok', 'utf-8')
      const fs = createWorkspaceFs([first, second])
      expect(await fs.readText('only-second.txt')).toBe('ok')
      await fs.unlink('only-second.txt')
      expect(existsSync(join(second, 'only-second.txt'))).toBe(false)
    } finally {
      rmSync(first, { recursive: true, force: true })
      rmSync(second, { recursive: true, force: true })
    }
  })
})
