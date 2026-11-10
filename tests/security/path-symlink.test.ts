import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, realpathSync, symlinkSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { resolveUnlinkWithinWorkspace, resolveWithinWorkspace } from '@codex/tools'

describe('S-PATH symlink escape', () => {
  it('S-PATH-01 rejects writes through escaping directory symlink', () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-sec-path-'))
    const outside = mkdtempSync(join(tmpdir(), 'codex-sec-out-'))
    try {
      symlinkSync(outside, join(root, 'linkdir'))
      expect(() => resolveWithinWorkspace(root, 'linkdir/new.txt')).toThrow(/outside workspace/)
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('S-PATH-02 rejects dangling symlinks for resolve', () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-sec-dang-'))
    try {
      symlinkSync(join(root, 'missing'), join(root, 'dangling'))
      expect(() => resolveWithinWorkspace(root, 'dangling')).toThrow(/outside workspace/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('S-PATH-05 unlink returns the link node for escaping and dangling links', () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-sec-unl-'))
    const outside = mkdtempSync(join(tmpdir(), 'codex-sec-out-'))
    try {
      writeFileSync(join(outside, 'secret.txt'), 'x', 'utf-8')
      const leak = join(root, 'leak.txt')
      symlinkSync(join(outside, 'secret.txt'), leak)
      expect(resolveUnlinkWithinWorkspace(root, 'leak.txt')).toBe(leak)

      const dangling = join(root, 'dangling')
      symlinkSync(join(root, 'missing'), dangling)
      expect(resolveUnlinkWithinWorkspace(root, 'dangling')).toBe(dangling)
    } finally {
      rmSync(root, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('S-PATH-06 still walks when caller passes realpath under a symlink root', () => {
    const realRoot = mkdtempSync(join(tmpdir(), 'codex-sec-real-'))
    const linkRoot = join(tmpdir(), `codex-sec-link-${Date.now()}`)
    const outside = mkdtempSync(join(tmpdir(), 'codex-sec-out-'))
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
})
