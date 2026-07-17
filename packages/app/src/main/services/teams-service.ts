import { collectTeams, findTeam, parseTeamInvocation, runTeam } from '@codex/agent-core'
import type { TeamDefinition } from '@codex/shared'
import { getProviderInstance } from '@codex/llm-adapters'
import { defaultToolRegistry } from '@codex/tools'
import { getLlmRuntimeConfig } from './llm-config'
import { rulesService } from './rules-service'
import { settingsService } from './settings'
import { workspaceService } from './workspace'

export class TeamsService {
  async list(): Promise<TeamDefinition[]> {
    const root = workspaceService.getRoot()
    if (!root) return []
    return collectTeams(root)
  }

  async matchInvocation(content: string) {
    const teams = await this.list()
    if (teams.length === 0) return null
    return parseTeamInvocation(content, teams)
  }

  async run(teamId: string, prompt: string, signal?: AbortSignal) {
    const root = workspaceService.getRoot()
    if (!root) throw new Error('Open a workspace first')
    const teams = await collectTeams(root)
    const team = findTeam(teams, teamId)
    if (!team) throw new Error(`Unknown team: ${teamId}`)

    const settings = settingsService.get()
    const runtime = getLlmRuntimeConfig(settings, 'agent')
    if (!runtime.apiKey && runtime.provider !== 'ollama') {
      throw new Error(`Missing API key for ${runtime.provider}`)
    }
    const rulesPrompt = await rulesService.buildPrompt([])
    const llm = getProviderInstance(runtime.provider)

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
    })
  }
}

export const teamsService = new TeamsService()
