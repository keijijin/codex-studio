import { mkdir, writeFile, readFile } from 'fs/promises'
import { dirname, join } from 'path'
import { randomUUID } from 'crypto'
import type { LLMProvider } from '@codex/llm-adapters'
import type {
  ApprovalRequest,
  CeoApprovalRequest,
  CeoApprovalResponse,
  TeamDefinition,
  TeamPipelineStage,
  TeamRole,
  TeamRunResult,
} from '@codex/shared'
import { DEFAULT_AGENT_PERMISSIONS, type AgentPermissions } from '@codex/shared'
import type { ToolRegistry } from '@codex/tools'
import { collectSkills, findSkill, formatSkillPrompt } from './skills-loader'
import { collectPersonas, findPersona, formatPersonaPrompt } from './personas-loader'
import { homedir } from 'os'
import { join as pathJoin } from 'path'
import {
  createConcurrencyLimiter,
  runSubagentTask,
  SUBAGENT_TOOLS,
} from './subagent-runner'
import { AgentOrchestrator } from './orchestrator'
import type { AgentMessage } from '@codex/llm-adapters'

const EXECUTOR_DEFAULT_TOOLS = [
  'Read',
  'Grep',
  'Glob',
  'Write',
  'StrReplace',
  'Delete',
  'Shell',
  'MemoryAppend',
]

export interface RunTeamOptions {
  workspaceRoot: string
  team: TeamDefinition
  task: string
  modelId: string
  apiKey: string
  baseUrl?: string
  signal: AbortSignal
  llm: LLMProvider
  registry: ToolRegistry
  resolvePath: (path: string) => string
  getRelativePath: (absolutePath: string) => string
  rulesPrompt?: string
  maxConcurrency?: number
  maxIterationsPerRole?: number
  maxIterationsExecute?: number
  sessionId?: string
  onRoleStart?: (role: TeamRole) => void
  onRoleDone?: (role: TeamRole, output: string, success: boolean) => void
  onStage?: (stage: TeamPipelineStage, detail?: string) => void
  /** Human CEO gate (required when pipeline.requireCeoApproval) */
  requestCeoApproval?: (request: CeoApprovalRequest) => Promise<CeoApprovalResponse>
  /** Per-tool approval during execute stage */
  requestApproval?: (request: ApprovalRequest) => Promise<boolean>
  onFileChanged?: (absolutePath: string) => void
  onWorkspaceChanged?: () => void
  getShellEnv?: () => NodeJS.ProcessEnv
  /** Also load personas from ~/.codex-studio/personas (and extras) */
  globalPersonasDir?: string
  extraPersonasDirs?: string[]
}

function boardAbsolutePath(workspaceRoot: string, team: TeamDefinition): string {
  return join(workspaceRoot, team.boardRelativePath)
}

async function appendBoard(boardPath: string, section: string): Promise<void> {
  await mkdir(dirname(boardPath), { recursive: true })
  let existing = ''
  try {
    existing = await readFile(boardPath, 'utf-8')
  } catch {
    existing = `# Team board\n\nShared findings for this team run.\n`
  }
  await writeFile(boardPath, `${existing.trimEnd()}\n\n${section.trim()}\n`, 'utf-8')
}

function roleTools(role: TeamRole): string[] {
  if (role.tools?.length) return role.tools
  if (role.execute) return [...EXECUTOR_DEFAULT_TOOLS]
  return [...SUBAGENT_TOOLS]
}

function researchPermissions(tools: string[]): AgentPermissions {
  return {
    ...DEFAULT_AGENT_PERMISSIONS,
    read: 'allow',
    edit: 'deny',
    shell: 'deny',
    media: 'deny',
    network: tools.includes('WebSearch') ? 'allow' : 'deny',
  }
}

function executePermissions(tools: string[]): AgentPermissions {
  const editTools = ['Write', 'StrReplace', 'Delete', 'MemoryAppend']
  return {
    ...DEFAULT_AGENT_PERMISSIONS,
    read: 'allow',
    edit: tools.some((t) => editTools.includes(t)) ? 'ask' : 'deny',
    shell: tools.includes('Shell') ? 'ask' : 'deny',
    network: tools.includes('WebSearch') ? 'allow' : 'deny',
    media: 'deny',
  }
}

function parseSuggestedCeoDecision(
  brief: string,
): CeoApprovalResponse['decision'] | undefined {
  const head = brief.slice(0, 800)
  if (/条件付き承認|conditional/i.test(head)) return 'conditional'
  if (/差し戻し|reject/i.test(head)) return 'reject'
  if (/見送り|defer|保留/i.test(head)) return 'defer'
  if (/承認|approve|\bGo\b/i.test(head) && !/未承認|不承認/.test(head)) return 'approve'
  return undefined
}

async function runExecutorRole(opts: {
  role: TeamRole
  team: TeamDefinition
  task: string
  synthesis: string
  ceoNote?: string
  boardContent: string
  options: RunTeamOptions
  personaPrompt?: string
  skillPrompt?: string
}): Promise<{ success: boolean; output: string }> {
  const { role, team, task, synthesis, ceoNote, boardContent, options, personaPrompt, skillPrompt } =
    opts
  const tools = roleTools(role).filter((t) => t !== 'Task' && t !== 'Team')
  const orchestrator = new AgentOrchestrator(options.llm, options.registry)
  const history: AgentMessage[] = [
    {
      role: 'user',
      content: `You are the execution lead (${role.name}) for team "${team.name}".
Goal: ${role.goal}

Original task:
${task}

CEO decision brief:
---
${synthesis.slice(0, 12_000)}
---

${ceoNote ? `Human CEO notes (must follow):\n${ceoNote}\n` : ''}
Board excerpt:
---
${boardContent.slice(0, 20_000)}
---

Implement the approved decision responsibly:
- Make concrete code/doc changes with Write/StrReplace when needed
- Prefer minimal diffs; do not expand scope
- Run Shell only when necessary to verify
- If blocked (missing approval, unclear requirement), stop and report blockers
- End with: what changed, how to verify, remaining risks
Reply in the user's language.`,
    },
  ]

  let text = ''
  let hadError = false
  try {
    for await (const event of orchestrator.run(history, {
      workspaceRoot: options.workspaceRoot,
      sessionId: options.sessionId
        ? `${options.sessionId}:exec:${role.id}`
        : `team-${team.id}-exec-${role.id}`,
      modelId: options.modelId,
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      maxIterations: options.maxIterationsExecute ?? 40,
      enabledTools: tools.length ? tools : [...EXECUTOR_DEFAULT_TOOLS],
      yoloMode: false,
      permissions: executePermissions(tools),
      signal: options.signal,
      resolvePath: options.resolvePath,
      getRelativePath: options.getRelativePath,
      onFileChanged: options.onFileChanged,
      onWorkspaceChanged: options.onWorkspaceChanged,
      getShellEnv: options.getShellEnv,
      rulesPrompt: options.rulesPrompt ?? '',
      skillPrompt,
      personaPrompt,
      subagentDepth: 0,
      requestApproval: options.requestApproval ?? (async () => false),
    })) {
      if (event.type === 'text_delta') text += event.content
      else if (event.type === 'error') {
        hadError = true
        text += `\n\nError: ${event.message}`
      }
    }
  } catch (err) {
    return {
      success: false,
      output: err instanceof Error ? err.message : 'Executor failed',
    }
  }

  return {
    success: !hadError && Boolean(text.trim()),
    output: text.trim() || '(no execution output)',
  }
}

/**
 * Multi-stage local Agent Team:
 * research (parallel) → decide (CEO persona) → [CEO approval UI] → execute.
 */
export async function runTeam(options: RunTeamOptions): Promise<TeamRunResult> {
  const { workspaceRoot, team, task, signal } = options
  const boardPath = boardAbsolutePath(workspaceRoot, team)
  const runLimited = createConcurrencyLimiter(options.maxConcurrency ?? 3)
  const stagesCompleted: TeamPipelineStage[] = []
  const pipeline = team.pipeline ?? {}
  const requireCeoApproval = pipeline.requireCeoApproval === true
  const executeAfterApprove = pipeline.executeAfterApprove !== false

  const globalPersonas =
    options.globalPersonasDir ?? pathJoin(homedir(), '.codex-studio', 'personas')
  const [skills, personas] = await Promise.all([
    collectSkills(workspaceRoot),
    collectPersonas(workspaceRoot, {
      globalPersonasDir: globalPersonas,
    }),
  ])
  // Merge optional extra persona dirs (e.g. product repo .codex/personas while -w is elsewhere)
  if (options.extraPersonasDirs?.length) {
    for (const dir of options.extraPersonasDirs) {
      const extra = await collectPersonas(workspaceRoot, { globalPersonasDir: dir })
      for (const p of extra) {
        if (!personas.some((x) => x.name === p.name)) personas.push(p)
      }
    }
  }

  const workers = team.roles.filter((r) => !r.synthesize && !r.execute)
  const synthesizers = team.roles.filter((r) => r.synthesize && !r.execute)
  const executors = team.roles.filter((r) => r.execute)

  const emitStage = (stage: TeamPipelineStage, detail?: string) => {
    stagesCompleted.push(stage)
    options.onStage?.(stage, detail)
  }

  const pushBoard = async (section: string) => {
    await appendBoard(boardPath, section)
    options.onFileChanged?.(boardPath)
  }

  await pushBoard(`## Run ${new Date().toISOString()}\n\n**Task:** ${task}\n`)

  const roleReports: TeamRunResult['roleReports'] = []

  // —— Stage 1: research ——
  emitStage('research', `${workers.length} roles`)
  const workerJobs = workers.map((role) =>
    runLimited(async () => {
      if (signal.aborted) {
        return { role, success: false, output: 'Cancelled' }
      }
      options.onRoleStart?.(role)
      const skill = role.skill ? findSkill(skills, role.skill) : undefined
      const skillPrompt = skill ? formatSkillPrompt(skill, task) : undefined
      const persona = role.persona ? findPersona(personas, role.persona) : undefined
      const personaPrompt = persona ? formatPersonaPrompt(persona) : undefined
      const tools = roleTools(role).filter((t) => t !== 'Task' && t !== 'Team')

      const result = await runSubagentTask({
        prompt: `${role.goal}\n\nUser task:\n${task}`,
        description: `${team.id}/${role.id}`,
        workspaceRoot,
        sessionId: `team-${team.id}-${role.id}`,
        modelId: options.modelId,
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
        signal,
        llm: options.llm,
        registry: options.registry,
        resolvePath: options.resolvePath,
        getRelativePath: options.getRelativePath,
        rulesPrompt: options.rulesPrompt,
        maxIterations: options.maxIterationsPerRole ?? 12,
        parentDepth: 0,
        enabledTools: tools,
        permissions: researchPermissions(tools),
        skillPrompt,
        personaPrompt,
      })

      const section = `### Role: ${role.name} (\`${role.id}\`)\n\n${result.output}`
      await pushBoard(section)
      options.onRoleDone?.(role, result.output, result.success)
      return { role, success: result.success, output: result.output }
    }),
  )

  const workerResults = await Promise.all(workerJobs)
  for (const r of workerResults) {
    roleReports.push({ roleId: r.role.id, success: r.success, output: r.output })
  }

  let boardContent = ''
  try {
    boardContent = await readFile(boardPath, 'utf-8')
  } catch {
    boardContent = '(empty board)'
  }

  let synthesis = ''
  const synthRole = synthesizers[0]
  const allWorkersFailed = workers.length > 0 && workerResults.every((r) => !r.success)

  // —— Stage 2: decide ——
  emitStage('decide', synthRole?.name)

  if (allWorkersFailed) {
    synthesis = [
      'チームの全ロールが失敗したため、統合（synthesizer）をスキップしました。',
      '',
      ...workerResults.map((r) => `### ${r.role.name} (\`${r.role.id}\`)\n${r.output}`),
      '',
      'よくある原因: API クォータ超過 (429)、API キー未設定、モデル名・プロバイダの不一致。',
    ].join('\n')
    await pushBoard(`### Synthesis (skipped)\n\n${synthesis}`)
    if (synthRole) {
      options.onRoleDone?.(synthRole, synthesis, false)
      roleReports.push({ roleId: synthRole.id, success: false, output: synthesis })
    }
    emitStage('done', 'research failed')
    return {
      teamId: team.id,
      success: false,
      boardPath,
      roleReports,
      synthesis,
      stagesCompleted,
      error: 'All research roles failed',
    }
  }

  if (synthRole && !signal.aborted) {
    options.onRoleStart?.(synthRole)
    const tools = roleTools(synthRole).filter((t) => t !== 'Task' && t !== 'Team')
    const synthPersona = synthRole.persona ? findPersona(personas, synthRole.persona) : undefined
    const synthPersonaPrompt = synthPersona ? formatPersonaPrompt(synthPersona) : undefined
    if (!synthPersonaPrompt && synthRole.persona) {
      console.warn(`[team] persona "${synthRole.persona}" not found for synthesizer`)
    }
    const orchestrator = new AgentOrchestrator(options.llm, options.registry)
    const history: AgentMessage[] = [
      {
        role: 'user',
        content: `You are the team synthesizer / decision lead (${synthRole.name}).
Goal: ${synthRole.goal}

Original task:
${task}

Shared board from parallel roles:
---
${boardContent.slice(0, 40_000)}
---

Follow your Goal and Persona (injected in system). Merge without duplicating findings.
If the Goal asks for a decision, end with a clear decision label and next actions for an executor.
Otherwise produce a prioritized merged report (Critical / Should fix / Nice to have).
Reply in the user's language.`,
      },
    ]

    let text = ''
    try {
      for await (const event of orchestrator.run(history, {
        workspaceRoot,
        sessionId: `team-${team.id}-synth`,
        modelId: options.modelId,
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
        maxIterations: options.maxIterationsPerRole ?? 8,
        enabledTools: tools.length ? tools : [...SUBAGENT_TOOLS],
        yoloMode: false,
        permissions: researchPermissions(tools),
        signal,
        resolvePath: options.resolvePath,
        getRelativePath: options.getRelativePath,
        rulesPrompt: options.rulesPrompt ?? '',
        personaPrompt: synthPersonaPrompt,
        subagentDepth: 1,
        requestApproval: async () => false,
      })) {
        if (event.type === 'text_delta') text += event.content
        else if (event.type === 'error') {
          synthesis = `Synthesizer error: ${event.message}`
          break
        }
      }
      if (!synthesis) synthesis = text.trim() || '(no synthesis)'
    } catch (err) {
      synthesis = err instanceof Error ? err.message : 'Synthesizer failed'
    }

    await pushBoard(`### Synthesis (${synthRole.name})\n\n${synthesis}`)
    options.onRoleDone?.(synthRole, synthesis, !synthesis.startsWith('Synthesizer error'))
    roleReports.push({
      roleId: synthRole.id,
      success: !synthesis.startsWith('Synthesizer error'),
      output: synthesis,
    })
  } else {
    synthesis = workerResults.map((r) => `## ${r.role.name}\n${r.output}`).join('\n\n')
  }

  // —— Stage 3: CEO approval (optional) ——
  let ceoDecision: TeamRunResult['ceoDecision']
  let ceoNote: string | undefined
  const shouldGate =
    requireCeoApproval && executors.length > 0 && executeAfterApprove && !signal.aborted

  if (shouldGate) {
    emitStage('await_approval', 'Waiting for human CEO')
    const approvalId = randomUUID()
    const request: CeoApprovalRequest = {
      approvalId,
      teamId: team.id,
      teamName: team.name,
      task,
      decisionBrief: synthesis,
      boardPath,
      boardRelativePath: team.boardRelativePath,
      suggestedDecision: parseSuggestedCeoDecision(synthesis),
    }

    let response: CeoApprovalResponse
    if (options.requestCeoApproval) {
      response = await options.requestCeoApproval(request)
    } else {
      response = {
        decision: 'defer',
        note: 'No CEO approval handler (headless) — execution skipped',
      }
    }

    ceoDecision = response.decision
    ceoNote = response.note
    await pushBoard(
      `### Human CEO decision\n\n- **Decision:** ${response.decision}\n${
        response.note ? `- **Note:** ${response.note}\n` : ''
      }`,
    )

    if (response.decision === 'reject' || response.decision === 'defer') {
      emitStage('cancelled', response.decision)
      const msg =
        response.decision === 'reject'
          ? '社長承認で差し戻しとなったため、実装を中止しました。'
          : '社長承認が見送り/タイムアウトのため、実装を中止しました。'
      return {
        teamId: team.id,
        success: false,
        boardPath,
        roleReports,
        synthesis: `${synthesis}\n\n---\n\n${msg}${ceoNote ? `\n\nメモ: ${ceoNote}` : ''}`,
        ceoDecision,
        stagesCompleted,
        error:
          response.decision === 'reject'
            ? 'CEO rejected the plan'
            : 'CEO deferred; execution skipped',
      }
    }
  }

  // —— Stage 4: execute ——
  let execution = ''
  const shouldExecute =
    executors.length > 0 &&
    executeAfterApprove &&
    (!requireCeoApproval || ceoDecision === 'approve' || ceoDecision === 'conditional')

  if (shouldExecute && !signal.aborted) {
    emitStage('execute', executors.map((e) => e.name).join(', '))
    try {
      boardContent = await readFile(boardPath, 'utf-8')
    } catch {
      /* keep */
    }

    for (const role of executors) {
      if (signal.aborted) break
      options.onRoleStart?.(role)
      const skill = role.skill ? findSkill(skills, role.skill) : undefined
      const skillPrompt = skill ? formatSkillPrompt(skill, task) : undefined
      const persona = role.persona ? findPersona(personas, role.persona) : undefined
      const personaPrompt = persona ? formatPersonaPrompt(persona) : undefined

      const result = await runExecutorRole({
        role,
        team,
        task,
        synthesis,
        ceoNote,
        boardContent,
        options,
        personaPrompt,
        skillPrompt,
      })

      execution = execution
        ? `${execution}\n\n### ${role.name}\n\n${result.output}`
        : result.output
      await pushBoard(`### Execution (${role.name})\n\n${result.output}`)
      options.onRoleDone?.(role, result.output, result.success)
      roleReports.push({
        roleId: role.id,
        success: result.success,
        output: result.output,
      })
    }
  }

  emitStage('done')

  const finalText = execution
    ? `${synthesis}\n\n---\n\n## 実装結果\n\n${execution}`
    : synthesis

  const executorIds = new Set(executors.map((e) => e.id))
  const executorReports = roleReports.filter((r) => executorIds.has(r.roleId))
  const researchOk = roleReports
    .filter((r) => !executorIds.has(r.roleId))
    .every((r) => r.success)
  const executeOk =
    !shouldExecute ||
    (executorReports.length === executors.length &&
      executorReports.every((r) => r.success) &&
      !signal.aborted)
  const success = roleReports.length > 0 && researchOk && executeOk

  return {
    teamId: team.id,
    success,
    boardPath,
    roleReports,
    synthesis: finalText,
    execution: execution || undefined,
    ceoDecision,
    stagesCompleted,
    error: success
      ? undefined
      : shouldExecute && !executeOk
        ? 'Executor stage failed or incomplete'
        : 'One or more team roles failed',
  }
}
