import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  backupFile,
  toBackupRelativePath,
} from '../packages/tools/src/utils/backup'
import {
  resolveWithinWorkspace,
  strReplaceTool,
  writeTool,
  type ToolContext,
} from '@codex/tools'
import { relative } from 'path'

describe('toBackupRelativePath', () => {
  it('strips Windows drive letter so join cannot reset the backup root', () => {
    expect(toBackupRelativePath('C:\\Users\\keiji\\ai\\reservation-system\\AGENTS.md')).toBe(
      'C/Users/keiji/ai/reservation-system/AGENTS.md',
    )
    expect(toBackupRelativePath('C:/Users/keiji/ai/file.txt')).toBe(
      'C/Users/keiji/ai/file.txt',
    )
  })

  it('handles Unix absolute paths without breaking macOS/Linux backups', () => {
    expect(toBackupRelativePath('/home/keiji/project/AGENTS.md')).toBe(
      'home/keiji/project/AGENTS.md',
    )
    expect(toBackupRelativePath('/Users/keiji/ai/codex-studio/README.md')).toBe(
      'Users/keiji/ai/codex-studio/README.md',
    )
    // Must not invent a drive letter or leave a leading slash segment.
    expect(toBackupRelativePath('/tmp/file.txt')).toBe('tmp/file.txt')
    expect(toBackupRelativePath('/tmp/file.txt')).not.toMatch(/^[A-Za-z]\//)
  })

  it('handles UNC paths', () => {
    expect(toBackupRelativePath('\\\\server\\share\\dir\\file.txt')).toBe(
      'UNC/server/share/dir/file.txt',
    )
  })

  it('never produces path segments with reserved Windows characters', () => {
    const result = toBackupRelativePath('C:\\Users\\keiji\\ai\\file?.txt')
    expect(result).not.toMatch(/[<>:"|?*]/)
    expect(result).toContain('file_.txt')
  })
})

describe('backupFile on Windows-style absolute paths', () => {
  const sessionId = `backup-test-${Date.now()}`
  let createdBackup: string | undefined

  afterEach(async () => {
    if (createdBackup) {
      // Remove the timestamped backup tree under ~/.codex-studio/backups/<session>
      const sessionRoot = join(
        process.env.USERPROFILE ?? process.env.HOME ?? tmpdir(),
        '.codex-studio',
        'backups',
        sessionId,
      )
      await rm(sessionRoot, { recursive: true, force: true })
      createdBackup = undefined
    }
  })

  it('creates a backup under .codex-studio without embedding a drive letter colon', async () => {
    const winPath = 'C:\\Users\\keiji\\ai\\reservation-system\\AGENTS.md'
    createdBackup = await backupFile(sessionId, winPath, 'old content\n')

    expect(createdBackup).toContain(join('.codex-studio', 'backups', sessionId))
    expect(createdBackup).not.toMatch(/backups[/\\][^/\\]+[/\\][^/\\]+[/\\][A-Za-z]:/)
    expect(createdBackup.replace(/\\/g, '/')).toContain(
      'C/Users/keiji/ai/reservation-system/AGENTS.md',
    )

    const saved = await readFile(createdBackup, 'utf-8')
    expect(saved).toBe('old content\n')
  })
})

describe('Write / StrReplace with existing file (backup path)', () => {
  function createToolContext(root: string): ToolContext {
    return {
      workspaceRoot: root,
      sessionId: `write-backup-${Date.now()}`,
      signal: new AbortController().signal,
      executeMode: 'apply',
      resolvePath: (p) => resolveWithinWorkspace(root, p),
      getRelativePath: (p) => relative(root, p),
    }
  }

  it('Write overwrites an existing file without ENOENT mkdir backup failure', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-backup-write-'))
    const sessionId = `write-backup-${Date.now()}`
    try {
      await writeFile(join(root, 'AGENTS.md'), 'old agents\n', 'utf-8')
      const ctx: ToolContext = {
        ...createToolContext(root),
        sessionId,
      }
      const result = await writeTool.execute(ctx, {
        path: 'AGENTS.md',
        content: 'new agents\n',
      })

      expect(result.success).toBe(true)
      expect(result.output).not.toMatch(/ENOENT|mkdir/i)
      const content = await readFile(join(root, 'AGENTS.md'), 'utf-8')
      expect(content).toBe('new agents\n')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(
        join(
          process.env.USERPROFILE ?? process.env.HOME ?? tmpdir(),
          '.codex-studio',
          'backups',
          sessionId,
        ),
        { recursive: true, force: true },
      )
    }
  })

  it('StrReplace updates an existing file without backup path errors', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-backup-str-'))
    const sessionId = `str-backup-${Date.now()}`
    try {
      await writeFile(join(root, 'note.txt'), 'hello world\n', 'utf-8')
      const ctx: ToolContext = {
        ...createToolContext(root),
        sessionId,
      }
      const result = await strReplaceTool.execute(ctx, {
        path: 'note.txt',
        old_string: 'world',
        new_string: 'codex',
      })

      expect(result.success).toBe(true)
      expect(result.output).not.toMatch(/ENOENT|mkdir/i)
      const content = await readFile(join(root, 'note.txt'), 'utf-8')
      expect(content).toBe('hello codex\n')
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(
        join(
          process.env.USERPROFILE ?? process.env.HOME ?? tmpdir(),
          '.codex-studio',
          'backups',
          sessionId,
        ),
        { recursive: true, force: true },
      )
    }
  })
})
