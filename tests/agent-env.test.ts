import { describe, expect, it } from 'vitest'
import {
  mergeShellEnv,
  parseEnvFile,
  resolveAgentShellEnv,
} from '../packages/tools/src/utils/agent-env'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('parseEnvFile', () => {
  it('parses KEY=VALUE and export KEY=VALUE', () => {
    const env = parseEnvFile(`
# comment
FOO=bar
export KUBECONFIG=/tmp/kube
EMPTY=
QUOTED="hello world"
SINGLE='x=y'
INVALID
=novalue
`)
    expect(env).toEqual({
      FOO: 'bar',
      KUBECONFIG: '/tmp/kube',
      QUOTED: 'hello world',
      SINGLE: 'x=y',
    })
  })

  it('keeps values with equals signs', () => {
    expect(parseEnvFile('TOKEN=a=b=c').TOKEN).toBe('a=b=c')
  })
})

describe('mergeShellEnv / resolveAgentShellEnv', () => {
  it('later layers override earlier ones', () => {
    const merged = mergeShellEnv(
      { A: '1', B: '2' },
      { B: '3', C: '4' },
      { C: '' }, // empty skipped
    )
    expect(merged).toEqual({ A: '1', B: '3', C: '4' })
  })

  it('loads .codex/agent.env from workspace', () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-agent-env-'))
    mkdirSync(join(root, '.codex'), { recursive: true })
    writeFileSync(join(root, '.codex', 'agent.env'), 'OC_TOKEN=secret\nPATH=/custom/bin\n')
    const env = resolveAgentShellEnv(root, undefined, { PATH: '/usr/bin', HOME: '/Users/x' })
    expect(env.OC_TOKEN).toBe('secret')
    expect(env.PATH).toBe('/custom/bin')
    expect(env.HOME).toBe('/Users/x')
  })
})
