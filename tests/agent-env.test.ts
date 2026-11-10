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

  it('loads .codex/agent.env allowlisted keys and ignores PATH / unknown', () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-agent-env-'))
    mkdirSync(join(root, '.codex'), { recursive: true })
    writeFileSync(
      join(root, '.codex', 'agent.env'),
      'OC_TOKEN=secret\nKUBECONFIG=/tmp/kube\nPATH=/custom/bin\nBASH_ENV=/tmp/evil\nMY_TOOL_HOME=/opt\n',
    )
    const env = resolveAgentShellEnv(root, undefined, { PATH: '/usr/bin', HOME: '/Users/x' })
    expect(env.OC_TOKEN).toBe('secret')
    expect(env.KUBECONFIG).toBe('/tmp/kube')
    expect(env.PATH).toBe('/usr/bin')
    expect(env.BASH_ENV).toBeUndefined()
    expect(env.MY_TOOL_HOME).toBeUndefined()
    expect(env.HOME).toBe('/Users/x')
  })

  it('allows PATH from terminal overlay / captured env', () => {
    const root = mkdtempSync(join(tmpdir(), 'codex-agent-env-cap-'))
    mkdirSync(join(root, '.codex'), { recursive: true })
    writeFileSync(join(root, '.codex', '.agent-env.captured'), 'PATH=/venv/bin:/usr/bin\n')
    const env = resolveAgentShellEnv(root, undefined, { PATH: '/usr/bin', HOME: '/Users/x' })
    expect(env.PATH).toBe('/venv/bin:/usr/bin')
  })
})
