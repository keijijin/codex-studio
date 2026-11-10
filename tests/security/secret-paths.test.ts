import { describe, expect, it } from 'vitest'
import {
  createWorkspaceFs,
  isSecretPath,
  readTool,
  secretReadDecision,
} from '@codex/tools'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { join, relative } from 'path'
import { tmpdir } from 'os'
import { realpathSync } from 'fs'

describe('S-SECRET-01 secret path policy', () => {
  it('classifies env and keys as secrets, templates as not', () => {
    expect(isSecretPath('.env')).toBe(true)
    expect(isSecretPath('apps/api/.env.local')).toBe(true)
    expect(isSecretPath('certs/server.pem')).toBe(true)
    expect(isSecretPath('.codex/.agent-env.captured')).toBe(true)
    expect(isSecretPath('secrets.enc.json')).toBe(true)
    expect(isSecretPath('.env.example')).toBe(false)
    expect(isSecretPath('src/config.ts')).toBe(false)
  })

  it('always denies captured env and secrets.enc even if default is ask', () => {
    expect(secretReadDecision('.codex/.agent-env.captured', 'ask')).toBe('deny')
    expect(secretReadDecision('secrets.enc.json', 'allow')).toBe('deny')
    expect(secretReadDecision('.env', 'ask')).toBe('ask')
    expect(secretReadDecision('.env', 'deny')).toBe('deny')
    expect(secretReadDecision('.env.example', 'deny')).toBe('allow')
  })

  it('Read preview hides secret contents; deny policy blocks apply', async () => {
    const root = realpathSync(await mkdtemp(join(tmpdir(), 'codex-secret-')))
    try {
      await writeFile(join(root, '.env'), 'SECRET=hunter2\n', 'utf-8')
      const fs = createWorkspaceFs(root)
      const base = {
        workspaceRoot: root,
        sessionId: 's',
        signal: new AbortController().signal,
        fs,
        resolvePath: (p: string) => fs.resolve(p),
        getRelativePath: (p: string) => relative(root, p).replace(/\\/g, '/'),
        secretReadPolicy: 'ask' as const,
      }

      const preview = await readTool.execute(
        { ...base, executeMode: 'preview' },
        { path: '.env' },
      )
      expect(preview.success).toBe(true)
      expect(preview.output).toMatch(/secret path/i)
      expect(preview.metadata?.newContent).not.toContain('hunter2')

      const denied = await readTool.execute(
        { ...base, executeMode: 'apply', secretReadPolicy: 'deny' },
        { path: '.env' },
      )
      expect(denied.success).toBe(false)
      expect(denied.output).toMatch(/denied/i)

      const allowed = await readTool.execute(
        { ...base, executeMode: 'apply', secretReadPolicy: 'ask' },
        { path: '.env' },
      )
      expect(allowed.success).toBe(true)
      expect(allowed.output).toContain('hunter2')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
