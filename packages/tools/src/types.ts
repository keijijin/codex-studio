import type { WorkspaceFs } from './workspace-fs'

export interface JSONSchema {
  type: 'object'
  properties: Record<string, { type: string; description?: string }>
  required?: string[]
  [key: string]: unknown
}

export type ToolExecuteMode = 'preview' | 'apply'

export interface ToolContext {
  workspaceRoot: string
  sessionId: string
  signal: AbortSignal
  executeMode: ToolExecuteMode
  /** Sandboxed file I/O — prefer this over raw fs. */
  fs: WorkspaceFs
  resolvePath: (path: string) => string
  getRelativePath: (absolutePath: string) => string
  /** When set, Glob (and similar) skip paths matching .gitignore / build outputs. */
  isIgnoredPath?: (relativePath: string) => boolean
  onFileChanged?: (absolutePath: string) => void
  /** Hint that workspace files may have changed (e.g. after Shell). */
  onWorkspaceChanged?: () => void
  /** Nested subagent depth (0 = parent). Task tool refuses depth >= 1. */
  subagentDepth?: number
  /** Spawn a read-only investigation subagent (wired by agent-core / app). */
  runSubagent?: (params: {
    prompt: string
    description?: string
  }) => Promise<ToolResult>
  /** Run a named local Agent Team (Phase D). */
  runTeam?: (params: {
    teamId: string
    prompt: string
  }) => Promise<ToolResult>
  /**
   * Environment for Shell (and similar) spawns.
   * Prefer merging process.env + `.codex/agent.env` + terminal-captured overlay.
   */
  getShellEnv?: () => NodeJS.ProcessEnv
  /** Keys/settings for GenerateVideo (wired by Electron main / headless). */
  getVideoConfig?: () => {
    video: import('@codex/shared').VideoSettings
    openaiApiKey?: string
    runwayApiKey?: string
  }
  /** Keys/settings for GeneratePresentation. */
  getPresentationConfig?: () => {
    presentation: import('@codex/shared').PresentationSettings
    openaiApiKey?: string
  }
  /**
   * Default policy for secret paths (`.env`, keys, etc.).
   * Trusted workspaces: `ask`. Untrusted: `deny`. Always-deny paths ignore this.
   */
  secretReadPolicy?: import('./utils/secret-paths').SecretReadPolicy
}

export interface ToolResult {
  success: boolean
  output: string
  metadata?: {
    path?: string
    relativePath?: string
    oldContent?: string
    newContent?: string
    [key: string]: unknown
  }
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: JSONSchema
  requiresApproval: boolean
}

export interface Tool extends ToolDefinition {
  /**
   * Legacy entry. Prefer `preview` / `apply` when present — registry routes by executeMode.
   */
  execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult>
  /** Side-effect free path used before approval when permission is `ask`. */
  preview?(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult>
  /** Mutating path used after approval or when permission is `allow`. */
  apply?(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult>
}
