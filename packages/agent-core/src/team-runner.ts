import { mkdir, writeFile, readFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { LLMProvider } from '@codex/llm-adapters'
import type { TeamDefinition, TeamRole, TeamRunResult } from '@codex/shared'
import type { ToolRegistry } from '@codex/tools'
import { collectSkills, findSkill, formatSkillPrompt } from './skills-loader'
import {
  createConcurrencyLimiter,
  runSubagentTask,
  SUBAGENT_TOOLS,
} from './subagent-runner'
import { AgentOrchestrator } from './orchestrator'
import type { AgentMessage } from '@codex/llm-adapters'
import { DEFAULT_AGENT_PERMISSIONS, type AgentPermissions } from '@codex/shared'

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
  onRoleStart?: (role: TeamRole) => void
  onRoleDone?: (role: TeamRole, output: string, success: boolean) => void
}

function boardAbsolutePath(workspaceRoot: string, team: TeamDefinition): string {
  return join(workspaceRoot, team.boardRelativePath)
}

async function appendBoard(
  boardPath: string,
  section: string,
): Promise<void> {
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
  return [...SUBAGENT_TOOLS]
}

function rolePermissions(tools: string[]): AgentPermissions {
  const perms: AgentPermissions = {
    ...DEFAULT_AGENT_PERMISSIONS,
    read: 'allow',
    edit: 'deny',
    shell: 'deny',
    network: tools.includes('WebSearch') ? 'allow' : 'deny',
  }
  if (tools.some((t) => ['Write', 'StrReplace', 'Delete', 'MemoryAppend'].includes(t))) {
    perms.edit = 'deny' // teams stay read-only for safety in Phase D local MVP
  }
  if (tools.includes('Shell')) {
    perms.shell = 'deny'
  }
  return perms
}

/**
 * Run a local Agent Team: parallel roles → shared BOARD.md → synthesizer.
 * Cloud / remote execution is intentionally out of scope (see Phase D gate doc).
 */
export async function runTeam(options: RunTeamOptions): Promise<TeamRunResult> {
  const {
    workspaceRoot,
    team,
    task,
    signal,
  } = options
  const boardPath = boardAbsolutePath(workspaceRoot, team)
  const runLimited = createConcurrencyLimiter(options.maxConcurrency ?? 3)
  const skills = await collectSkills(workspaceRoot)
  const workers = team.roles.filter((r) => !r.synthesize)
  const synthesizers = team.roles.filter((r) => r.synthesize)

  await appendBoard(
    boardPath,
    `## Run ${new Date().toISOString()}\n\n**Task:** ${task}\n`,
  )

  const roleReports: TeamRunResult['roleReports'] = []

  const workerJobs = workers.map((role) =>
    runLimited(async () => {
      if (signal.aborted) {
        return { role, success: false, output: 'Cancelled' }
      }
      options.onRoleStart?.(role)
      const skill = role.skill ? findSkill(skills, role.skill) : undefined
      const skillPrompt = skill ? formatSkillPrompt(skill, task) : undefined
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
        permissions: rolePermissions(tools),
        skillPrompt,
      })

      const section = `### Role: ${role.name} (\`${role.id}\`)\n\n${result.output}`
      await appendBoard(boardPath, section)
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

  if (allWorkersFailed) {
    synthesis = [
      'チームの全ロールが失敗したため、統合（synthesizer）をスキップしました。',
      '',
      ...workerResults.map((r) => `### ${r.role.name} (\`${r.role.id}\`)\n${r.output}`),
      '',
      'よくある原因: API クォータ超過 (429)、API キー未設定、モデル名・プロバイダの不一致。',
      '対処例: 別プロバイダ (`-p anthropic` / `-p ollama`)、課金・枠の確認、時間をおいて再実行。',
    ].join('\n')
    await appendBoard(boardPath, `### Synthesis (skipped)\n\n${synthesis}`)
    if (synthRole) {
      options.onRoleDone?.(synthRole, synthesis, false)
      roleReports.push({ roleId: synthRole.id, success: false, output: synthesis })
    }
  } else if (synthRole && !signal.aborted) {
    options.onRoleStart?.(synthRole)
    const tools = roleTools(synthRole).filter((t) => t !== 'Task' && t !== 'Team')
    const orchestrator = new AgentOrchestrator(options.llm, options.registry)
    const history: AgentMessage[] = [
      {
        role: 'user',
        content: `You are the team lead synthesizer (${synthRole.name}).
Goal: ${synthRole.goal}

Original task:
${task}

Shared board from parallel roles:
---
${boardContent.slice(0, 40_000)}
---

Produce a prioritized merged report (Critical / Should fix / Nice to have). Reply in the user's language.`,
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
        permissions: rolePermissions(tools),
        signal,
        resolvePath: options.resolvePath,
        getRelativePath: options.getRelativePath,
        rulesPrompt: options.rulesPrompt ?? '',
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

    await appendBoard(boardPath, `### Synthesis (${synthRole.name})\n\n${synthesis}`)
    options.onRoleDone?.(synthRole, synthesis, !synthesis.startsWith('Synthesizer error'))
    roleReports.push({
      roleId: synthRole.id,
      success: !synthesis.startsWith('Synthesizer error'),
      output: synthesis,
    })
  } else {
    synthesis = workerResults.map((r) => `## ${r.role.name}\n${r.output}`).join('\n\n')
  }

  const success = roleReports.every((r) => r.success) || roleReports.some((r) => r.success)
  return {
    teamId: team.id,
    success,
    boardPath,
    roleReports,
    synthesis,
  }
}
