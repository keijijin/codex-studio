#!/usr/bin/env node
import { relative, resolve } from 'node:path'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  collectSkills,
  collectTeams,
  findTeam,
  runHeadlessAgent,
  runTeam,
  type HeadlessAgentResult,
} from '@codex/agent-core'
import { getProviderInstance, decideRouting, isRetryableError, type ModelCandidate } from '@codex/llm-adapters'
import { defaultToolRegistry, resolveWithinWorkspace } from '@codex/tools'
import {
  DEFAULT_FALLBACK_CHAIN,
  DEFAULT_OLLAMA_BASE_URL,
  type LLMProviderId,
} from '@codex/shared'
import { parseArgs, type CliArgs } from './parse-args.js'

function printHelp(): void {
  console.log(`codex-studio — headless Codex Studio agent / teams

Usage:
  pnpm cli -- agent "<prompt>" [options]
  pnpm cli -- team list [-w <path>]
  pnpm cli -- team run <teamId> "<task>" [options]
  pnpm exec codex-studio agent "<prompt>" [options]

Options:
  -w, --workspace <path>   Workspace root (default: cwd)
  -p, --provider <id>      openai | anthropic | ollama (default: openai)
  -m, --model <id>         Model id
  --profile <name>         readonly | ask | allow (default: readonly)
  --routing <mode>         fixed | auto | fallback-only (default: fixed)
  --yolo                   Allow all tools (same as --profile allow)
  --max-iterations <n>     Tool loop limit (default: 50)
  --json                   Print final result as JSON
  -h, --help               Show help

Environment:
  OPENAI_API_KEY / ANTHROPIC_API_KEY / OLLAMA_BASE_URL

Examples:
  pnpm cli -- agent "README を要約して" -w .
  pnpm cli -- agent "実装して" -w . --routing fallback-only
  pnpm cli -- team list -w .
  pnpm cli -- team run review-squad "IPC と権限をレビュー" -w .

Notes:
  Local Agent Teams write to .codex/teams/<id>/BOARD.md
  Shared skills: ~/.codex-studio/skills (workspace .codex/skills wins on name clash)
  Cloud / Remote Control are deferred (see docs/09-PhaseD-設計ゲート.md)
`)
}

function resolveApiKey(provider: LLMProviderId): { apiKey: string; baseUrl?: string } | null {
  if (provider === 'ollama') {
    return {
      apiKey: 'ollama',
      baseUrl: process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL,
    }
  }
  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return null
    return { apiKey }
  }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  return { apiKey }
}

function isCliCandidateAvailable(candidate: ModelCandidate): boolean {
  return resolveApiKey(candidate.provider) !== null
}

async function runAgentOnce(
  args: CliArgs,
  candidate: ModelCandidate,
): Promise<HeadlessAgentResult> {
  const creds = resolveApiKey(candidate.provider)
  if (!creds) {
    return {
      success: false,
      text: '',
      error: `Missing API key for ${candidate.provider}`,
      events: [],
    }
  }
  return runHeadlessAgent({
    workspaceRoot: args.workspace,
    prompt: args.prompt,
    provider: candidate.provider,
    model: candidate.model,
    apiKey: creds.apiKey,
    baseUrl: creds.baseUrl,
    maxIterations: args.maxIterations,
    permissionProfile: args.profile,
    yoloMode: args.yolo || args.profile === 'allow',
    onEvent: (event) => {
      if (args.json) return
      if (event.type === 'text_delta') {
        process.stdout.write(event.content)
      } else if (event.type === 'tool_call_start') {
        console.error(`\n→ ${event.tool}`)
      } else if (event.type === 'tool_call_result') {
        const mark = event.success ? '✓' : '✗'
        console.error(`${mark} ${event.tool}`)
      } else if (event.type === 'error') {
        console.error(`\nError: ${event.message}`)
      }
    },
  })
}

async function runAgent(args: CliArgs): Promise<HeadlessAgentResult & {
  routing?: { mode: string; reason: string; selected: ModelCandidate; tried: ModelCandidate[] }
}> {
  const primary: ModelCandidate = { provider: args.provider, model: args.model }
  const decision = decideRouting({
    mode: args.routing,
    primary,
    fallbackChain: DEFAULT_FALLBACK_CHAIN,
    maxAttempts: 3,
    isAvailable: isCliCandidateAvailable,
    prompt: args.prompt,
    runMode: 'agent',
  })

  if (!args.json) {
    console.error(`[routing] ${decision.reason}`)
  }

  const tried: ModelCandidate[] = []
  let last: HeadlessAgentResult = {
    success: false,
    text: '',
    error: 'No available models',
    events: [],
  }

  for (let i = 0; i < decision.queue.length; i++) {
    const candidate = decision.queue[i]!
    tried.push(candidate)
    if (i > 0 && !args.json) {
      console.error(`\n[routing] fallback → ${candidate.provider}:${candidate.model}`)
    }
    last = await runAgentOnce(args, candidate)
    if (last.success) {
      return {
        ...last,
        routing: {
          mode: decision.mode,
          reason: decision.reason,
          selected: candidate,
          tried,
        },
      }
    }
    const err = last.error ?? 'Agent failed'
    const toolsStarted = last.events.some(
      (e) => e.type === 'tool_call_start' || e.type === 'tool_call_result',
    )
    const canRetry =
      !toolsStarted &&
      i < decision.queue.length - 1 &&
      isRetryableError(err)
    if (!canRetry) break
  }

  return {
    ...last,
    routing: {
      mode: decision.mode,
      reason: decision.reason,
      selected: tried[tried.length - 1] ?? decision.selected,
      tried,
    },
  }
}

async function listTeams(args: CliArgs): Promise<void> {
  const teams = await collectTeams(args.workspace)
  const skills = await collectSkills(args.workspace, {
    globalSkillsDir: join(homedir(), '.codex-studio', 'skills'),
  })
  if (args.json) {
    console.log(JSON.stringify({ teams, skills: skills.map((s) => s.name) }, null, 2))
    return
  }
  if (teams.length === 0) {
    console.log('No teams found. Add .codex/teams/<id>/team.json')
  } else {
    console.log('Teams:')
    for (const t of teams) {
      console.log(`  - ${t.id}: ${t.description || t.name} (${t.roles.length} roles)`)
    }
  }
  console.log(`\nSkills (workspace + ~/.codex-studio/skills): ${skills.map((s) => s.name).join(', ') || '(none)'}`)
}

async function runTeamCli(args: CliArgs): Promise<void> {
  const creds = resolveApiKey(args.provider)
  if (!creds) {
    throw new Error(
      args.provider === 'ollama'
        ? 'Ollama is not configured'
        : `${args.provider.toUpperCase()} API key is not set`,
    )
  }
  const { apiKey, baseUrl } = creds
  const workspaceRoot = resolve(args.workspace)
  const teams = await collectTeams(workspaceRoot)
  const team = findTeam(teams, args.teamId)
  if (!team) {
    throw new Error(`Unknown team: ${args.teamId}`)
  }
  const llm = getProviderInstance(args.provider)
  if (!args.json) {
    console.error(`Running team ${team.id}…`)
  }
  const result = await runTeam({
    workspaceRoot,
    team,
    task: args.prompt,
    modelId: args.model,
    apiKey,
    baseUrl,
    signal: new AbortController().signal,
    llm,
    registry: defaultToolRegistry,
    resolvePath: (p) => resolveWithinWorkspace(workspaceRoot, p),
    getRelativePath: (p) => relative(workspaceRoot, p).replace(/\\/g, '/'),
    maxConcurrency: 3,
    onRoleStart: (role) => {
      if (!args.json) console.error(`→ role ${role.id}`)
    },
    onRoleDone: (role, out, ok) => {
      if (args.json) return
      console.error(`${ok ? '✓' : '✗'} role ${role.id}`)
      if (!ok) {
        const detail = out.replace(/\s+/g, ' ').trim().slice(0, 240)
        if (detail) console.error(`  ${detail}`)
      }
    },
  })
  if (args.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    process.stdout.write(result.synthesis)
    if (!result.synthesis.endsWith('\n')) process.stdout.write('\n')
    console.error(`\nBoard: ${result.boardPath}`)
    if (!result.success) {
      const hint = /429|quota/i.test(result.synthesis)
        ? '\nヒント: OpenAI のクォータ超過です。`-p anthropic` や `-p ollama` を試すか、課金・枠を確認してください。'
        : ''
      if (hint) console.error(hint)
    }
  }
  if (!result.success) process.exit(1)
}

async function main(): Promise<void> {
  let args: CliArgs
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(2)
    return
  }

  if (args.command === 'help') {
    printHelp()
    process.exit(0)
    return
  }

  try {
    if (args.command === 'team-list') {
      await listTeams(args)
      return
    }
    if (args.command === 'team-run') {
      await runTeamCli(args)
      return
    }

    const result = await runAgent(args)
    if (args.json) {
      console.log(
        JSON.stringify(
          {
            success: result.success,
            text: result.text,
            error: result.error,
            routing: result.routing,
          },
          null,
          2,
        ),
      )
    } else if (result.text && !result.text.endsWith('\n')) {
      process.stdout.write('\n')
    }
    if (!result.success) {
      if (!args.json && result.error) console.error(result.error)
      process.exit(1)
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

void main()
