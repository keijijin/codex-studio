import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, realpathSync, symlinkSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { resolveWithinWorkspace } from '@codex/tools'

describe('resolveWithinWorkspace symlink safety', () => {
  it('rejects symlinks that escape the workspace', () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-ws-'))
    const outside = mkdtempSync(join(tmpdir(), 'codex-out-'))
    try {
      writeFileSync(join(outside, 'secret.txt'), 'top-secret', 'utf-8')
      symlinkSync(join(outside, 'secret.txt'), join(root, 'leak.txt'))
      expect(() => resolveWithinWorkspace(root, 'leak.txt')).toThrow(/outside workspace/)
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('resolves relative paths against the workspace root (not cwd)', () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-ws-'))
    try {
      mkdirSync(join(root, 'src'))
      writeFileSync(join(root, 'src', 'a.ts'), 'export {}', 'utf-8')
      const prev = process.cwd()
      const other = mkdtempSync(join(tmpdir(), 'codex-cwd-'))
      try {
        process.chdir(other)
        expect(resolveWithinWorkspace(root, 'src/a.ts')).toBe(
          realpathSync(join(root, 'src', 'a.ts')),
        )
      } finally {
        process.chdir(prev)
        rmSync(other, { recursive: true, force: true })
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
