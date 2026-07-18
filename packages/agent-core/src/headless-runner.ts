import { relative, resolve } from 'path'
import type { AgentMessage, LLMProvider } from '@codex/llm-adapters'
import { getProviderInstance } from '@codex/llm-adapters'
import {
  DEFAULT_AGENT_PERMISSIONS,
  PERMISSION_PROFILES,
  type AgentPermissions,
  type LLMProviderId,
  type PermissionProfile,
} from '@codex/shared'
import { defaultToolRegistry, resolveWithinWorkspace, resolveAgentShellEnv } from '@codex/tools'
import {
  collectSkills,
  formatSkillPrompt,
  formatSkillUserMessage,
  parseSkillInvocation,
} from './skills-loader'
import { loadProjectContext } from './project-context'
import { loadRules } from './rules-loader'
import { loadMemory, appendMemoryNote } from './memory'
import {
  createConcurrencyLimiter,
  runSubagentTask,
} from './subagent-runner'
import { collectTeams, findTeam } from './teams-loader'
import { runTeam } from './team-runner'
import {
  AgentOrchestrator,
  type AgentOrchestratorEvent,
  type AgentRunContext,
} from './orchestrator'

const ALL_TOOLS = [
  'Read',
  'Grep',
  'Glob',
  'Write',
  'StrReplace',
  'Delete',
  'Shell',
  'Task',
  'Team',
  'WebSearch',
  'MemoryAppend',
]

export interface HeadlessAgentOptions {
  workspaceRoot: string
  /** User prompt (may start with /skill) */
  prompt: string
  provider?: LLMProviderId
  model: string
  apiKey: string
  baseUrl?: string
  maxIterations?: number
  /** Named profile; merged under explicit permissions */
  permissionProfile?: PermissionProfile
  permissions?: Partial<AgentPermissions>
  /** When true, all tools allow (overrides profile) */
  yoloMode?: boolean
  maxSubagents?: number
  autoMemory?: boolean
  signal?: AbortSignal
  onEvent?: (event: AgentOrchestratorEvent) => void
  /** Inject LLM for tests */
  llm?: LLMProvider
}

export interface HeadlessAgentResult {
  success: boolean
  text: string
  error?: string
  events: AgentOrchestratorEvent[]
}

function resolvePermissions(options: HeadlessAgentOptions): AgentPermissions {
  const profile = options.permissionProfile
    ? PERMISSION_PROFILES[options.permissionProfile]
    : DEFAULT_AGENT_PERMISSIONS
  return {
    ...DEFAULT_AGENT_PERMISSIONS,
    ...profile,
    ...options.permissions,
  }
}

/**
 * Run a single Agent turn without Electron (CLI / hooks / CI).
 * Non-interactive: approval requests are rejected unless yoloMode or edit/shell is allow.
 */
export async function runHeadlessAgent(
  options: HeadlessAgentOptions,
): Promise<HeadlessAgentResult> {
  const workspaceRoot = resolve(options.workspaceRoot)
  const provider = options.provider ?? 'openai'
  const llm = options.llm ?? getProviderInstance(provider)
  const orchestrator = new AgentOrchestrator(llm, defaultToolRegistry)
  const signal = options.signal ?? new AbortController().signal
  const permissions = resolvePermissions(options)
  const yoloMode = options.yoloMode ?? false
  const runLimited = createConcurrencyLimiter(options.maxSubagents ?? 3)

  let prompt = options.prompt
  let skillPrompt: string | undefined

  const skills = await collectSkills(workspaceRoot)
  const skillMatch = parseSkillInvocation(prompt, skills)
  if (skillMatch) {
    skillPrompt = formatSkillPrompt(skillMatch.skill, skillMatch.args)
    prompt = formatSkillUserMessage(skillMatch.skill, skillMatch.args)
  }

  const [rulesText, projectCtx, memory] = await Promise.all([
    loadRules(workspaceRoot),
    loadProjectContext(workspaceRoot),
    loadMemory(workspaceRoot),
  ])
  const rulesPrompt = `${rulesText}${projectCtx}${memory}`

  const history: AgentMessage[] = [{ role: 'user', content: prompt }]
  const events: AgentOrchestratorEvent[] = []
  let text = ''

  const ctx: AgentRunContext = {
    workspaceRoot,
    sessionId: `headless-${Date.now()}`,
    modelId: options.model,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    maxIterations: options.maxIterations ?? 50,
    enabledTools: ALL_TOOLS,
    yoloMode,
    permissions,
    signal,
    resolvePath: (p) => resolveWithinWorkspace(workspaceRoot, p),
    getRelativePath: (absolutePath) =>
      relative(workspaceRoot, absolutePath).replace(/\\/g, '/'),
    rulesPrompt,
    skillPrompt,
    subagentDepth: 0,
    getShellEnv: () => resolveAgentShellEnv(workspaceRoot),
    runSubagent: async ({ prompt: subPrompt, description }) => {
      const result = await runLimited(() =>
        runSubagentTask({
          prompt: subPrompt,
          description,
          workspaceRoot,
          sessionId: ctx.sessionId,
          modelId: options.model,
          apiKey: options.apiKey,
          baseUrl: options.baseUrl,
          signal,
          llm,
          registry: defaultToolRegistry,
          resolvePath: (p) => resolveWithinWorkspace(workspaceRoot, p),
          getRelativePath: (absolutePath) =>
            relative(workspaceRoot, absolutePath).replace(/\\/g, '/'),
          rulesPrompt,
          parentDepth: 0,
        }),
      )
      return {
        success: result.success,
        output: result.output,
        metadata: { description: result.description },
      }
    },
    runTeam: async ({ teamId, prompt: teamPrompt }) => {
      const teams = await collectTeams(workspaceRoot)
      const team = findTeam(teams, teamId)
      if (!team) {
        return { success: false, output: `Error: unknown team "${teamId}"` }
      }
      const result = await runTeam({
        workspaceRoot,
        team,
        task: teamPrompt,
        modelId: options.model,
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
        signal,
        llm,
        registry: defaultToolRegistry,
        resolvePath: (p) => resolveWithinWorkspace(workspaceRoot, p),
        getRelativePath: (absolutePath) =>
          relative(workspaceRoot, absolutePath).replace(/\\/g, '/'),
        rulesPrompt,
        maxConcurrency: options.maxSubagents ?? 3,
      })
      return {
        success: result.success,
        output: `${result.synthesis}\n\n(Board: ${result.boardPath})`,
        metadata: { teamId: result.teamId, boardPath: result.boardPath },
      }
    },
    requestApproval: async () => false,
  }

  try {
    for await (const event of orchestrator.run(history, ctx)) {
      events.push(event)
      options.onEvent?.(event)
      if (event.type === 'text_delta') {
        text += event.content
      } else if (event.type === 'error') {
        return { success: false, text, error: event.message, events }
      }
    }

    if (options.autoMemory && text.trim()) {
      await appendMemoryNote(
        workspaceRoot,
        `${prompt.slice(0, 100)} → ${text.slice(0, 180)}`,
      ).catch(() => undefined)
    }

    return { success: true, text, events }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Headless agent failed'
    return { success: false, text, error: message, events }
  }
}
