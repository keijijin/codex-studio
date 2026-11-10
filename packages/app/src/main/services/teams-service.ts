import { homedir } from 'os'
import { join } from 'path'
import {
  collectTeams,
  findTeam,
  materializeBuiltinTeams,
  parseTeamInvocation,
  runTeam,
} from '@codex/agent-core'
import type {
  ApprovalRequest,
  CeoApprovalRequest,
  CeoApprovalResponse,
  TeamDefinition,
  TeamPipelineStage,
  TeamRunResult,
} from '@codex/shared'
import { getProviderInstance } from '@codex/llm-adapters'
import { defaultToolRegistry } from '@codex/tools'
import { getLlmRuntimeConfig } from './llm-config'
import { rulesService } from './rules-service'
import { settingsService } from './settings'
import { workspaceService } from './workspace'
import { ceoApprovalService } from './ceo-approval'
import { agentEnvService } from './agent-env-service'
import { workspaceTrustService } from './workspace-trust'

export function globalTeamsDir(): string {
  return join(homedir(), '.codex-studio', 'teams')
}

export interface TeamRunUiContext {
  sessionId: string
  emit: (event: {
    type: string
    [key: string]: unknown
  }) => void
  requestToolApproval?: (request: ApprovalRequest) => Promise<boolean>
  onFileChanged?: (absolutePath: string) => void
  onWorkspaceChanged?: () => void
}

export class TeamsService {
  private materializePromise: Promise<void> | null = null

  private ensureBuiltins(): Promise<void> {
    if (!this.materializePromise) {
      this.materializePromise = materializeBuiltinTeams().catch((err) => {
        console.warn('[teams] failed to materialize builtins:', err)
      })
    }
    return this.materializePromise
  }

  async list(): Promise<TeamDefinition[]> {
    await this.ensureBuiltins()
    const root = workspaceService.getRoot()
    const extra = [globalTeamsDir()]
    if (!root) {
      return collectTeams(homedir(), {
        extraTeamsDirs: extra,
        includeWorkspaceTeams: false,
      })
    }
    const trusted = workspaceTrustService.isTrusted(root)
    return collectTeams(root, {
      extraTeamsDirs: extra,
      includeWorkspaceTeams: trusted,
    })
  }

  async findById(id: string): Promise<TeamDefinition | undefined> {
    const teams = await this.list()
    return findTeam(teams, id)
  }

  async matchInvocation(content: string) {
    const teams = await this.list()
    if (teams.length === 0) return null
    return parseTeamInvocation(content, teams)
  }

  /**
   * `/virtual-company …` skill name that matches a team id → treat as team run.
   */
  async matchSkillAsTeam(skillName: string, args: string) {
    const team = await this.findById(skillName)
    if (!team) return null
    return { team, args }
  }

  async run(
    teamId: string,
    prompt: string,
    signal?: AbortSignal,
    ui?: TeamRunUiContext,
  ): Promise<TeamRunResult> {
    const root = workspaceService.getRoot()
    if (!root) throw new Error('Open a workspace first')
    await this.ensureBuiltins()
    const teams = await this.list()
    const team = findTeam(teams, teamId)
    if (!team) {
      const available = teams.map((t) => t.id).join(', ') || '(none)'
      throw new Error(
        `Unknown team: ${teamId}. Available: ${available}. ` +
          `Built-ins: virtual-company, review-squad. ` +
          `Or add .codex/teams/<id>/team.json`,
      )
    }

    const settings = settingsService.get()
    const runtime = getLlmRuntimeConfig(settings, 'agent')
    if (!runtime.apiKey && runtime.provider !== 'ollama' && runtime.provider !== 'llamacpp') {
      throw new Error(`Missing API key for ${runtime.provider}`)
    }
    const rulesPrompt = await rulesService.buildPrompt([])
    const llm = getProviderInstance(runtime.provider)
    const sessionId = ui?.sessionId ?? `headless-team-${Date.now()}`

    return runTeam({
      workspaceRoot: root,
      team,
      task: prompt,
      modelId: runtime.model,
      apiKey: runtime.apiKey || 'ollama',
      baseUrl: runtime.baseUrl,
      signal: signal ?? new AbortController().signal,
      llm,
      registry: defaultToolRegistry,
      resolvePath: (p) => workspaceService.resolveWithinWorkspace(p),
      getRelativePath: (p) => workspaceService.getRelativePath(p),
      rulesPrompt,
      maxConcurrency: settings.agent.maxSubagents ?? 3,
      sessionId,
      globalPersonasDir: join(homedir(), '.codex-studio', 'personas'),
      includeWorkspacePersonas: workspaceTrustService.isTrusted(root),
      includeWorkspaceSkills: workspaceTrustService.isTrusted(root),
      getShellEnv: () => agentEnvService.resolve(root),
      onFileChanged: ui?.onFileChanged,
      onWorkspaceChanged: ui?.onWorkspaceChanged,
      onStage: (stage: TeamPipelineStage, detail?: string) => {
        ui?.emit({ type: 'team_stage', stage, teamId: team.id, detail })
      },
      requestCeoApproval: ui
        ? async (request: CeoApprovalRequest) => {
            ui.emit({ type: 'ceo_approval_required', request })
            return ceoApprovalService.wait(sessionId, request.approvalId)
          }
        : undefined,
      requestApproval: ui?.requestToolApproval
        ? ui.requestToolApproval
        : async () => false,
    })
  }

  respondCeoApproval(
    sessionId: string,
    approvalId: string,
    response: CeoApprovalResponse,
  ): void {
    ceoApprovalService.respond(sessionId, approvalId, response)
  }
}

export const teamsService = new TeamsService()
