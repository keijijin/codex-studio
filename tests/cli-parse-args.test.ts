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

  it('parses --routing mode', () => {
    const args = parseArgs(['agent', 'hello', '--routing', 'auto'])
    expect(args.routing).toBe('auto')
    expect(parseArgs(['agent', 'hi']).routing).toBe('fixed')
  })

  it('parses -p xai and defaults grok model', () => {
    const args = parseArgs(['agent', 'hi', '-p', 'xai'])
    expect(args.provider).toBe('xai')
    expect(args.model).toBe('grok-4.5')
  })
})
