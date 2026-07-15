import { mkdtemp, writeFile, rm } from 'fs/promises'
import { join, relative } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import {
  readTool,
  shellTool,
  strReplaceTool,
  deleteTool,
  writeTool,
  resolveWithinWorkspace,
  type ToolContext,
} from '@codex/tools'

function createToolContext(root: string, mode: 'preview' | 'apply' = 'apply'): ToolContext {
  return {
    workspaceRoot: root,
    sessionId: 'test-session',
    signal: new AbortController().signal,
    executeMode: mode,
    resolvePath: (p) => resolveWithinWorkspace(root, p),
    getRelativePath: (p) => relative(root, p),
  }
}

describe('ReadTool', () => {
  it('reads file within workspace with line limit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-read-'))
    try {
      await writeFile(join(root, 'sample.txt'), 'line1\nline2\nline3\n', 'utf-8')
      const ctx = createToolContext(root)
      const result = await readTool.execute(ctx, { path: 'sample.txt', offset: 2, limit: 1 })

      expect(result.success).toBe(true)
      expect(result.output).toContain('line2')
      expect(result.output).not.toContain('line1')
      expect(result.output).not.toContain('line3')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects path outside workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-read-'))
    try {
      const ctx = createToolContext(root)
      const result = await readTool.execute(ctx, { path: '/etc/passwd' })

      expect(result.success).toBe(false)
      expect(result.output).toMatch(/outside workspace|Error:/i)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('ShellTool', () => {
  it('blocks dangerous denylist commands', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-shell-'))
    try {
      const ctx = createToolContext(root)
      const result = await shellTool.execute(ctx, { command: 'rm -rf /' })

      expect(result.success).toBe(false)
      expect(result.output).toContain('blocked by security policy')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('returns preview without executing in preview mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-shell-'))
    try {
      const ctx = createToolContext(root, 'preview')
      const result = await shellTool.execute(ctx, { command: 'echo hello' })

      expect(result.success).toBe(true)
      expect(result.output).toContain('Preview:')
      expect(result.output).toContain('echo hello')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('StrReplaceTool', () => {
  it('replaces a unique match', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-str-'))
    try {
      await writeFile(join(root, 'edit.txt'), 'foo bar foo', 'utf-8')
      const ctx = createToolContext(root)
      const result = await strReplaceTool.execute(ctx, {
        path: 'edit.txt',
        old_string: 'bar',
        new_string: 'baz',
      })

      expect(result.success).toBe(true)
      const { readFile } = await import('fs/promises')
      expect(await readFile(join(root, 'edit.txt'), 'utf-8')).toBe('foo baz foo')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects partial match when old_string appears multiple times', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-str-'))
    try {
      await writeFile(join(root, 'edit.txt'), 'foo foo foo', 'utf-8')
      const ctx = createToolContext(root)
      const result = await strReplaceTool.execute(ctx, {
        path: 'edit.txt',
        old_string: 'foo',
        new_string: 'bar',
      })

      expect(result.success).toBe(false)
      expect(result.output).toContain('matches 3 times')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('replaces all matches when replace_all is true', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-str-'))
    try {
      await writeFile(join(root, 'edit.txt'), 'foo foo foo', 'utf-8')
      const ctx = createToolContext(root)
      const result = await strReplaceTool.execute(ctx, {
        path: 'edit.txt',
        old_string: 'foo',
        new_string: 'bar',
        replace_all: true,
      })

      expect(result.success).toBe(true)
      const { readFile } = await import('fs/promises')
      expect(await readFile(join(root, 'edit.txt'), 'utf-8')).toBe('bar bar bar')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('DeleteTool', () => {
  it('returns preview without deleting in preview mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-del-'))
    try {
      await writeFile(join(root, 'remove-me.txt'), 'bye', 'utf-8')
      const ctx = createToolContext(root, 'preview')
      const result = await deleteTool.execute(ctx, { path: 'remove-me.txt' })

      expect(result.success).toBe(true)
      expect(result.output).toContain('Preview: delete')
      const { readFile } = await import('fs/promises')
      expect(await readFile(join(root, 'remove-me.txt'), 'utf-8')).toBe('bye')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('deletes file in apply mode', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-del-'))
    try {
      await writeFile(join(root, 'remove-me.txt'), 'bye', 'utf-8')
      const ctx = createToolContext(root)
      const result = await deleteTool.execute(ctx, { path: 'remove-me.txt' })

      expect(result.success).toBe(true)
      const { access } = await import('fs/promises')
      await expect(access(join(root, 'remove-me.txt'))).rejects.toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('WriteTool', () => {
  it('returns preview metadata for new file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-write-'))
    try {
      const ctx = createToolContext(root, 'preview')
      const result = await writeTool.execute(ctx, {
        path: 'new-file.txt',
        content: 'created',
      })

      expect(result.success).toBe(true)
      expect(result.output).toContain('Preview: create')
      expect(result.metadata?.newContent).toBe('created')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('resolveWithinWorkspace', () => {
  it('resolves relative paths inside workspace', () => {
    const root = '/tmp/workspace'
    expect(resolveWithinWorkspace(root, 'src/app.ts')).toBe('/tmp/workspace/src/app.ts')
  })

  it('throws for paths outside workspace', () => {
    expect(() => resolveWithinWorkspace('/tmp/workspace', '/etc/passwd')).toThrow(/outside workspace/)
  })
})
