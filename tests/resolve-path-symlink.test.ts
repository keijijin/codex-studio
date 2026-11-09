import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, realpathSync, symlinkSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { resolveUnlinkWithinWorkspace, resolveWithinWorkspace } from '@codex/tools'

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

  it('rejects writes through a directory symlink that escapes', () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-ws-'))
    const outside = mkdtempSync(join(tmpdir(), 'codex-out-'))
    try {
      symlinkSync(outside, join(root, 'linkdir'))
      expect(() => resolveWithinWorkspace(root, 'linkdir/new.txt')).toThrow(/outside workspace/)
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('rejects dangling symlinks', () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-ws-'))
    try {
      symlinkSync(join(root, 'missing-target'), join(root, 'dangling'))
      expect(() => resolveWithinWorkspace(root, 'dangling')).toThrow(/outside workspace/)
      expect(() => resolveWithinWorkspace(root, 'dangling/new.txt')).toThrow(/outside workspace/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('unlink resolves escaping file symlinks to the link path itself', () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-ws-'))
    const outside = mkdtempSync(join(tmpdir(), 'codex-out-'))
    try {
      writeFileSync(join(outside, 'secret.txt'), 'top-secret', 'utf-8')
      const link = join(root, 'leak.txt')
      symlinkSync(join(outside, 'secret.txt'), link)
      expect(resolveUnlinkWithinWorkspace(root, 'leak.txt')).toBe(link)
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('unlink resolves dangling symlinks to the link path itself', () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-ws-'))
    try {
      const link = join(root, 'dangling')
      symlinkSync(join(root, 'missing-target'), link)
      expect(resolveUnlinkWithinWorkspace(root, 'dangling')).toBe(link)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('still walks symlinks when the caller passes a realpath under a symlink root', () => {
    const realRoot = mkdtempSync(join(tmpdir(), 'codex-real-'))
    const linkRoot = join(tmpdir(), `codex-link-${Date.now()}`)
    const outside = mkdtempSync(join(tmpdir(), 'codex-out-'))
    try {
      mkdirSync(join(realRoot, 'src'))
      symlinkSync(outside, join(realRoot, 'src', 'leakdir'))
      symlinkSync(realRoot, linkRoot)
      const viaReal = join(realpathSync(realRoot), 'src', 'leakdir', 'pwned.txt')
      expect(() => resolveWithinWorkspace(linkRoot, viaReal)).toThrow(/outside workspace/)
    } finally {
      rmSync(linkRoot, { recursive: true, force: true })
      rmSync(realRoot, { recursive: true, force: true })
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
