import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join, relative, resolve } from 'path'
import type { AgentMessage, LLMProvider } from '@codex/llm-adapters'
import { getProviderInstance } from '@codex/llm-adapters'
import {
  DEFAULT_AGENT_PERMISSIONS,
  PERMISSION_PROFILES,
  createDefaultPathIgnore,
  type AgentPermissions,
  type LLMProviderId,
  type PermissionProfile,
} from '@codex/shared'
import {
  createWorkspaceFs,
  defaultToolRegistry,
  resolveWithinWorkspace,
  resolveAgentShellEnv,
} from '@codex/tools'
import {
  collectSkills,
  formatSkillPrompt,
  formatSkillUserMessage,
  parseSkillInvocation,
} from './skills-loader'
import {
  collectPersonas,
  findPersona,
  formatPersonaPrompt,
  formatPersonaUserMessage,
  parsePersonaInvocation,
} from './personas-loader'
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
  'GitStatus',
  'Write',
  'StrReplace',
  'Delete',
  'Shell',
  'Task',
  'Team',
  'WebSearch',
  'MemoryAppend',
  'GenerateVideo',
  'GeneratePresentation',
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
  /** Video generation settings (GenerateVideo) */
  video?: import('@codex/shared').VideoSettings
  runwayApiKey?: string
  /** Presentation generation settings (GeneratePresentation) */
  presentation?: import('@codex/shared').PresentationSettings
  /** Default persona when prompt has no `/persona` */
  defaultPersona?: string
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
  let personaPrompt: string | undefined

  const globalPersonas = join(homedir(), '.codex-studio', 'personas')
  const personas = await collectPersonas(workspaceRoot, {
    globalPersonasDir: globalPersonas,
  })
  const personaMatch = parsePersonaInvocation(prompt, personas)
  if (personaMatch) {
    personaPrompt = formatPersonaPrompt(personaMatch.persona)
    prompt = personaMatch.args || formatPersonaUserMessage(personaMatch.persona, '')
  } else if (options.defaultPersona) {
    const persona = findPersona(personas, options.defaultPersona)
    if (persona) personaPrompt = formatPersonaPrompt(persona)
  }

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

  let gitignoreContent = ''
  try {
    gitignoreContent = readFileSync(join(workspaceRoot, '.gitignore'), 'utf-8')
  } catch {
    gitignoreContent = ''
  }
  const pathIgnore = createDefaultPathIgnore({
    gitignoreContent,
    showBuildOutputs: false,
  })

  const workspaceFs = createWorkspaceFs(workspaceRoot)
  const workspaceTrusted =
    process.env.CODEX_TRUST_WORKSPACE === '1' ||
    Boolean(process.env.CODEX_E2E_WORKSPACE) ||
    process.env.CODEX_CLI_TRUST_WORKSPACE === '1'
  const ctx: AgentRunContext = {
    workspaceRoot,
    sessionId: `headless-${Date.now()}`,
    modelId: options.model,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    maxIterations: options.maxIterations ?? 50,
    enabledTools: ALL_TOOLS,
    yoloMode,
    permissions: workspaceTrusted
      ? permissions
      : {
          ...permissions,
          network: permissions.network === 'deny' ? 'deny' : 'ask',
        },
    secretReadPolicy: workspaceTrusted ? 'ask' : 'deny',
    signal,
    fs: workspaceFs,
    resolvePath: (p) => workspaceFs.resolve(p),
    getRelativePath: (absolutePath) =>
      relative(workspaceRoot, absolutePath).replace(/\\/g, '/'),
    isIgnoredPath: (rel) => pathIgnore.ignores(rel),
    rulesPrompt,
    skillPrompt,
    personaPrompt,
    subagentDepth: 0,
    getShellEnv: () => {
      // CLI/headless has no trust dialog — only apply workspace overlays when explicitly trusted.
      if (
        process.env.CODEX_TRUST_WORKSPACE === '1' ||
        process.env.CODEX_E2E_WORKSPACE ||
        process.env.CODEX_CLI_TRUST_WORKSPACE === '1'
      ) {
        return resolveAgentShellEnv(workspaceRoot)
      }
      return { ...process.env }
    },
    getVideoConfig: () => ({
      video: options.video ?? {
        enabled: true,
        mode: 'hybrid' as const,
        runwayModel: 'gen4.5',
        ttsProvider: 'openai' as const,
        ttsVoice: 'alloy',
        maxShots: 12,
        maxGenerativeShots: 4,
        outputDir: 'videos',
        runwayApiKey: options.runwayApiKey,
      },
      openaiApiKey: options.apiKey || process.env.OPENAI_API_KEY,
      runwayApiKey:
        options.runwayApiKey ||
        process.env.RUNWAYML_API_SECRET ||
        process.env.RUNWAY_API_KEY,
    }),
    getPresentationConfig: () => ({
      presentation: options.presentation ?? {
        enabled: true,
        themeId: 'midnight' as const,
        maxSlides: 16,
        includeNotes: true,
        outputDir: 'presentations',
      },
      openaiApiKey: options.apiKey || process.env.OPENAI_API_KEY,
    }),
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
      const teams = await collectTeams(workspaceRoot, {
        extraTeamsDirs: [
          join(homedir(), '.codex-studio', 'teams'),
          join(process.cwd(), '.codex', 'teams'),
        ],
      })
      const team = findTeam(teams, teamId)
      if (!team) {
        const available = teams.map((t) => t.id).join(', ') || '(none)'
        return {
          success: false,
          output: `Error: unknown team "${teamId}". Available: ${available}`,
        }
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
        globalPersonasDir: globalPersonas,
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
