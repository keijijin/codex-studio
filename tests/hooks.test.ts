import { mkdir, mkdtemp, writeFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import { loadHooksConfig, HooksRuntime } from '@codex/agent-core'

describe('hooks-loader', () => {
  it('returns empty config when hooks.json is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-hooks-'))
    try {
      expect(await loadHooksConfig(root)).toEqual({ hooks: [] })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('parses valid hooks and skips invalid entries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-hooks-'))
    try {
      await mkdir(join(root, '.codex'), { recursive: true })
      await writeFile(
        join(root, '.codex', 'hooks.json'),
        JSON.stringify({
          hooks: [
            {
              event: 'onFileSave',
              paths: ['**/*.ts'],
              exclude: ['**/skip.ts'],
              action: { type: 'shell', command: 'echo hi' },
            },
            { event: 'onFileSave', action: { type: 'shell' } },
            {
              event: 'onAgentComplete',
              action: { type: 'skill', skill: 'review', args: 'focus' },
            },
          ],
        }),
        'utf-8',
      )

      const config = await loadHooksConfig(root)
      expect(config.hooks).toHaveLength(2)
      expect(config.hooks[0].action.type).toBe('shell')
      expect(config.hooks[1]).toMatchObject({
        event: 'onAgentComplete',
        action: { type: 'skill', skill: 'review', args: 'focus' },
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('HooksRuntime', () => {
  it('runs matching shell hooks and expands variables', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-hooks-rt-'))
    try {
      const runtime = new HooksRuntime({
        loadConfig: async () => ({
          hooks: [
            {
              event: 'onFileSave',
              paths: ['**/*.ts'],
              action: {
                type: 'shell',
                command: 'printf "%s" "${relativePath}"',
              },
              cooldownMs: 0,
            },
          ],
        }),
      })

      const results = await runtime.dispatch('onFileSave', {
        workspaceRoot: root,
        filePath: join(root, 'src', 'a.ts'),
        relativePath: 'src/a.ts',
      })

      expect(results).toHaveLength(1)
      expect(results[0].success).toBe(true)
      if (results[0].type === 'shell') {
        expect(results[0].output).toBe('src/a.ts')
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('respects exclude globs and path filters', async () => {
    const runtime = new HooksRuntime({
      loadConfig: async () => ({
        hooks: [
          {
            event: 'onFileSave',
            paths: ['**/*.ts'],
            exclude: ['**/ignored.ts'],
            action: { type: 'shell', command: 'echo hit' },
            cooldownMs: 0,
          },
        ],
      }),
    })

    const skipped = await runtime.dispatch('onFileSave', {
      workspaceRoot: '/tmp',
      relativePath: 'src/ignored.ts',
    })
    expect(skipped).toHaveLength(0)

    const missed = await runtime.dispatch('onFileSave', {
      workspaceRoot: '/tmp',
      relativePath: 'src/a.md',
    })
    expect(missed).toHaveLength(0)
  })

  it('blocks re-entrant dispatches while a hook is running', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const runtime = new HooksRuntime({
      loadConfig: async () => ({
        hooks: [
          {
            event: 'onFileSave',
            action: { type: 'skill', skill: 'hold' },
            cooldownMs: 0,
          },
        ],
      }),
      runSkill: async () => {
        await gate
        return { success: true, output: 'done' }
      },
    })

    const outer = runtime.dispatch('onFileSave', {
      workspaceRoot: process.cwd(),
      relativePath: 'a.ts',
    })
    // Wait until skill runner is inside (depth > 0)
    await new Promise((r) => setTimeout(r, 10))
    expect(runtime.isRunning).toBe(true)
    const nested = await runtime.dispatch('onFileSave', {
      workspaceRoot: process.cwd(),
      relativePath: 'b.ts',
    })
    release()
    await outer
    expect(nested).toHaveLength(0)
  })

  it('invokes skill runner when configured', async () => {
    const calls: Array<{ skill: string; args: string }> = []
    const runtime = new HooksRuntime({
      loadConfig: async () => ({
        hooks: [
          {
            event: 'onAgentComplete',
            action: { type: 'skill', skill: 'review', args: 'ipc' },
            cooldownMs: 0,
          },
        ],
      }),
      runSkill: async (skill, args) => {
        calls.push({ skill, args })
        return { success: true, output: 'ok' }
      },
    })

    const results = await runtime.dispatch('onAgentComplete', {
      workspaceRoot: '/tmp',
      sessionId: 's1',
    })
    expect(calls).toEqual([{ skill: 'review', args: 'ipc' }])
    expect(results[0]).toMatchObject({ type: 'skill', success: true })
  })

  it('respects cooldown between identical fires', async () => {
    let runs = 0
    const runtime = new HooksRuntime({
      loadConfig: async () => ({
        hooks: [
          {
            event: 'onFileSave',
            action: { type: 'shell', command: 'echo x' },
            cooldownMs: 60_000,
          },
        ],
      }),
    })

    const first = await runtime.dispatch('onFileSave', {
      workspaceRoot: process.cwd(),
      relativePath: 'same.ts',
    })
    runs += first.length
    const second = await runtime.dispatch('onFileSave', {
      workspaceRoot: process.cwd(),
      relativePath: 'same.ts',
    })
    runs += second.length
    expect(runs).toBe(1)
  })
})
