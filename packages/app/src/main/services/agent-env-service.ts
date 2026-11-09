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
import { ensureUtf8LocaleEnv } from '@codex/shared'
import { workspaceService } from './workspace'
import { workspaceTrustService } from './workspace-trust'

/** Workspace/captured env must not override process identity / loader hooks. */
const BLOCKED_AGENT_ENV_KEYS = new Set([
  'PATH',
  'Path',
  'BASH_ENV',
  'ENV',
  'SHELL',
  'LD_PRELOAD',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'LD_LIBRARY_PATH',
  'NODE_OPTIONS',
  'PYTHONPATH',
  'PERL5OPT',
  'RUBYOPT',
])

function scrubDangerousEnv(env: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (BLOCKED_AGENT_ENV_KEYS.has(key)) continue
    out[key] = value
  }
  return out
}

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
    this.overlay = scrubDangerousEnv(env)
    this.capturedAt = new Date().toISOString()
    const root = workspaceRoot ?? workspaceService.getRoot()
    if (!root) return
    if (!workspaceTrustService.isTrusted(root)) return
    const path = agentEnvCapturedPath(root)
    try {
      mkdirSync(dirname(path), { recursive: true })
      // Mode 0600 — avoid world-readable secrets in captured env dumps.
      const body = Object.entries(this.overlay)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n')
      writeFileSync(path, `${body}\n`, { encoding: 'utf-8', mode: 0o600 })
    } catch {
      // persistence is best-effort; in-memory overlay still applies
    }
  }

  /** Load previously captured file into memory (e.g. after workspace open). */
  hydrateFromWorkspace(workspaceRoot: string): void {
    if (!workspaceTrustService.isTrusted(workspaceRoot)) {
      this.overlay = {}
      this.capturedAt = null
      return
    }
    const fromFile = scrubDangerousEnv(loadEnvFile(agentEnvCapturedPath(workspaceRoot)))
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
    const base = ensureUtf8LocaleEnv(process.env)
    if (!root || !workspaceTrustService.isTrusted(root)) {
      return mergeShellEnv(base)
    }
    return mergeShellEnv(
      base,
      scrubDangerousEnv(loadWorkspaceAgentEnv(root)),
      scrubDangerousEnv(this.overlay),
    )
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
