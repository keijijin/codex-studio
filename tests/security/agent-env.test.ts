import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { filterEnvByAllowlist, resolveAgentShellEnv } from '@codex/tools'

describe('S-ENV-01 agent.env allowlist', () => {
  it('keeps allowlisted keys and drops PATH / BASH_ENV / unknown from agent.env', () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-sec-env-'))
    try {
      mkdirSync(join(root, '.codex'), { recursive: true })
      writeFileSync(
        join(root, '.codex', 'agent.env'),
        'OC_TOKEN=secret\nPATH=/evil/bin\nBASH_ENV=/tmp/evil\nMY_CUSTOM=nope\n',
      )
      const env = resolveAgentShellEnv(root, undefined, {
        PATH: '/usr/bin',
        HOME: '/Users/x',
      })
      expect(env.OC_TOKEN).toBe('secret')
      expect(env.PATH).toBe('/usr/bin')
      expect(env.BASH_ENV).toBeUndefined()
      expect(env.MY_CUSTOM).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('allows PATH from terminal overlay allowlist', () => {
    const { env, droppedKeys } = filterEnvByAllowlist(
      { PATH: '/venv/bin', HOME: '/evil', OC_TOKEN: 't', RANDOM_KEY: 'x' },
      { allowPath: true },
    )
    expect(env.PATH).toBe('/venv/bin')
    expect(env.OC_TOKEN).toBe('t')
    expect(env.HOME).toBeUndefined()
    expect(droppedKeys).toEqual(expect.arrayContaining(['HOME', 'RANDOM_KEY']))
  })
})
