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
