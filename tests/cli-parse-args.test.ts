import { describe, expect, it } from 'vitest'
import { parseArgs } from '../packages/cli/src/parse-args'

describe('cli parseArgs', () => {
  it('strips leading -- from pnpm script forwarding', () => {
    const args = parseArgs(['--', 'agent', 'README.mdを要約して', '-w', '/tmp/ws'])
    expect(args.command).toBe('agent')
    expect(args.prompt).toBe('README.mdを要約して')
    expect(args.workspace).toBe('/tmp/ws')
  })

  it('parses agent prompt and options', () => {
    const args = parseArgs([
      'agent',
      'hello',
      '--profile',
      'allow',
      '--json',
      '-p',
      'anthropic',
    ])
    expect(args).toMatchObject({
      command: 'agent',
      prompt: 'hello',
      profile: 'allow',
      json: true,
      provider: 'anthropic',
      yolo: false,
    })
  })

  it('parses team list and team run', () => {
    expect(parseArgs(['team', 'list', '-w', '/tmp']).command).toBe('team-list')
    const run = parseArgs(['team', 'run', 'review-squad', 'IPCを見て', '-w', '/tmp'])
    expect(run).toMatchObject({
      command: 'team-run',
      teamId: 'review-squad',
      prompt: 'IPCを見て',
      workspace: '/tmp',
    })
  })
})
