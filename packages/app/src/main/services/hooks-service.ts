import { join } from 'path'
import {
  HooksRuntime,
  runHeadlessAgent,
  type HookDispatchContext,
  type HookRunResult,
} from '@codex/agent-core'
import { getLlmRuntimeConfig } from './llm-config'
import { settingsService } from './settings'
import { workspaceService } from './workspace'
import { auditLog } from './audit-log'

/**
 * Electron-side hooks service.
 * Skill actions run a headless agent using current settings (non-interactive approvals = deny).
 */
class HooksService {
  private runtime: HooksRuntime

  constructor() {
    this.runtime = new HooksRuntime({
      runSkill: async (skill, args, ctx) => {
        const settings = settingsService.get()
        const runtime = getLlmRuntimeConfig(settings, 'agent')
        if (!runtime.apiKey && runtime.provider !== 'ollama') {
          return { success: false, output: `Missing API key for ${runtime.provider}` }
        }
        const prompt = args ? `/${skill} ${args}` : `/${skill}`
        const result = await runHeadlessAgent({
          workspaceRoot: ctx.workspaceRoot,
          prompt,
          provider: runtime.provider,
          model: runtime.model,
          apiKey: runtime.apiKey || 'ollama',
          baseUrl: runtime.baseUrl,
          maxIterations: settings.agent.maxIterations,
          permissions: settings.agent.permissions,
          yoloMode: settings.agent.yoloMode,
        })
        return {
          success: result.success,
          output: result.error ?? result.text.slice(0, 2000),
        }
      },
    })
  }

  get isRunning(): boolean {
    return this.runtime.isRunning
  }

  async onFileSave(absolutePath: string): Promise<HookRunResult[]> {
    const root = workspaceService.getRoot()
    if (!root) return []
    if (this.runtime.isRunning) return []

    const ctx: HookDispatchContext = {
      workspaceRoot: root,
      filePath: absolutePath,
      relativePath: workspaceService.getRelativePath(absolutePath),
    }
    const results = await this.runtime.dispatch('onFileSave', ctx)
    if (results.length > 0) {
      void auditLog('hooks:onFileSave', {
        path: absolutePath,
        results: results.map((r) => ({ type: r.type, success: r.success })),
      })
    }
    return results
  }

  async onAgentComplete(sessionId: string): Promise<HookRunResult[]> {
    const root = workspaceService.getRoot()
    if (!root) return []
    if (this.runtime.isRunning) return []

    const results = await this.runtime.dispatch('onAgentComplete', {
      workspaceRoot: root,
      sessionId,
    })
    if (results.length > 0) {
      void auditLog('hooks:onAgentComplete', {
        sessionId,
        results: results.map((r) => ({ type: r.type, success: r.success })),
      })
    }
    return results
  }
}

export const hooksService = new HooksService()

/** Convenience for tests / sample path */
export function hooksConfigPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.codex', 'hooks.json')
}
