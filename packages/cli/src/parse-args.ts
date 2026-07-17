import { resolve } from 'node:path'
import type { LLMProviderId, PermissionProfile } from '@codex/shared'

export type CliCommand = 'agent' | 'team-list' | 'team-run' | 'help'

export interface CliArgs {
  command: CliCommand
  prompt: string
  teamId: string
  workspace: string
  provider: LLMProviderId
  model: string
  profile: PermissionProfile
  yolo: boolean
  maxIterations: number
  json: boolean
}

function defaultModel(provider: LLMProviderId): string {
  if (provider === 'anthropic') return 'claude-sonnet-4-20250514'
  if (provider === 'ollama') return 'llama3.2'
  return 'gpt-4o'
}

function helpArgs(): CliArgs {
  return {
    command: 'help',
    prompt: '',
    teamId: '',
    workspace: process.cwd(),
    provider: 'openai',
    model: 'gpt-4o',
    profile: 'readonly',
    yolo: false,
    maxIterations: 50,
    json: false,
  }
}

function parseSharedOptions(args: string[]): Omit<CliArgs, 'command' | 'prompt' | 'teamId'> & {
  promptParts: string[]
  teamId?: string
} {
  let workspace = process.cwd()
  let provider: LLMProviderId = 'openai'
  let model = ''
  let profile: PermissionProfile = 'readonly'
  let yolo = false
  let maxIterations = 50
  let json = false
  const promptParts: string[] = []

  while (args.length > 0) {
    const token = args.shift()!
    if (token === '-w' || token === '--workspace') {
      workspace = resolve(args.shift() ?? process.cwd())
    } else if (token === '-p' || token === '--provider') {
      const p = (args.shift() ?? 'openai') as LLMProviderId
      if (p !== 'openai' && p !== 'anthropic' && p !== 'ollama') {
        throw new Error(`Unknown provider: ${p}`)
      }
      provider = p
    } else if (token === '-m' || token === '--model') {
      model = args.shift() ?? ''
    } else if (token === '--profile') {
      const name = args.shift() ?? 'readonly'
      if (name !== 'readonly' && name !== 'ask' && name !== 'allow') {
        throw new Error(`Unknown profile: ${name}`)
      }
      profile = name
    } else if (token === '--yolo') {
      yolo = true
    } else if (token === '--max-iterations') {
      maxIterations = Math.max(1, Number(args.shift() ?? 50) || 50)
    } else if (token === '--json') {
      json = true
    } else if (token === '-h' || token === '--help') {
      throw new Error('__help__')
    } else if (!token.startsWith('-')) {
      promptParts.push(token)
    } else {
      throw new Error(`Unknown argument: ${token}`)
    }
  }

  return {
    workspace,
    provider,
    model: model || defaultModel(provider),
    profile: yolo ? 'allow' : profile,
    yolo,
    maxIterations,
    json,
    promptParts,
  }
}

export function parseArgs(argv: string[]): CliArgs {
  const args = [...argv]
  while (args[0] === '--') args.shift()

  if (args.length === 0 || args[0] === 'help' || args[0] === '-h' || args[0] === '--help') {
    return helpArgs()
  }

  const cmd = args.shift()!

  if (cmd === 'agent') {
    try {
      const shared = parseSharedOptions(args)
      const prompt = shared.promptParts.join(' ').trim()
      if (!prompt) {
        throw new Error('Missing prompt. Usage: codex-studio agent "<prompt>"')
      }
      return {
        command: 'agent',
        prompt,
        teamId: '',
        workspace: shared.workspace,
        provider: shared.provider,
        model: shared.model,
        profile: shared.profile,
        yolo: shared.yolo,
        maxIterations: shared.maxIterations,
        json: shared.json,
      }
    } catch (err) {
      if (err instanceof Error && err.message === '__help__') return helpArgs()
      throw err
    }
  }

  if (cmd === 'team') {
    const sub = args.shift()
    if (!sub || sub === 'list' || sub === '-h' || sub === '--help') {
      if (sub === '-h' || sub === '--help') return helpArgs()
      try {
        const shared = parseSharedOptions(args)
        return {
          command: 'team-list',
          prompt: '',
          teamId: '',
          workspace: shared.workspace,
          provider: shared.provider,
          model: shared.model,
          profile: shared.profile,
          yolo: shared.yolo,
          maxIterations: shared.maxIterations,
          json: shared.json,
        }
      } catch (err) {
        if (err instanceof Error && err.message === '__help__') return helpArgs()
        throw err
      }
    }
    if (sub === 'run') {
      try {
        const shared = parseSharedOptions(args)
        const teamId = shared.promptParts[0] ?? ''
        const prompt = shared.promptParts.slice(1).join(' ').trim()
        if (!teamId) {
          throw new Error('Missing team id. Usage: codex-studio team run <id> "<task>"')
        }
        if (!prompt) {
          throw new Error('Missing task. Usage: codex-studio team run <id> "<task>"')
        }
        return {
          command: 'team-run',
          prompt,
          teamId,
          workspace: shared.workspace,
          provider: shared.provider,
          model: shared.model,
          profile: shared.profile,
          yolo: shared.yolo,
          maxIterations: shared.maxIterations,
          json: shared.json,
        }
      } catch (err) {
        if (err instanceof Error && err.message === '__help__') return helpArgs()
        throw err
      }
    }
    throw new Error(`Unknown team subcommand: ${sub}. Use: team list | team run`)
  }

  return helpArgs()
}
