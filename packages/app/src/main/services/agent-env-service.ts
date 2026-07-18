import { mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import {
  agentEnvCapturedPath,
  agentEnvFilePath,
  loadEnvFile,
  loadWorkspaceAgentEnv,
  mergeShellEnv,
  parseEnvFile,
} from '@codex/tools'
import { workspaceService } from './workspace'

export interface AgentEnvStatus {
  capturedKeyCount: number
  capturedAt: string | null
  agentEnvFileKeyCount: number
  hasAgentEnvFile: boolean
}

/**
 * Holds terminal-synced env overlay for Agent Shell / Hooks.
 * Also merges `.codex/agent.env` on every resolve.
 */
class AgentEnvService {
  private overlay: Record<string, string> = {}
  private capturedAt: string | null = null

  /** Apply a captured env map and persist under `.codex/.agent-env.captured`. */
  setCaptured(env: Record<string, string>, workspaceRoot?: string): void {
    this.overlay = { ...env }
    this.capturedAt = new Date().toISOString()
    const root = workspaceRoot ?? workspaceService.getRoot()
    if (!root) return
    const path = agentEnvCapturedPath(root)
    try {
      mkdirSync(dirname(path), { recursive: true })
      const body = Object.entries(this.overlay)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n')
      writeFileSync(path, `${body}\n`, 'utf-8')
    } catch {
      // persistence is best-effort; in-memory overlay still applies
    }
  }

  /** Load previously captured file into memory (e.g. after workspace open). */
  hydrateFromWorkspace(workspaceRoot: string): void {
    const fromFile = loadEnvFile(agentEnvCapturedPath(workspaceRoot))
    if (Object.keys(fromFile).length === 0) return
    this.overlay = fromFile
    if (!this.capturedAt) {
      this.capturedAt = new Date().toISOString()
    }
  }

  clear(workspaceRoot?: string): void {
    this.overlay = {}
    this.capturedAt = null
    const root = workspaceRoot ?? workspaceService.getRoot()
    if (!root) return
    try {
      unlinkSync(agentEnvCapturedPath(root))
    } catch {
      // ignore missing file
    }
  }

  /** Drop in-memory overlay without deleting the on-disk snapshot. */
  clearMemory(): void {
    this.overlay = {}
    this.capturedAt = null
  }

  resolve(workspaceRoot?: string | null): NodeJS.ProcessEnv {
    const root = workspaceRoot ?? workspaceService.getRoot()
    if (!root) {
      return mergeShellEnv(process.env, this.overlay)
    }
    return mergeShellEnv(process.env, loadWorkspaceAgentEnv(root), this.overlay)
  }

  status(workspaceRoot?: string | null): AgentEnvStatus {
    const root = workspaceRoot ?? workspaceService.getRoot()
    const fileEnv = root ? loadEnvFile(agentEnvFilePath(root)) : {}
    return {
      capturedKeyCount: Object.keys(this.overlay).length,
      capturedAt: this.capturedAt,
      agentEnvFileKeyCount: Object.keys(fileEnv).length,
      hasAgentEnvFile: Object.keys(fileEnv).length > 0,
    }
  }

  /** Parse raw env dump text (from terminal capture). */
  parseDump(content: string): Record<string, string> {
    return parseEnvFile(content)
  }
}

export const agentEnvService = new AgentEnvService()
