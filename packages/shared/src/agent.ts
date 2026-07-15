export interface ToolCallRecord {
  id: string
  name: string
  args: unknown
  result?: string
  status: 'running' | 'done' | 'error'
}

export interface AgentConfig {
  sessionId: string
  modelId: string
  maxIterations: number
  enabledTools: string[]
}

export type SessionMode = 'ask' | 'agent' | 'plan'
