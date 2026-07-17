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
  resolvePath: (path: string) => string
  getRelativePath: (absolutePath: string) => string
  onFileChanged?: (absolutePath: string) => void
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
  execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult>
}
